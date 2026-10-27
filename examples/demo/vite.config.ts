import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin } from 'vite';

/**
 * Demo API'si: Vite ile aynı süreçte çalışan ara katman. Kasıtlı hatalar için bkz. BUGS.md.
 * `REWIND_DEMO_DETERMINISTIC=1` sunucuyu belirlenimci yapar (sabit oturum kimliği), e2e testleri bunu kullanır.
 */
const PRODUCTS = [
  { id: 1, name: 'Seramik kupa', price: 250 },
  { id: 2, name: 'Noktalı defter', price: 500 },
  { id: 3, name: 'Kanvas çanta', price: 750 },
];

const ORDERS = [
  { id: 'S-1001', total: 750, date: '2026-09-02' },
  { id: 'S-1002', total: 1250, date: '2026-09-14' },
  { id: 'S-1003', total: 500, date: '2026-10-01' },
  { id: 'S-1004', total: 1500, date: '2026-10-19' },
];

const DEMO_USER = { email: 'demo@example.com', password: 'demo1234' };

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

function demoApi(): Plugin {
  const deterministic = process.env.REWIND_DEMO_DETERMINISTIC === '1';
  const sessions = new Set<string>();

  const handle: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'GET /api/products':
        return send(res, 200, PRODUCTS);
      case 'GET /api/shipping':
        // Kasıtlı hata (YAZ10 kök nedeni): ücret sayı değil metin döner.
        return send(res, 200, { fee: '30' });
      case 'POST /api/coupon':
        return void readJson(req).then(({ code }) => {
          if (code === 'YAZ10') return send(res, 200, { code, discount: 0.1 });
          // Kasıtlı hata (KIS20): sunucu 500 döner.
          if (code === 'KIS20') return send(res, 500, { error: 'internal' });
          return send(res, 400, { error: 'invalid_coupon' });
        });
      case 'POST /api/login':
        return void readJson(req).then(({ email, password }) => {
          if (email !== DEMO_USER.email || password !== DEMO_USER.password) return send(res, 401, { error: 'invalid_credentials' });
          const sid = deterministic ? 'demo-session' : randomUUID();
          sessions.add(sid);
          return send(res, 200, { user: { email } }, { 'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; SameSite=Lax` });
        });
      case 'GET /api/orders': {
        const sid = cookie(req, 'sid');
        if (!sid || !sessions.has(sid)) return send(res, 401, { error: 'unauthorized' });
        return send(res, 200, { orders: ORDERS });
      }
      default:
        if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not_found' });
        return next();
    }
  };

  return {
    name: 'rewind-demo-api',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

export default defineConfig({
  plugins: [react(), demoApi()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // rewind-devtools çalışma alanından (dist) gelir; bağımlılıkları baştan ön paketlensin ki ilk açılışta yeniden yükleme olmasın.
  optimizeDeps: { include: ['rrweb', 'source-map-js', 'zustand', 'react', 'react-dom/client', 'react/jsx-dev-runtime'] },
  server: { port: 5173, strictPort: true },
});
