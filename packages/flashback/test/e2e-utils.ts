/**
 * Uçtan uca test yardımcıları: sahte alıcı, geliştirme sunucuları (Vite, Next.js) ve EK-B3 kaynak çözümleme ölçümü.
 * Test dosyası değildir (vitest yalnızca `*.test.ts` dosyalarını toplar).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IncidentDraftSchema, type IncidentDraft, type IncidentSummary } from '@flashback/shared';
import type { Page } from 'playwright';

export const repo = fileURLToPath(new URL('../../../', import.meta.url));

export interface Receiver {
  url: string;
  drafts: IncidentDraft[];
  rejected: string[];
  down: boolean;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** `flashback-mcp` alıcısının HTTP sözleşmesini (FRD §9.3) taklit eder; POST'u IncidentDraftSchema ile doğrular. */
export async function startReceiver(): Promise<Receiver> {
  const state: Receiver = { url: '', drafts: [], rejected: [], down: false, close: async () => {} };
  const ids: string[] = [];
  const server: Server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (state.down) {
      req.socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {};
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/health') return json(200, { name: 'flashback-mcp', version: 'test', schemaVersion: 1, projectId: 'p1', projectName: 'demo' });
    if (req.method === 'POST' && req.url === '/incidents') {
      if (!String(req.headers['content-type']).startsWith('application/json')) return json(415, { error: 'unsupported_media_type' });
      const parsed = IncidentDraftSchema.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) {
        state.rejected.push(JSON.stringify(parsed.error.issues).slice(0, 2000));
        return json(400, { error: 'schema' });
      }
      state.drafts.push(parsed.data);
      const id = `fb-20261027-1200${String(ids.length).padStart(2, '0')}-test`;
      ids.push(id);
      return json(201, { id });
    }
    if (req.method === 'GET' && req.url === '/incidents') {
      const list: IncidentSummary[] = state.drafts.map((d, i) => ({
        id: ids[i],
        status: 'open',
        createdAt: new Date().toISOString(),
        url: d.context.url,
        note: d.note,
        pendingQuestion: false,
        runs: [],
        messages: [],
      }));
      return json(200, list.reverse());
    }
    return json(404, { error: 'not_found' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((r) => server.close(() => r()));
  return state;
}

export async function freePort(): Promise<number> {
  const s = createHttpServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise((r) => s.close(r));
  return port;
}

export interface DevServer {
  url: string;
  close(): Promise<void>;
}

interface ViteServer {
  listen(): Promise<unknown>;
  close(): Promise<void>;
}

/** Örneğin kendi Vite sürümüyle (kökteki vitest'in Vite'ı değil) süreç içi geliştirme sunucusu. */
export async function startVite(appDir: string, configFile = 'vite.config.ts'): Promise<DevServer> {
  const viteEntry = createRequire(join(appDir, 'package.json')).resolve('vite');
  const { createServer } = (await import(pathToFileURL(viteEntry).href)) as { createServer: (c: object) => Promise<ViteServer> };
  const port = await freePort();
  const vite = await createServer({ root: appDir, configFile: join(appDir, configFile), logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1' } });
  await vite.listen();
  return { url: `http://localhost:${port}`, close: () => vite.close() };
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Next geliştirme sunucusu alt süreç başlatır; ağacın tamamı kapatılır.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

/**
 * `next dev` (Turbopack varsayılan; `webpack: true` → `--webpack`). Next'in JS girişi `process.execPath` ile
 * başlatılır (Windows'ta `npx`/kabuk yok). Her paketleyici ayrı `distDir` kullanır; iki sunucu çakışmaz.
 */
export async function startNext(appDir: string, opts: { webpack: boolean; env?: Record<string, string> }): Promise<DevServer> {
  const nextPkg = createRequire(join(appDir, 'package.json')).resolve('next/package.json');
  const bin = join(dirname(nextPkg), 'dist', 'bin', 'next');
  const port = await freePort();
  const args = [bin, 'dev', ...(opts.webpack ? ['--webpack'] : []), '--port', String(port), '--hostname', '127.0.0.1'];
  const child = spawn(process.execPath, args, {
    cwd: appDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: opts.webpack ? '.next-webpack' : '.next', ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let log = '';
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 150_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next dev çıktı (${child.exitCode}):\n${log}`);
    try {
      // İlk istek sayfayı derler.
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) break;
    } catch {
      /* henüz hazır değil */
    }
    if (Date.now() > deadline) {
      killTree(child);
      throw new Error(`next dev hazır olmadı:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url,
    close: async () => {
      const exited = new Promise<void>((r) => (child.exitCode !== null ? r() : child.once('exit', () => r())));
      killTree(child);
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// EK-B3 ölçümü (FRD §3.5): panelin gerçek yolu — tekrar oynatmada öğe seçilir, panelde gösterilen dosya:satır
// kaynaktaki gerçek JSX satırıyla karşılaştırılır.
// ---------------------------------------------------------------------------------------------------------------

export interface SourceTarget {
  /** Rapor için ad. */
  id: string;
  /** Tekrar oynatma belgesinde öğeyi bulan CSS seçici (ilk eşleşme). */
  css: string;
  /** Uygulama klasörüne göreli, `/` ayraçlı dosya yolu. */
  file: string;
  /** JSX açılış etiketinin satırı (1 tabanlı). */
  line: number;
  /** React Server Component öğesi (ayrı raporlanır). */
  server?: boolean;
}

/** Kaynakta `data-testid="…"` işaretlerinden hedef listesi (her kimlik tek bir JSX satırında yazılı olmalı). */
export function markerTargets(appDir: string, srcDirs: string[], serverPrefix = 'srv-'): SourceTarget[] {
  const out: SourceTarget[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(?:tsx|jsx)$/.test(name)) {
        readFileSync(p, 'utf8')
          .split(/\r?\n/)
          .forEach((text, i) => {
            for (const m of text.matchAll(/data-testid="([^"]+)"/g)) {
              const file = relative(appDir, p).split('\\').join('/');
              if (out.some((t) => t.id === m[1])) throw new Error(`yinelenen işaret: ${m[1]}`);
              out.push({ id: m[1], css: `[data-testid="${m[1]}"]`, file, line: i + 1, server: m[1].startsWith(serverPrefix) });
            }
          });
      }
    }
  };
  for (const d of srcDirs) walk(join(appDir, d));
  return out;
}

/** Elle yazılmış hedef: satır, dosyada `find` metninin geçtiği (tek) satırdır. */
export function findTarget(appDir: string, id: string, css: string, file: string, find: string): SourceTarget {
  const lines = readFileSync(join(appDir, file), 'utf8').split(/\r?\n/);
  const hits = lines.flatMap((l, i) => (l.includes(find) ? [i + 1] : []));
  if (hits.length !== 1) throw new Error(`${file}: "${find}" ${hits.length} kez geçiyor`);
  return { id, css, file, line: hits[0] };
}

/** `ancestor`: panel satırı öğenin değil en yakın atanın JSX'i olarak işaretledi (yanlış sayılmaz, doğru da değil). */
export type Verdict = 'correct' | 'unresolved' | 'ancestor' | 'wrong' | 'missing';

export interface SourceResult extends SourceTarget {
  shown: string;
  /** Panelin gösterdiği seçici (doğru öğenin seçildiğini denetlemek için). */
  selector: string;
  verdict: Verdict;
}

/** Paneldeki `dosya:satır[ (çözülemedi)]` metnini hedefle karşılaştırır. Yanlış satır en kötü sonuçtur. */
export function judge(shown: string, t: SourceTarget): Verdict {
  if (!shown || shown === '—') return 'missing';
  const m = /^(.*):(\d+)(?: \((.+)\))?$/.exec(shown.trim());
  if (!m) return 'missing';
  if (m[3]) return /^(?:ata öğe|ancestor)$/.test(m[3]) ? 'ancestor' : 'unresolved';
  const file = m[1].split('\\').join('/');
  const okFile = file === t.file || file.endsWith(`/${t.file}`);
  return okFile && Number(m[2]) === t.line ? 'correct' : 'wrong';
}

export interface Summary {
  total: number;
  correct: number;
  unresolved: number;
  ancestor: number;
  wrong: number;
  missing: number;
  correctPct: number;
}

export function summarize(results: SourceResult[]): Summary {
  const n = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const total = results.length;
  return { total, correct: n('correct'), unresolved: n('unresolved'), ancestor: n('ancestor'), wrong: n('wrong'), missing: n('missing'), correctPct: total ? Math.round((n('correct') / total) * 1000) / 10 : 0 };
}

export async function openPanel(page: Page): Promise<void> {
  await page.locator('[data-fb="launcher"][data-receiver="connected"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-fb="launcher"]').click();
  await page.locator('[data-fb="panel"]').waitFor();
}

/**
 * Tekrar oynatmada öğenin, `elementFromPoint` ile tam olarak kendisini veren bir noktası (tamsayı sayfa koordinatı).
 * Panel tıklamayı `(clientX - iframe.left) / ölçek` ile geri çevirir; nokta ve ±1,5 px komşuları da aynı öğeyi
 * vermelidir (yuvarlama payı). Kenar boşluğu dar kapsayıcılar için sık bir ızgara taranır.
 */
async function pointFor(page: Page, css: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((selector) => {
    const iframe = document.querySelector('flashback-devtools')!.shadowRoot!.querySelector('iframe')!;
    const doc = iframe.contentDocument!;
    const el = doc.querySelector(selector);
    if (!el) return null;
    const f = iframe.getBoundingClientRect();
    const scale = f.width / iframe.offsetWidth;
    const r = el.getBoundingClientRect();
    const vw = iframe.offsetWidth;
    const vh = iframe.offsetHeight;
    const hits = (px: number, py: number) => {
      const x = (px - f.left) / scale;
      const y = (py - f.top) / scale;
      return x >= 0 && y >= 0 && x < vw && y < vh && doc.elementFromPoint(x, y) === el;
    };
    // Önce orta bölgeler, sonra kenar boşlukları ve ızgara aralıkları için 3 px adımlı tarama.
    const main = [0.5, 0.3, 0.7, 0.1, 0.9];
    const steps = (len: number) => Array.from({ length: Math.max(1, Math.floor(len / 3)) }, (_, i) => (i * 3 + 1.5) / Math.max(len, 1));
    const candidates: Array<[number, number]> = [];
    for (const fy of main) for (const fx of main) candidates.push([fx, fy]);
    for (const fy of main) for (const fx of steps(r.width)) candidates.push([fx, fy]);
    for (const fx of main) for (const fy of steps(r.height)) candidates.push([fx, fy]);
    for (const [fx, fy] of candidates) {
      const px = Math.round(f.left + (r.left + r.width * fx) * scale);
      const py = Math.round(f.top + (r.top + r.height * fy) * scale);
      let ok = true;
      for (const dx of [-1.5, 0, 1.5]) for (const dy of [-1.5, 0, 1.5]) ok &&= hits(px + dx, py + dy);
      if (ok) return { x: px, y: py };
    }
    return null;
  }, css);
}

/**
 * Paneldeki gerçek seçim yolu: "Seç" → tekrar oynatmada öğeye tıkla → panelin gösterdiği kaynak.
 * Her seçimden önce sayfa düzeyi seçime geçilir; böylece önceki seçimin metni yeni sonuçla karışmaz.
 */
export async function pickSource(page: Page, css: string): Promise<string> {
  return (await pick(page, css)).source;
}

async function pick(page: Page, css: string): Promise<{ source: string; selector: string }> {
  await page.locator('[data-fb="page-level"]').click();
  await page.locator('[data-fb="selected-source"]').waitFor({ state: 'detached' });
  await page.locator('[data-fb="select"]').click();
  await page.locator('[data-fb="pick-overlay"]').waitFor();
  const point = await pointFor(page, css);
  if (!point) throw new Error(`tekrar oynatmada tıklanabilir nokta yok: ${css}`);
  await page.mouse.click(point.x, point.y);
  const source = page.locator('[data-fb="selected-source"]');
  await source.waitFor({ timeout: 15_000 });
  return { source: (await source.textContent()) ?? '', selector: (await page.locator('[data-fb="selected-selector"]').textContent()) ?? '' };
}

export async function measureSources(page: Page, targets: SourceTarget[]): Promise<SourceResult[]> {
  const out: SourceResult[] = [];
  for (const t of targets) {
    const { source: shown, selector } = await pick(page, t.css);
    // Panel aynı öğeyi seçmiş olmalı (ölçülen şey tıklama değil çözümleme olsun): panelin ürettiği seçici
    // tekrar oynatma belgesinde hedefle aynı öğeyi bulur.
    const same = await page.evaluate(
      ([a, b]) => {
        const doc = document.querySelector('flashback-devtools')!.shadowRoot!.querySelector('iframe')!.contentDocument!;
        try {
          return doc.querySelector(a) === doc.querySelector(b);
        } catch {
          return null; // CSS dışı (Playwright rol) seçici: denetlenemez
        }
      },
      [selector, t.css] as const,
    );
    if (same === false) throw new Error(`yanlış öğe seçildi: ${t.css} → ${selector}`);
    out.push({ ...t, shown, selector, verdict: judge(shown, t) });
  }
  return out;
}

export function formatResults(label: string, results: SourceResult[]): string {
  const rows = results.map((r) => `  ${r.verdict.padEnd(10)} ${r.id.padEnd(16)} beklenen ${r.file}:${r.line}  gösterilen ${r.shown || '—'}  (${r.selector})`);
  return [`[EK-B3] ${label}: ${JSON.stringify(summarize(results))}`, ...rows].join('\n');
}

/** Seçili öğe için "Ne olmalıydı?" doldurulur, önizleme geçilir ve gönderilir; alıcıya ulaşan taslak döner. */
export async function sendSelected(page: Page, receiver: Receiver, expected = 'Doğru değer gösterilmeli.'): Promise<IncidentDraft> {
  const before = receiver.drafts.length;
  await page.locator('[data-fb="expected"]').fill(expected);
  await page.locator('[data-fb="save"]').click();
  // Önizleme oturumdaki ilk gönderimde zorunludur; sonrakiler doğrudan gönderilir.
  const preview = page.locator('[data-fb="preview-view"]');
  const sent = page.locator('[data-fb="incident-id"]');
  await preview.or(sent).first().waitFor({ timeout: 15_000 });
  if (await preview.isVisible()) await page.locator('[data-fb="send"]').click();
  await sent.waitFor({ timeout: 15_000 });
  if (receiver.rejected.length) throw new Error(`alıcı reddetti: ${receiver.rejected.join('\n')}`);
  if (receiver.drafts.length !== before + 1) throw new Error('taslak alıcıya ulaşmadı');
  return receiver.drafts[receiver.drafts.length - 1];
}

/** Uygulamayı açar, Flashback düğmesini ve kaydın birikmesini bekler. */
export async function openApp(page: Page, url: string, waitMs = 1500): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator('[data-fb="launcher"]').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  return errors;
}
