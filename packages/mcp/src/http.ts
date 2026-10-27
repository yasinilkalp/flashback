import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import {
  CLIENT_HEADER,
  IncidentDraftSchema,
  LIMITS,
  MessageSchema,
  SCHEMA_VERSION,
  truncateText,
  type HealthResponse,
  type IncidentDraft,
} from '@rewind/shared';
import type { RewindConfig } from './config.js';
import { RewindError } from './errors.js';
import { applyReopen, toSummary } from './lifecycle.js';
import { QuotaError, type IncidentStore } from './store.js';
import { VERSION } from './version.js';

export interface ReceiverOptions {
  config: Pick<RewindConfig, 'port' | 'host' | 'allowOrigins' | 'maxBodyBytes' | 'projectId' | 'projectName' | 'rateLimitPerMin'>;
  store: IncidentStore;
  log?: (msg: string) => void;
  now?: () => Date;
}

export interface Receiver {
  server: http.Server;
  /** Dinlemeye başlar; gerçek portu döndürür (port 0 → geçici port). */
  listen(): Promise<number>;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const LOCAL_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** FR-RCV-SEC-02: localhost kökenleri (her port, http/https) ve REWIND_ALLOW_ORIGINS. */
export function isAllowedOrigin(origin: string, allowOrigins: string[]): boolean {
  if (origin === 'null') return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false; // yol, kullanıcı bilgisi vb. içeren değer köken değildir
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_ORIGIN_HOSTS.has(u.hostname)) return true;
  return allowOrigins.includes(u.origin);
}

/** FR-RCV-SEC-01: Host yalnızca loopback adı + dinlenen port olabilir (DNS rebinding önlemi). */
export function isAllowedHost(hostHeader: string | undefined, port: number, extraHost?: string): boolean {
  if (!hostHeader) return false;
  const h = hostHeader.toLowerCase();
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (extraHost) allowed.push(`${extraHost.includes(':') ? `[${extraHost}]` : extraHost}:${port}`.toLowerCase());
  return allowed.includes(h);
}

/** Kaydedilen alanları LIMITS'e göre kırpar (NFR-SIZE-01). */
function clampDraft(d: IncidentDraft): IncidentDraft {
  const cap = (s: string | undefined) => (s === undefined ? s : truncateText(s, LIMITS.bodyBytes).text);
  return {
    ...d,
    network: d.network.map((n) => {
      const rq = n.reqBody === undefined ? undefined : truncateText(n.reqBody, LIMITS.bodyBytes);
      const rs = n.resBody === undefined ? undefined : truncateText(n.resBody, LIMITS.bodyBytes);
      const truncated = n.truncated || !!rq?.truncated || !!rs?.truncated;
      return {
        ...n,
        reqBody: rq?.text,
        resBody: rs?.text,
        truncated,
        bodySize: n.bodySize ?? (rs?.truncated ? rs.size : undefined),
      };
    }),
    console: d.console.map((c) => ({ ...c, message: cap(c.message)!, stack: cap(c.stack) })),
    target: d.target ? { ...d.target, html: cap(d.target.html), text: cap(d.target.text) } : null,
    domSnapshot: truncateText(d.domSnapshot, LIMITS.domBytes).text,
  };
}

const MessageBody = z.object({ text: z.string().min(1).max(10_000) });
const ReopenBody = z.object({ reason: z.string().max(10_000).optional() });

/** Tarayıcı ↔ rewind-mcp HTTP alıcısı (FRD §9.3, docs/IMPLEMENTATION.md). */
export function createReceiver(opts: ReceiverOptions): Receiver {
  const { config, store } = opts;
  const log = opts.log ?? ((m: string) => process.stderr.write(`[rewind-mcp] ${m}\n`));
  const now = opts.now ?? (() => new Date());
  let boundPort = config.port;
  const extraHost = config.host === '127.0.0.1' || config.host === 'localhost' || config.host === '::1' ? undefined : config.host;
  const recent: number[] = [];

  function send(res: http.ServerResponse, status: number, body: unknown) {
    if (res.headersSent) return;
    const json = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(json);
  }

  function readBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<string> {
    const limit = config.maxBodyBytes;
    const declared = Number(req.headers['content-length']);
    // Gövde sınırı aşılırsa hemen 413 döner, gövde artık saklanmaz (FR-RCV-SEC-05). Kalan veri okunup atılır:
    // okunmamış veri varken soketi kapatmak TCP RST'ye yol açar; macOS ve Windows RST'yi okunmamış 413 yanıtından
    // önce işler ve istemci 413 yerine ECONNRESET görür. Bu yüzden `connection: close` gönderilmez (Node o durumda
    // yanıt biter bitmez soketi kapatır). Gövde 2 sn içinde bitmezse (yavaş/sonsuz akış) bağlantı kesilir.
    const tooLarge = () => {
      send(res, 413, { error: `Gövde ${Math.round(limit / 1048576)} MB sınırını aşıyor (REWIND_MAX_BODY_MB).` });
      req.resume();
      const timer = setTimeout(() => {
        if (!req.complete) req.destroy();
      }, 2000).unref();
      req.once('end', () => clearTimeout(timer));
      return new HttpError(413, 'too large');
    };
    if (Number.isFinite(declared) && declared > limit) return Promise.reject(tooLarge());
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let failed = false;
      req.on('data', (c: Buffer) => {
        if (failed) return;
        size += c.length;
        if (size > limit) {
          failed = true;
          reject(tooLarge());
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => !failed && resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', (e) => !failed && reject(e));
    });
  }

  async function readJson(req: http.IncomingMessage, res: http.ServerResponse): Promise<unknown> {
    const ct = String(req.headers['content-type'] ?? '').toLowerCase();
    if (!/^application\/json\s*(;|$)/.test(ct)) throw new HttpError(415, 'Content-Type: application/json zorunlu.');
    const raw = await readBody(req, res);
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Gövde geçerli JSON değil.');
    }
  }

  function rateLimited(): boolean {
    if (!config.rateLimitPerMin) return false;
    const t = Date.now();
    while (recent.length && recent[0] <= t - 60_000) recent.shift();
    if (recent.length >= config.rateLimitPerMin) return true;
    recent.push(t);
    return false;
  }

  async function route(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, search: URLSearchParams) {
    const method = req.method ?? 'GET';
    if (pathname === '/health' && method === 'GET') {
      const body: HealthResponse = {
        name: 'rewind-mcp',
        version: VERSION,
        schemaVersion: SCHEMA_VERSION,
        projectId: config.projectId,
        projectName: config.projectName,
      };
      return send(res, 200, body);
    }
    if (pathname === '/incidents') {
      if (method === 'GET') return send(res, 200, store.list().map(toSummary));
      if (method === 'POST') {
        const body = await readJson(req, res);
        if (rateLimited()) throw new HttpError(429, 'Çok fazla olay (REWIND_RATE_LIMIT_PER_MIN).');
        const parsed = IncidentDraftSchema.safeParse(body);
        if (!parsed.success) throw new HttpError(400, `Olay şemaya uymuyor:\n${z.prettifyError(parsed.error)}`);
        try {
          const inc = store.create(clampDraft(parsed.data), config.projectId);
          log(`Yeni olay: ${inc.id}`);
          return send(res, 201, { id: inc.id });
        } catch (e) {
          if (e instanceof QuotaError) throw new HttpError(507, e.message);
          throw e;
        }
      }
      throw new HttpError(405, 'Yöntem desteklenmiyor.');
    }
    const m = /^\/incidents\/([^/]+)(\/messages|\/reopen)?$/.exec(pathname);
    if (!m) throw new HttpError(404, 'Bulunamadı.');
    let id: string;
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      throw new HttpError(400, 'Geçersiz olay kimliği.');
    }
    store.resolvePath(id); // invalid_id → 400 (FR-RCV-SEC-04)
    const sub = m[2];
    if (!sub && method === 'GET') return send(res, 200, toSummary(store.require(id)));
    if (sub === '/messages' && method === 'GET') {
      const since = search.get('since');
      const msgs = store.require(id).messages.filter((x) => !since || x.t > since);
      return send(res, 200, msgs);
    }
    if (sub === '/messages' && method === 'POST') {
      const parsed = MessageBody.safeParse(await readJson(req, res));
      if (!parsed.success) throw new HttpError(400, `Mesaj geçersiz:\n${z.prettifyError(parsed.error)}`);
      const msg = MessageSchema.parse({ from: 'dev', text: parsed.data.text, t: now().toISOString() });
      store.update(id, (inc) => {
        inc.messages.push(msg);
        inc.pendingQuestion = false;
      });
      return send(res, 201, msg);
    }
    if (sub === '/reopen' && method === 'POST') {
      const parsed = ReopenBody.safeParse(await readJson(req, res));
      if (!parsed.success) throw new HttpError(400, `Gövde geçersiz:\n${z.prettifyError(parsed.error)}`);
      const inc = store.update(id, (i) => applyReopen(i, parsed.data.reason?.trim() ?? '', now()));
      return send(res, 200, toSummary(inc));
    }
    throw new HttpError(405, 'Yöntem desteklenmiyor.');
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // 1) Host doğrulaması (FR-RCV-SEC-01)
    if (!isAllowedHost(req.headers.host, boundPort, extraHost)) {
      return send(res, 421, { error: 'Host başlığı loopback değil.' });
    }
    // 2) Köken denetimi (FR-RCV-SEC-02)
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!isAllowedOrigin(origin, config.allowOrigins)) return send(res, 403, { error: 'Köken izinli değil.' });
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
    } else if (req.method !== 'OPTIONS' && !req.headers[CLIENT_HEADER]) {
      return send(res, 403, { error: `Origin yoksa ${CLIENT_HEADER} başlığı zorunlu.` });
    }
    // 3) CORS preflight: yalnızca izinli kökenler
    if (req.method === 'OPTIONS') {
      if (origin === undefined) return send(res, 403, { error: 'Preflight için Origin gerekli.' });
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', `content-type, ${CLIENT_HEADER}`);
      res.setHeader('access-control-max-age', '600');
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('access-control-allow-private-network', 'true');
      }
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      await route(req, res, url.pathname, url.searchParams);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof RewindError) {
        const status =
          e.code === 'invalid_id' ? 400 : e.code === 'incident_not_found' ? 404 : e.code === 'invalid_transition' ? 409 : 500;
        return send(res, status, { error: e.message, code: e.code });
      }
      log(`Alıcı hatası: ${(e as Error).stack ?? e}`);
      return send(res, 500, { error: 'Sunucu hatası.' });
    }
  }

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });
  server.requestTimeout = 30_000;

  return {
    server,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        const onError = (e: Error) => reject(e);
        server.once('error', onError);
        server.listen(config.port, config.host, () => {
          server.off('error', onError);
          boundPort = (server.address() as AddressInfo).port;
          resolve(boundPort);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
