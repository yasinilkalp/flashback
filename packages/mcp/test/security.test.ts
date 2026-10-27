import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReceiver, IncidentStore, isAllowedOrigin, type Receiver } from '../src/index.js';
import { draftInput, tmpDir } from './helpers.js';

/** Ham HTTP isteği: başlıkları birebir kontrol etmek için fetch yerine http.request. */
function raw(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string | Buffer },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path ?? '/health', headers: { host: `127.0.0.1:${port}`, ...opts.headers }, setHost: false },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    // Sunucu büyük gövdeyi erken kesebilir; yanıt geldiyse yazma hataları önemsizdir.
    req.on('error', (e) => reject(e));
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

const BROWSER = { origin: 'http://localhost:5173', 'content-type': 'application/json' };

describe('HTTP alıcı güvenliği (FR-RCV-SEC-01…05)', () => {
  let dir: string;
  let store: IncidentStore;
  let receiver: Receiver;
  let port: number;

  beforeAll(async () => {
    dir = tmpDir();
    store = new IncidentStore(dir, { log: () => {} });
    store.init();
    receiver = createReceiver({
      config: { port: 0, host: '127.0.0.1', allowOrigins: ['http://dev.local:3000'], maxBodyBytes: 5 * 1024 * 1024, projectId: 'p1', projectName: 'demo', rateLimitPerMin: 0 },
      store,
      log: () => {},
    });
    port = await receiver.listen();
  });
  afterAll(() => receiver.close());

  it('sahte Host başlığı 421 alır (DNS rebinding)', async () => {
    const r = await raw(port, { headers: { host: `evil.test:${port}`, 'x-flashback-client': 't' } });
    expect(r.status).toBe(421);
    const wrongPort = await raw(port, { headers: { host: '127.0.0.1:1', 'x-flashback-client': 't' } });
    expect(wrongPort.status).toBe(421);
  });

  it('loopback Host varyantları kabul edilir', async () => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]) {
      const r = await raw(port, { headers: { host, 'x-flashback-client': 't' } });
      expect(r.status, host).toBe(200);
    }
  });

  it('Origin ve x-flashback-client yoksa 403 (GET dahil)', async () => {
    expect((await raw(port, {})).status).toBe(403);
    expect((await raw(port, { path: '/incidents' })).status).toBe(403);
  });

  it('izinsiz köken ve Origin: null 403 alır', async () => {
    expect((await raw(port, { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await raw(port, { headers: { origin: 'null' } })).status).toBe(403);
    expect((await raw(port, { headers: { origin: 'http://localhost.evil.example' } })).status).toBe(403);
  });

  it('localhost kökenleri ve FLASHBACK_ALLOW_ORIGINS kabul edilir', async () => {
    const r = await raw(port, { headers: { origin: 'http://localhost:5173' } });
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect((await raw(port, { headers: { origin: 'http://dev.local:3000' } })).status).toBe(200);
    expect(isAllowedOrigin('https://127.0.0.1:8443', [])).toBe(true);
    expect(isAllowedOrigin('http://[::1]:3000', [])).toBe(true);
    expect(isAllowedOrigin('file://', [])).toBe(false);
  });

  it('text/plain POST 415 alır', async () => {
    const r = await raw(port, { method: 'POST', path: '/incidents', headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain' }, body: JSON.stringify(draftInput()) });
    expect(r.status).toBe(415);
  });

  it('6 MB gövde 413 alır', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 'a');
    // Yanıt başlığı gelir gelmez çöz: sunucu gövdenin geri kalanını okumadan bağlantıyı kesebilir.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/incidents', headers: BROWSER }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end(big);
    });
    expect(status).toBe(413);
  });

  it('Content-Length olmadan akan büyük gövde de 413 alır', async () => {
    const r = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method: 'POST', path: '/incidents', headers: { ...BROWSER, 'transfer-encoding': 'chunked' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      const chunk = Buffer.alloc(1024 * 1024, 'a');
      let sent = 0;
      const pump = () => {
        while (sent < 7 && req.write(chunk)) sent++;
        if (sent < 7) req.once('drain', () => (sent++, pump()));
        else req.end();
      };
      pump();
    });
    expect(r).toBe(413);
  });

  it('413 sonrası kalan gövde okunur, soket sıfırlanmaz (macOS/Windows ECONNRESET)', async () => {
    // Sunucu 413'ü yazıp soketi hemen kapatırsa istemcinin yazmaya devam ettiği veri RST üretir. Linux'ta istemci
    // çoğu zaman 413'ü yine okur, macOS/Windows'ta okuyamaz. Bu test RST'yi her platformda doğrudan yakalar.
    const size = 6 * 1024 * 1024;
    const result = await new Promise<{ head: string; error: string | null }>((resolve) => {
      const sock = net.connect(port, '127.0.0.1');
      let head = '';
      let error: string | null = null;
      sock.on('data', (c) => (head += c.toString('latin1')));
      sock.on('error', (e: NodeJS.ErrnoException) => (error = e.code ?? e.message));
      sock.on('connect', () => {
        sock.write(
          `POST /incidents HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: http://localhost:5173\r\n` +
            `Content-Type: application/json\r\nContent-Length: ${size}\r\n\r\n`,
        );
        sock.end(Buffer.alloc(size, 'a'), () => setTimeout(() => (sock.destroy(), resolve({ head, error })), 300));
      });
    });
    expect(result.head.startsWith('HTTP/1.1 413')).toBe(true);
    expect(result.error).toBeNull();
  });

  it('id=../../x 400 alır ve diskte dosya oluşmaz', async () => {
    const before = fs.readdirSync(dir).sort();
    // macOS'ta dosya sistemi büyük/küçük harfe duyarsız: `../../x`, tmpdir'in üstündeki `X` klasörüyle eşleşir.
    // Bu yüzden varlık denetimi yerine üst klasörün içeriğini önce/sonra karşılaştır.
    const grand = path.join(dir, '..', '..');
    const grandBefore = fs.readdirSync(grand).sort();
    for (const p of ['/incidents/..%2F..%2Fx', '/incidents/..%2F..%2Fx/messages', '/incidents/fb-20261027-000000-ab%2F..']) {
      const get = await raw(port, { path: p, headers: { 'x-flashback-client': 't' } });
      expect(get.status, p).toBe(400);
    }
    const post = await raw(port, { method: 'POST', path: '/incidents/..%2F..%2Fx/messages', headers: BROWSER, body: JSON.stringify({ text: 'hi' }) });
    expect(post.status).toBe(400);
    expect(fs.readdirSync(dir).sort()).toEqual(before);
    expect(fs.readdirSync(grand).sort()).toEqual(grandBefore);
  });

  it('geçerli tarayıcı POST 201 alır; şemaya uymayan 400 alır', async () => {
    const ok = await raw(port, { method: 'POST', path: '/incidents', headers: BROWSER, body: JSON.stringify(draftInput()) });
    expect(ok.status).toBe(201);
    const { id } = JSON.parse(ok.body) as { id: string };
    expect(id).toMatch(/^fb-\d{8}-\d{6}-[a-z0-9]{4}$/);
    const stored = store.require(id);
    expect(stored.status).toBe('open');
    expect(stored.projectId).toBe('p1');

    // FR-RCV-06: başka bir proje için gönderilen olay reddedilir ve saklanmaz; doğru proje kabul edilir.
    const countBefore = store.list().length;
    const wrong = await raw(port, { method: 'POST', path: '/incidents', headers: { ...BROWSER, 'x-flashback-project': 'admin-panel' }, body: JSON.stringify(draftInput()) });
    expect(wrong.status).toBe(409);
    expect(wrong.body).toContain('Yanlış proje');
    expect(store.list().length).toBe(countBefore);
    const right = await raw(port, { method: 'POST', path: '/incidents', headers: { ...BROWSER, 'x-flashback-project': 'demo' }, body: JSON.stringify(draftInput()) });
    expect(right.status).toBe(201);

    const bad = await raw(port, { method: 'POST', path: '/incidents', headers: BROWSER, body: JSON.stringify({ ...draftInput(), schemaVersion: 2 }) });
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('schemaVersion');
    const noExpected = await raw(port, { method: 'POST', path: '/incidents', headers: BROWSER, body: JSON.stringify({ ...draftInput(), note: { expected: '' } }) });
    expect(noExpected.status).toBe(400);
  });

  it('CORS preflight yalnızca izinli kökene cevap verir', async () => {
    const pre = {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    };
    const ok = await raw(port, { method: 'OPTIONS', path: '/incidents', headers: { origin: 'http://localhost:5173', ...pre } });
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-headers']).toContain('content-type');
    expect(ok.headers['access-control-allow-headers']).toContain('x-flashback-client');
    expect(ok.headers['access-control-allow-headers']).toContain('x-flashback-project');
    const evil = await raw(port, { method: 'OPTIONS', path: '/incidents', headers: { origin: 'https://evil.example', ...pre } });
    expect(evil.status).toBe(403);
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('API akışı: liste, özet, mesajlar ve yeniden açma', async () => {
    const created = await raw(port, { method: 'POST', path: '/incidents', headers: BROWSER, body: JSON.stringify(draftInput()) });
    const { id } = JSON.parse(created.body) as { id: string };
    const list = JSON.parse((await raw(port, { path: '/incidents', headers: BROWSER })).body) as Array<{ id: string }>;
    expect(list.some((s) => s.id === id)).toBe(true);
    expect((await raw(port, { path: `/incidents/fb-20200101-000000-zzzz`, headers: BROWSER })).status).toBe(404);

    store.update(id, (i) => {
      i.messages.push({ from: 'agent', text: 'Soru?', t: '2020-01-01T00:00:00.000Z' });
      i.pendingQuestion = true;
    });
    const msg = await raw(port, { method: 'POST', path: `/incidents/${id}/messages`, headers: BROWSER, body: JSON.stringify({ text: 'Yanıt' }) });
    expect(msg.status).toBe(201);
    expect(store.require(id).pendingQuestion).toBe(false);
    const since = JSON.parse((await raw(port, { path: `/incidents/${id}/messages?since=2020-01-01T00:00:00.000Z`, headers: BROWSER })).body) as unknown[];
    expect(since).toHaveLength(1);

    expect((await raw(port, { method: 'POST', path: `/incidents/${id}/reopen`, headers: BROWSER, body: '{}' })).status).toBe(409);
    store.update(id, (i) => {
      i.status = 'fixed_unverified';
    });
    const re = await raw(port, { method: 'POST', path: `/incidents/${id}/reopen`, headers: BROWSER, body: JSON.stringify({ reason: 'Test beklentimi kanıtlamıyor' }) });
    expect(re.status).toBe(200);
    expect(JSON.parse(re.body).status).toBe('open');
    expect(store.require(id).reopenedAt).toBeDefined();
  });
});

describe('oran sınırı (FR-RCV-SEC-08)', () => {
  it('dakika başına sınır aşılınca 429', async () => {
    const store = new IncidentStore(tmpDir(), { log: () => {} });
    store.init();
    const receiver = createReceiver({
      config: { port: 0, host: '127.0.0.1', allowOrigins: [], maxBodyBytes: 5 * 1024 * 1024, projectId: 'p', projectName: 'p', rateLimitPerMin: 2 },
      store,
      log: () => {},
    });
    const port = await receiver.listen();
    const post = () => raw(port, { method: 'POST', path: '/incidents', headers: BROWSER, body: JSON.stringify(draftInput()) });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
    await receiver.close();
  });
});
