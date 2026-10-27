/**
 * Uçtan uca ürün akışı (FRD §12 KK-1, KK-2, KK-3):
 *
 *   gerçek demo (Vite) + gerçek <Rewind/> paneli + gerçek `rewind-mcp` (stdio MCP + HTTP alıcı, tek süreç)
 *   → geliştirici panelde olayı işaretleyip gönderir
 *   → "ajan" MCP istemcisi olayı okur, run_repro ile KIRMIZI üretir
 *   → demo kaynağındaki BUG satırı düzeltilir (BUGS.md)
 *   → aynı assertion ile iki kez YEŞİL → mark_fixed → `fixed`
 *   → panelin Kayıtlar sekmesi not ile assertion'ı yan yana ve "doğrulandı" durumunu gösterir.
 *
 * Demo, her koşuda depo içinde geçici bir kopyaya (`examples/e2e-tmp-*`) alınır; asıl kaynak değişmez.
 * Önkoşul: `npm run build` (rewind-devtools ve rewind-mcp dist'ten kullanılır).
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Incident } from '@rewind/shared';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const demoSrc = join(repo, 'examples/demo');
const cli = join(repo, 'packages/mcp/dist/cli.js');

interface ViteServer {
  listen(): Promise<unknown>;
  close(): Promise<void>;
}

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

async function freePort(): Promise<number> {
  const s = createHttpServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise((r) => s.close(r));
  return port;
}

const textOf = (r: ToolResult) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

/** BUGS.md'deki tek satırlık düzeltmeyi uygular: `// BUG(<ad>)` işaretli satırı değiştirir. */
function applyFix(file: string, bug: string, replacement: string) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const i = lines.findIndex((l) => l.includes(`// BUG(${bug})`));
  if (i === -1) throw new Error(`BUG(${bug}) satırı bulunamadı: ${file}`);
  const indent = lines[i].match(/^\s*/)![0];
  lines[i] = indent + replacement;
  writeFileSync(file, lines.join('\n'));
}

describe.runIf(process.env.REWIND_E2E)('Rewind uçtan uca: panel → MCP → kırmızı → düzelt → yeşil → fixed', () => {
  let work: string;
  let vite: ViteServer;
  let browser: Browser;
  let context: BrowserContext;
  let base: string;
  let receiverPort: number;
  let mcp: Client | undefined;

  async function startMcp(env: Record<string, string> = {}) {
    await mcp?.close();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cli],
      cwd: work,
      env: {
        ...(process.env as Record<string, string>),
        REWIND_PORT: String(receiverPort),
        REWIND_PROJECT_ROOT: work,
        REWIND_NO_IMAGES: '1',
        ...env,
      },
      stderr: 'pipe',
    });
    mcp = new Client({ name: 'e2e-agent', version: '1.0.0' });
    await mcp.connect(transport);
    // Alıcı hazır olana dek bekle.
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${receiverPort}/health`, { headers: { 'x-rewind-client': 'e2e' } });
        if (r.ok) return;
      } catch {
        /* henüz değil */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('rewind-mcp alıcısı başlamadı');
  }

  const call = async (name: string, args: Record<string, unknown>) => (await mcp!.callTool({ name, arguments: args })) as ToolResult;

  const readIncident = (id: string) => JSON.parse(readFileSync(join(work, '.rewind', `${id}.json`), 'utf8')) as Incident;

  beforeAll(async () => {
    for (const f of ['packages/rewind/dist/index.js', 'packages/mcp/dist/cli.js']) {
      if (!existsSync(join(repo, f))) throw new Error(`${f} yok: önce \`npm run build\``);
    }
    // Demo'nun geçici kopyası (düzeltmeler buraya uygulanır). node_modules demo'nunkine bağlanır.
    work = mkdtempSync(join(repo, 'examples', 'e2e-tmp-'));
    cpSync(demoSrc, work, { recursive: true, filter: (p) => !p.includes('node_modules') && !p.includes('.rewind') });
    if (existsSync(join(demoSrc, 'node_modules'))) symlinkSync(join(demoSrc, 'node_modules'), join(work, 'node_modules'), 'dir');

    receiverPort = await freePort();
    await startMcp();

    process.env.VITE_REWIND_ENDPOINT = `http://127.0.0.1:${receiverPort}`;
    process.env.REWIND_DEMO_DETERMINISTIC = '1';
    const viteEntry = createRequire(join(demoSrc, 'package.json')).resolve('vite');
    const { createServer } = (await import(pathToFileURL(viteEntry).href)) as { createServer: (c: object) => Promise<ViteServer> };
    const port = await freePort();
    vite = await createServer({
      root: work,
      configFile: join(work, 'vite.config.ts'),
      logLevel: 'error',
      server: { port, strictPort: true, host: '127.0.0.1' },
    });
    await vite.listen();
    base = `http://localhost:${port}`;
    browser = await chromium.launch();
    context = await browser.newContext({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
  });

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await mcp?.close();
    if (work) rmSync(work, { recursive: true, force: true });
  });

  async function openApp(path = '/'): Promise<Page> {
    const page = await context.newPage();
    await page.goto(base + path);
    await page.locator('[data-rw="launcher"]').waitFor();
    return page;
  }

  async function fillCart(page: Page, coupon: string) {
    for (const id of [1, 2, 3]) await page.getByTestId(`add-${id}`).click();
    await expect.poll(() => page.getByTestId('subtotal').textContent()).toBe('1500 ₺');
    await page.locator('#coupon').fill(coupon);
    const response = page.waitForResponse((r) => r.url().endsWith('/api/coupon'));
    await page.getByRole('button', { name: 'Uygula' }).click();
    await response;
  }

  async function openPanel(page: Page) {
    await page.locator('[data-rw="launcher"][data-receiver="connected"]').waitFor({ timeout: 10_000 });
    await page.keyboard.press('Alt+Shift+KeyR');
    await page.locator('[data-rw="panel"]').waitFor();
  }

  async function send(page: Page): Promise<string> {
    await page.locator('[data-rw="save"]').click();
    const preview = page.locator('[data-rw="preview-view"]');
    if (await preview.isVisible().catch(() => false)) await page.locator('[data-rw="send"]').click();
    else {
      await preview.waitFor({ timeout: 2000 }).catch(() => undefined);
      if (await preview.isVisible()) await page.locator('[data-rw="send"]').click();
    }
    const idEl = page.locator('[data-rw="incident-id"]');
    await idEl.waitFor();
    const id = (await idEl.textContent())!.match(/rw-\d{8}-\d{6}-[a-z0-9]{4}/)![0];
    return id;
  }

  async function pickInReplay(page: Page, testId: string) {
    await page.keyboard.press('s');
    await page.locator('[data-rw="pick-overlay"]').waitFor();
    const point = await page.evaluate((tid) => {
      const iframe = document.querySelector('rewind-devtools')!.shadowRoot!.querySelector('iframe')!;
      const el = iframe.contentDocument!.querySelector(`[data-testid="${tid}"]`)!;
      const f = iframe.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      const scale = f.width / iframe.offsetWidth;
      return { x: f.left + (e.left + e.width / 2) * scale, y: f.top + (e.top + e.height / 2) * scale };
    }, testId);
    await page.mouse.click(point.x, point.y);
  }

  /** Ajanın kırmızı → düzelt → yeşil → yeşil → mark_fixed döngüsü. */
  async function agentLoop(id: string, assertion: string, fix: () => void) {
    const red = await call('run_repro', { id, assertions: assertion });
    expect(textOf(red), textOf(red)).toContain('Sonuç: failed_assertion');
    expect(textOf(red)).toContain('Hata yeniden üretildi');

    // Doğrulanmadan kapatma denemesi (yalnızca kırmızı var) → gerekçe zorunlu.
    const early = await call('mark_fixed', { id, resolution: 'fixed', summary: 'deneme' });
    expect(early.isError).toBe(true);
    expect(textOf(early)).toContain('reason_required');

    fix();
    await new Promise((r) => setTimeout(r, 500)); // Vite dosya değişikliğini görsün

    for (let i = 0; i < 2; i++) {
      const green = await call('run_repro', { id, assertions: assertion });
      expect(textOf(green), textOf(green)).toContain('Sonuç: passed');
    }
    const closed = await call('mark_fixed', { id, resolution: 'fixed', summary: 'Kök neden düzeltildi.' });
    expect(textOf(closed)).toContain('doğrulanmış olarak kapandı');
    const inc = readIncident(id);
    expect(inc.status).toBe('fixed');
    expect(inc.repros.map((r) => r.status)).toEqual(['failed_assertion', 'passed', 'passed']);
    expect(new Set(inc.repros.map((r) => r.signature)).size).toBe(1);
  }

  it('KK-1 / YAZ10: öğe olayı → rapor Cart.tsx satırını verir → kırmızı → düzelt → yeşil ×2 → fixed; panel doğrulandı gösterir', async () => {
    const page = await openApp();
    await fillCart(page, 'YAZ10');
    await expect.poll(() => page.getByTestId('total').textContent()).toBe('135030 ₺');
    await page.waitForTimeout(1200);
    await openPanel(page);
    await page.locator('[data-rw="back"]').click();
    await pickInReplay(page, 'total');
    await expect.poll(() => page.locator('[data-rw="selected-source"]').textContent(), { timeout: 10_000 }).toContain('Cart.tsx');
    await page.locator('[data-rw="expected"]').fill('Toplam 1380 ₺ olmalı.');
    const id = await send(page);

    // Ajan: listele → oku.
    const list = textOf(await call('list_incidents', {}));
    expect(list).toContain(id);
    const report = textOf(await call('get_incident', { id }));
    const totalLine = readFileSync(join(work, 'src/Cart.tsx'), 'utf8').split('\n').findIndex((l) => l.includes('data-testid="total"')) + 1;
    expect(report).toContain(`src/Cart.tsx:${totalLine}`);
    expect(report).toContain('Toplam 1380 ₺ olmalı.');
    expect(report).toContain('Kanıt güveni');
    expect(report).toContain('/api/shipping');
    // Bölüm sırası: dosya:satır → Kanıt güveni → niyet (FR-PKG-02).
    expect(report.indexOf('Cart.tsx')).toBeLessThan(report.indexOf('Kanıt güveni'));
    expect(report.indexOf('Kanıt güveni')).toBeLessThan(report.indexOf('Toplam 1380 ₺ olmalı.'));

    await agentLoop(id, "await expect(target).toHaveText('1380 ₺');", () =>
      applyFix(join(work, 'src/Cart.tsx'), 'YAZ10', 'const total = discounted + Number(shipping);'),
    );

    // Panel: Kayıtlar sekmesinde durum + not ile assertion yan yana (FR-UI-16).
    await page.reload();
    await openPanel(page);
    await page.getByRole('tab', { name: /Kayıtlar/ }).click();
    const card = page.locator(`[data-rw="incident"][data-id="${id}"]`);
    await card.waitFor({ timeout: 10_000 });
    await expect.poll(() => card.locator('[data-rw="status"]').textContent(), { timeout: 10_000 }).toMatch(/doğrulandı/i);
    expect(await card.locator('[data-rw="note"]').textContent()).toContain('Toplam 1380 ₺ olmalı.');
    expect(await card.locator('[data-rw="assertion"]').textContent()).toContain("toHaveText(\"1380 ₺\")");
    await page.close();
  });

  it('KK-1 / KIS20: sayfa düzeyi olay → birincil kanıt 500 → kırmızı → düzelt → yeşil ×2 → fixed', async () => {
    const page = await openApp();
    await fillCart(page, 'KIS20');
    await page.waitForTimeout(1200);
    await openPanel(page);
    await page.locator('[data-rw="page-level"]').click();
    await page.locator('[data-rw="expected"]').fill('"Kupon uygulanamadı" uyarısı gösterilmeli.');
    const id = await send(page);

    const report = textOf(await call('get_incident', { id }));
    expect(report).toMatch(/POST \S*\/api\/coupon → 500/);

    // Sayfa düzeyi olayda `target` kullanılamaz (FR-REPRO-02).
    const bad = await call('run_repro', { id, assertions: "await expect(target).toBeVisible();" });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain('assertion_rejected');

    await agentLoop(id, "await expect(page.getByRole('alert')).toHaveText('Kupon uygulanamadı');", () =>
      applyFix(join(work, 'src/Cart.tsx'), 'KIS20', "setCouponError('Kupon uygulanamadı');"),
    );
    await page.close();
  });

  it('KK-2 / ACCOUNT: oturum gerektiren olay → storageState yokken precondition (kırmızı sayılmaz) → storageState ile kırmızı → düzelt → fixed', async () => {
    // Geliştirici zaten oturum açmış (giriş adımları kayıt penceresinde değil).
    const page = await openApp('/login');
    const login = await page.request.post(`${base}/api/login`, { data: { email: 'demo@example.com', password: 'demo1234' } });
    expect(login.ok()).toBe(true);
    await page.goto(`${base}/account`);
    await expect.poll(() => page.getByTestId('order-count').textContent()).toBe('Sipariş sayısı: 5');
    await page.waitForTimeout(800);
    await openPanel(page);
    await pickInReplay(page, 'order-count');
    await expect.poll(() => page.locator('[data-rw="selected-source"]').textContent(), { timeout: 10_000 }).toContain('Account.tsx');
    await page.locator('[data-rw="expected"]').fill('Sipariş sayısı 4 olmalı.');
    const id = await send(page);
    const assertion = "await expect(target).toHaveText('Sipariş sayısı: 4');";

    // storageState yok → /login'e yönlenir → precondition; kırmızı sayılmaz (FR-REPRO-12).
    const pre = await call('run_repro', { id, assertions: assertion });
    expect(pre.isError).toBe(true);
    expect(textOf(pre)).toContain('precondition');
    expect(readIncident(id).repros.at(-1)).toMatchObject({ status: 'error', errorKind: 'precondition' });

    // Geliştirici storageState dosyası hazırlar; rewind-mcp bu ayarla yeniden başlar.
    const stateFile = join(work, 'auth.json');
    await context.storageState({ path: stateFile });
    await startMcp({ REWIND_STORAGE_STATE: stateFile });

    await agentLoop2(id, assertion);
    await page.close();
  });

  /** KK-2 için: ilk koşu `precondition` hatası olduğundan geçerli koşular onu saymaz. */
  async function agentLoop2(id: string, assertion: string) {
    const red = await call('run_repro', { id, assertions: assertion });
    expect(textOf(red), textOf(red)).toContain('Sonuç: failed_assertion');
    applyFix(join(work, 'src/Account.tsx'), 'ACCOUNT', 'const count = orders.reduce((n) => n + 1, 0);');
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < 2; i++) expect(textOf(await call('run_repro', { id, assertions: assertion }))).toContain('Sonuç: passed');
    expect(textOf(await call('mark_fixed', { id, resolution: 'fixed', summary: 'Sayım 0 ile başlıyor.' }))).toContain('doğrulanmış olarak kapandı');
    expect(readIncident(id).status).toBe('fixed');
  }
});
