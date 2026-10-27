/**
 * Bench sunucuları:
 *  - Vite geliştirme sunucusu: `demo` (examples/demo, değiştirilmeden) ya da `list` (scripts/bench/fixture).
 *    Kayıt KAPALI kipte `flashback-devtools` → `packages/flashback/dist/noop.js` (üretim derlemesiyle aynı: kaydedici yok).
 *    Kayıt AÇIK kipte sayfaya yalnızca ölçüm için `window.__benchRecord = record` (rrweb) eklenir; bu, Flashback'in
 *    kullandığı rrweb örneğiyle AYNI modüldür (tek optimize edilmiş bağımlılık) ve checkout tespiti/ölçümü içindir.
 *  - Gerçek alıcı: `packages/mcp/dist/cli.js` (stdio MCP + HTTP alıcı), MCP istemcisiyle "ajan" olarak bağlanılır.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BENCH, REPO, freePort, sleep } from './common.mjs';

const require = createRequire(import.meta.url);
const NOOP = join(REPO, 'packages/flashback/dist/noop.js');
/** Vite `/@fs/` yolu (Windows'ta da ileri eğik çizgi). */
const PROBE = join(BENCH, 'lib', 'probe.js').replace(/\\/g, '/').replace(/^\//, '');
/** Ayrıştırma kipi: yalnızca rrweb (Flashback'in seçenekleriyle), bkz. lib/shim-rrweb.js. */
const SHIM = join(BENCH, 'lib', 'shim-rrweb.js');

const PAGES = {
  demo: { root: join(REPO, 'examples/demo'), configFile: join(REPO, 'examples/demo/vite.config.ts'), path: '/' },
  list: { root: join(BENCH, 'fixture'), configFile: false, path: '/' },
};

async function loadVite() {
  // Demo'nun kendi Vite sürümü (examples/demo bağımlılığı); kök node_modules'taki sürüm farklı olabilir.
  const entry = createRequire(join(REPO, 'examples/demo/package.json')).resolve('vite');
  return import(pathToFileURL(entry).href);
}

function benchPlugin(mode) {
  return {
    name: 'flashback-bench',
    enforce: 'pre',
    config() {
      if (mode === 'on') return {};
      return { resolve: { alias: [{ find: /^flashback-devtools$/, replacement: mode === 'off' ? NOOP : SHIM }] } };
    },
    transformIndexHtml() {
      if (mode === 'off') return [];
      return [{ tag: 'script', attrs: { type: 'module', src: `/@fs/${PROBE}` }, injectTo: 'head' }];
    },
  };
}

/**
 * @param {{ page: 'demo'|'list', mode: 'on'|'off'|'rrweb', endpoint?: string }} o
 *   on = gerçek flashback-devtools (dist) · off = dist/noop.js (kaydedici yok) · rrweb = yalnızca rrweb (ayrıştırma)
 * @returns {Promise<{ url: string, query: string, close(): Promise<void> }>}
 */
export async function startVite({ page, mode, endpoint }) {
  const spec = PAGES[page];
  if (!spec) throw new Error(`bilinmeyen sayfa: ${page}`);
  const { createServer } = await loadVite();
  // Demo, alıcı adresini VITE_FLASHBACK_ENDPOINT'ten okur (e2e testindeki gibi).
  if (endpoint) process.env.VITE_FLASHBACK_ENDPOINT = endpoint;
  const port = await freePort();
  const cacheDir = join(os.tmpdir(), `flashback-bench-vite-${page}-${mode}`);
  const server = await createServer({
    root: spec.root,
    configFile: spec.configFile,
    cacheDir,
    logLevel: 'error',
    clearScreen: false,
    plugins: [benchPlugin(mode)],
    server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
    optimizeDeps: {
      include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', ...(mode !== 'off' ? ['rrweb', 'rrweb-snapshot', 'source-map-js'] : [])],
    },
    define: page === 'list' ? { 'process.env.NODE_ENV': JSON.stringify('development') } : undefined,
  });
  await server.listen();
  const q = page === 'list' && endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  return {
    url: `http://localhost:${port}${spec.path}`,
    query: q,
    close: () => server.close(),
  };
}

/** Gerçek flashback-mcp (stdio MCP + HTTP alıcı). `call(name, args)` ajanın araç çağrısıdır. */
export async function startReceiver() {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const root = mkdtempSync(join(os.tmpdir(), 'flashback-bench-project-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'flashback-bench-project', private: true }));
  const port = await freePort();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(REPO, 'packages/mcp/dist/cli.js')],
    cwd: root,
    env: {
      ...process.env,
      FLASHBACK_PORT: String(port),
      FLASHBACK_PROJECT_ROOT: root,
      FLASHBACK_RATE_LIMIT_PER_MIN: '0',
      FLASHBACK_NO_IMAGES: '1',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'flashback-bench-agent', version: '1.0.0' });
  await client.connect(transport);
  const endpoint = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${endpoint}/health`, { headers: { 'x-flashback-client': 'bench' } });
      if (r.ok) break;
    } catch {
      /* henüz değil */
    }
    await sleep(100);
  }
  return {
    endpoint,
    root,
    call: (name, args) => client.callTool({ name, arguments: args }),
    async close() {
      await client.close().catch(() => {});
      rmSync(root, { recursive: true, force: true });
    },
  };
}
