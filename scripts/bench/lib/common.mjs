/** Bench ortak yardımcıları: argümanlar, istatistik, ortam bilgisi, sonuç dosyası. */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const BENCH = join(REPO, 'scripts', 'bench');
export const RESULTS_DIR = join(BENCH, 'results');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `--runs=5 --throttle=1,4 --pages=demo,list --quick` biçimindeki argümanlar.
 * Ortam değişkeni karşılıkları: BENCH_RUNS, BENCH_THROTTLE, BENCH_PAGES, BENCH_QUICK=1.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? true;
  }
  const env = (k) => process.env[`BENCH_${k.toUpperCase()}`];
  const list = (k, d) => String(out[k] ?? env(k) ?? d).split(',').filter(Boolean);
  return {
    raw: out,
    quick: Boolean(out.quick ?? env('quick') === '1'),
    runs: Number(out.runs ?? env('runs') ?? 5),
    throttles: list('throttle', '1,4').map(Number),
    pages: list('pages', 'demo,list'),
    out: out.out ?? env('out'),
  };
}

/** Sıralı dizide en yakın sıra yöntemiyle yüzdelik (küçük örneklemde muhafazakâr: p95 ≈ en büyük). */
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return Number.NaN;
  const rank = Math.ceil((p / 100) * v.length);
  return v[Math.min(v.length - 1, Math.max(0, rank - 1))];
}

export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x));
  return {
    n: v.length,
    min: v.length ? Math.min(...v) : Number.NaN,
    median: percentile(v, 50),
    p75: percentile(v, 75),
    p95: percentile(v, 95),
    max: v.length ? Math.max(...v) : Number.NaN,
    mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN,
  };
}

export const round = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

export function roundDeep(o, d = 1) {
  if (typeof o === 'number') return round(o, d);
  if (Array.isArray(o)) return o.map((x) => roundDeep(x, d));
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundDeep(v, d)]));
  return o;
}

/** Belirlenimci sözde rastgele sayı üreteci. */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

export async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Ölçüm ortamı (CPU, Node, Chromium, Playwright, paket derlemesi). */
export function environment(browserVersion) {
  const cpus = os.cpus();
  const pkg = (p) => safe(() => JSON.parse(readFileSync(join(REPO, p), 'utf8')).version);
  const dist = join(REPO, 'packages/flashback/dist/index.js');
  return {
    date: new Date().toISOString(),
    os: `${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`,
    cpu: `${cpus[0]?.model ?? '?'} × ${cpus.length}`,
    memoryGB: round(os.totalmem() / 2 ** 30, 1),
    node: process.version,
    chromium: browserVersion,
    playwright: pkg('node_modules/playwright/package.json'),
    rrweb: pkg('node_modules/rrweb/package.json'),
    flashbackDevtools: pkg('packages/flashback/package.json'),
    flashbackDistBuiltAt: existsSync(dist) ? statSync(dist).mtime.toISOString() : null,
    git: safe(() => execSync('git rev-parse --short HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()),
  };
}

export function requireBuild() {
  for (const f of ['packages/flashback/dist/index.js', 'packages/flashback/dist/noop.js', 'packages/mcp/dist/cli.js']) {
    if (!existsSync(join(REPO, f))) {
      throw new Error(`${f} yok. Önce: npm run build (ya da npm run build -w @flashback/shared && npm run build -w flashback-devtools && npm run build -w flashback-mcp)`);
    }
  }
}

/** Sonucu `results/<ad>-<zaman>.json` ve `results/<ad>-latest.json` olarak yazar. */
export function writeResult(name, data, outPath) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const body = JSON.stringify(roundDeep(data, 2), null, 2);
  const file = outPath ?? join(RESULTS_DIR, `${name}-${stamp}.json`);
  writeFileSync(file, body);
  writeFileSync(join(RESULTS_DIR, `${name}-latest.json`), body);
  return file;
}

export function log(...a) {
  console.log(`[bench ${new Date().toISOString().slice(11, 19)}]`, ...a);
}

/** Betik doğrudan çalıştırıldı mı? (Windows yolları dahil) */
export function isMain(metaUrl) {
  return !!process.argv[1] && pathToFileURL(process.argv[1]).href === metaUrl;
}
