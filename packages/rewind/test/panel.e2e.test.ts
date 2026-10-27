/**
 * Uçtan uca: Vite demo + sahte alıcı + Playwright Chromium.
 * Önkoşul: `npm run build -w @rewind/shared && npm run build -w rewind-devtools` (demo paketi dist'ten kullanır).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IncidentDraftSchema, type IncidentDraft, type IncidentSummary } from '@rewind/shared';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const demoDir = join(repo, 'examples/demo');
const cartSource = readFileSync(join(demoDir, 'src/Cart.tsx'), 'utf8');
const TOTAL_LINE = cartSource.split('\n').findIndex((l) => l.includes('data-testid="total"')) + 1;

interface Receiver {
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

/** `rewind-mcp` alıcısının HTTP sözleşmesini (FRD §9.3) taklit eder; POST'u IncidentDraftSchema ile doğrular. */
async function startReceiver(): Promise<Receiver> {
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
    if (req.method === 'GET' && req.url === '/health') return json(200, { name: 'rewind-mcp', version: 'test', schemaVersion: 1, projectId: 'p1', projectName: 'demo' });
    if (req.method === 'POST' && req.url === '/incidents') {
      if (!String(req.headers['content-type']).startsWith('application/json')) return json(415, { error: 'unsupported_media_type' });
      const parsed = IncidentDraftSchema.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) {
        state.rejected.push(JSON.stringify(parsed.error.issues).slice(0, 2000));
        return json(400, { error: 'schema' });
      }
      state.drafts.push(parsed.data);
      const id = `rw-20261027-1200${String(ids.length).padStart(2, '0')}-test`;
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

async function freePort(): Promise<number> {
  const s = createHttpServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise((r) => s.close(r));
  return port;
}

interface ViteServer {
  listen(): Promise<unknown>;
  close(): Promise<void>;
}

describe.runIf(process.env.REWIND_E2E)('Rewind panel e2e (Vite demo + Chromium)', () => {
  let receiver: Receiver;
  let vite: ViteServer;
  let browser: Browser;
  let context: BrowserContext;
  let base: string;

  beforeAll(async () => {
    if (!existsSync(join(repo, 'packages/rewind/dist/index.js'))) {
      throw new Error('rewind-devtools derlenmemiş: önce `npm run build -w @rewind/shared && npm run build -w rewind-devtools`');
    }
    receiver = await startReceiver();
    process.env.VITE_REWIND_ENDPOINT = receiver.url;
    process.env.REWIND_DEMO_DETERMINISTIC = '1';
    // Demo kendi Vite sürümünü kullanır (kökteki vitest'in Vite'ı değil).
    const viteEntry = createRequire(join(demoDir, 'package.json')).resolve('vite');
    const { createServer } = (await import(pathToFileURL(viteEntry).href)) as { createServer: (c: object) => Promise<ViteServer> };
    const port = await freePort();
    vite = await createServer({ root: demoDir, configFile: join(demoDir, 'vite.config.ts'), logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1' } });
    await vite.listen();
    base = `http://localhost:${port}`;
    browser = await chromium.launch();
    context = await browser.newContext({ locale: 'tr-TR', acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  });

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await receiver?.close();
  });

  async function openApp(path = '/'): Promise<Page> {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + path);
    await page.locator('[data-rw="launcher"]').waitFor();
    (page as Page & { errors: string[] }).errors = errors;
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

  /** Önizlemeyi (oturumdaki ilk gönderimde zorunlu) geçip gönderir ve alıcıya ulaşan taslağı döndürür. */
  async function previewAndSend(page: Page): Promise<IncidentDraft> {
    const before = receiver.drafts.length;
    await page.locator('[data-rw="save"]').click();
    const preview = page.locator('[data-rw="preview-view"]');
    await preview.waitFor();
    await expect.poll(() => preview.textContent()).toContain('Kanıt güveni');
    expect(await preview.textContent()).toContain('Ayrıca gönderilenler');
    await page.locator('[data-rw="send"]').click();
    await page.locator('[data-rw="incident-id"]').waitFor();
    expect(receiver.rejected).toEqual([]);
    expect(receiver.drafts.length).toBe(before + 1);
    return receiver.drafts[receiver.drafts.length - 1];
  }

  it('YAZ10: rewind, select the total in the replay, send → Cart.tsx JSX line, component stack, steps, network', async () => {
    const page = await openApp();
    // FR-RED-13: işaretli bölgeler kayda hiç girmez / metni maskelenir.
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<div data-rewind-block>GIZLI-BLOK</div><p data-rewind-mask>GIZLI-METIN</p>'),
    );
    await fillCart(page, 'YAZ10');
    await expect.poll(() => page.getByTestId('total').textContent()).toBe('135030 ₺');
    await page.waitForTimeout(1500);
    await openPanel(page);
    await page.locator('[data-rw="back"]').click(); // 1 sn geri sar
    await page.keyboard.press('s');
    await page.locator('[data-rw="pick-overlay"]').waitFor();
    const point = await page.evaluate(() => {
      const iframe = document.querySelector('rewind-devtools')!.shadowRoot!.querySelector('iframe')!;
      const el = iframe.contentDocument!.querySelector('[data-testid="total"]')!;
      const f = iframe.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      const scale = f.width / iframe.offsetWidth;
      return { x: f.left + (e.left + e.width / 2) * scale, y: f.top + (e.top + e.height / 2) * scale, text: el.textContent };
    });
    expect(point.text).toBe('135030 ₺');
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('[data-rw="selected-source"]').textContent(), { timeout: 10_000 }).toContain('Cart.tsx');
    expect(await page.locator('[data-rw="selected-selector"]').textContent()).toBe('[data-testid="total"]');
    await expect(page.locator('[data-rw="save"]').isDisabled()).resolves.toBe(true);
    await page.locator('[data-rw="expected"]').fill('Toplam 1380 ₺ olmalı.');

    const draft = await previewAndSend(page);
    expect(draft.target).not.toBeNull();
    const target = draft.target!;
    expect(target.file).toMatch(/Cart\.tsx$/);
    expect(target.line).toBe(TOTAL_LINE);
    expect(target.resolved).toBe(true);
    expect(target.resolution).toBe('exact');
    expect(target.componentStack).toContain('Cart');
    expect(target.componentStack[0]).toBe('Cart');
    expect(target.snippet?.lines.join('\n')).toContain('data-testid="total"');
    expect(target.text).toBe('135030 ₺');
    expect(draft.primaryEvidence).toEqual({ kind: 'target' });
    expect(draft.note.expected).toBe('Toplam 1380 ₺ olmalı.');

    const couponStep = draft.steps.find((s) => s.type === 'input' && s.selector === '#coupon');
    expect(couponStep?.value).toBe('YAZ10');
    expect(draft.steps.filter((s) => s.type === 'click').length).toBeGreaterThanOrEqual(4);
    const shipping = draft.network.find((n) => n.url.endsWith('/api/shipping'));
    expect(shipping?.resBody).toContain('"30"');
    expect(draft.network.some((n) => n.url.endsWith('/api/coupon') && n.reqBody?.includes('YAZ10'))).toBe(true);
    expect(draft.store.some((s) => s.name === 'cart' && s.path === 'discount' && s.after === 0.1)).toBe(true);
    // FR-REC-10: Rewind'in kendi DOM'u ve alıcı istekleri pakette yok.
    expect(draft.network.some((n) => n.url.startsWith(receiver.url))).toBe(false);
    expect(JSON.stringify(draft.events)).not.toContain('rewind-devtools');
    expect(draft.domSnapshot).toContain('135030 ₺');
    expect(draft.domSnapshot).not.toContain('rewind-devtools');
    expect(draft.context.startUrl).toBe(`${base}/`);
    expect(JSON.stringify(draft)).not.toContain('GIZLI-BLOK');
    expect(JSON.stringify(draft)).not.toContain('GIZLI-METIN');
    expect(draft.domSnapshot).toMatch(/<p data-rewind-mask="">\*+<\/p>/);
    expect(draft.domSnapshot).not.toMatch(/:hover|rrweb-paused/);
    expect(draft.confidence.map((c) => c.key)).toEqual(['source', 'element', 'propsState', 'preWindow', 'truncated', 'redaction', 'synthetic']);
    expect(draft.confidence.find((c) => c.key === 'source')!.level).toBe('ok');
    expect((page as Page & { errors: string[] }).errors).toEqual([]);
    await page.close();
  });

  it('KIS20: page-level incident → primary evidence is the 500 response', async () => {
    const page = await openApp();
    await fillCart(page, 'KIS20');
    await page.waitForTimeout(1200);
    expect(await page.getByRole('alert').count()).toBe(0); // hata yutuluyor
    await openPanel(page);
    await page.locator('[data-rw="page-level"]').click();
    await page.locator('[data-rw="selection"]').waitFor();
    await page.locator('[data-rw="expected"]').fill('"Kupon uygulanamadı" uyarısı gösterilmeli.');
    const draft = await previewAndSend(page);
    expect(draft.target).toBeNull();
    expect(draft.primaryEvidence.kind).toBe('network');
    const evidence = draft.network[draft.primaryEvidence.ref!];
    expect(evidence).toMatchObject({ method: 'POST', status: 500 });
    expect(evidence.url).toMatch(/\/api\/coupon$/);
    expect(evidence.resBody).toContain('internal');
    expect(draft.console.some((c) => c.level === 'error' && c.message.includes('Kupon isteği başarısız'))).toBe(true);
    expect(draft.console.find((c) => c.message.includes('Kupon isteği başarısız'))!.source).toMatch(/Cart\.tsx:\d+:\d+$/);
    expect(draft.confidence.find((c) => c.key === 'element')!.message).toContain('POST /api/coupon → 500');
    await page.close();
  });

  it('login: typed email and password are masked at record time and appear nowhere in the payload', async () => {
    const page = await openApp('/login');
    await page.locator('#email').pressSequentially('demo@example.com', { delay: 10 });
    await page.locator('#password').pressSequentially('demo1234', { delay: 10 });
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect.poll(() => page.getByTestId('order-count').textContent()).toBe('Sipariş sayısı: 5');
    await page.waitForTimeout(500);
    await openPanel(page);
    await page.locator('[data-rw="page-level"]').click();
    await page.locator('[data-rw="expected"]').fill('Sipariş sayısı 4 olmalı.');
    const draft = await previewAndSend(page);
    const email = draft.steps.find((s) => s.type === 'input' && s.selector === '#email');
    const password = draft.steps.find((s) => s.type === 'input' && s.selector === '#password');
    expect(email).toMatchObject({ value: '[REDACTED:email]', valueRedactedAs: 'email' });
    expect(password).toMatchObject({ value: '[REDACTED:password]', valueRedactedAs: 'password' });
    const json = JSON.stringify(draft);
    expect(json).not.toContain('demo@example.com');
    expect(json).not.toContain('demo1234');
    expect(json).toContain('[REDACTED:password]'); // rrweb giriş olayları ve istek gövdesi de maskeli
    expect(draft.redaction.byType.password).toBeGreaterThanOrEqual(1);
    expect(draft.network.find((n) => n.url.endsWith('/api/login'))!.reqBody).toContain('[REDACTED:password]');
    expect(draft.confidence.find((c) => c.key === 'synthetic')!.level).toBe('warn');
    expect(draft.steps.some((s) => s.type === 'navigate' && s.url?.endsWith('/account'))).toBe(true);
    expect(draft.context.url).toBe(`${base}/account`);
    await page.close();
  });

  it('an element that is no longer on the live page resolves through its nearest live ancestor (FR-MARK-10)', async () => {
    const page = await openApp();
    await expect.poll(() => page.getByText('Sepetiniz boş.').count()).toBe(1);
    for (const id of [1, 2]) await page.getByTestId(`add-${id}`).click();
    await expect.poll(() => page.getByText('Sepetiniz boş.').count()).toBe(0);
    await page.waitForTimeout(300);
    await openPanel(page);
    await page.locator('[data-rw="scrubber"]').focus();
    await page.keyboard.press('Home');
    await page.locator('[data-rw="select"]').click();
    await page.locator('[data-rw="pick-overlay"]').waitFor();
    const point = await page.evaluate(() => {
      const iframe = document.querySelector('rewind-devtools')!.shadowRoot!.querySelector('iframe')!;
      const el = Array.from(iframe.contentDocument!.querySelectorAll('p')).find((p) => p.textContent === 'Sepetiniz boş.')!;
      const f = iframe.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      const scale = f.width / iframe.offsetWidth;
      return { x: f.left + (e.left + e.width / 2) * scale, y: f.top + (e.top + e.height / 2) * scale };
    });
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('[data-rw="selected-source"]').textContent(), { timeout: 10_000 }).toContain('Cart.tsx');
    await page.locator('[data-rw="expected"]').fill('Boş sepet mesajı doğru.');
    const draft = await previewAndSend(page);
    expect(draft.target).toMatchObject({ resolution: 'ancestor', text: 'Sepetiniz boş.' });
    expect(draft.target!.componentStack[0]).toBe('Cart');
    expect(draft.target!.resolutionReason).toContain('canlı');
    expect(draft.confidence.find((c) => c.key === 'element')!.level).toBe('warn');
    await page.close();
  });

  it('panel is unaffected by a global `* { all: unset }` rule (FR-UI-12) and the shortcut ignores text inputs (FR-UI-02)', async () => {
    const page = await openApp();
    await page.addStyleTag({ content: '* { all: unset; }' });
    const style = await page.locator('[data-rw="launcher"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, display: cs.display, radius: cs.borderTopLeftRadius };
    });
    expect(style).toEqual({ position: 'fixed', display: 'flex', radius: '999px' });
    await page.locator('#coupon').focus();
    await page.keyboard.press('Alt+Shift+KeyR');
    expect(await page.locator('[data-rw="panel"]').count()).toBe(0);
    await page.locator('[data-rw="launcher"]').click();
    expect(await page.locator('[data-rw="panel"]').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await page.close();
  });

  it('receiver down: falls back to a redacted .md download and queues the incident', async () => {
    const page = await openApp();
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await page.reload();
    await page.locator('[data-rw="launcher"]').waitFor();
    await fillCart(page, 'YAZ10');
    await page.waitForTimeout(500);
    await openPanel(page);
    receiver.down = true;
    try {
      await page.locator('[data-rw="page-level"]').click();
      await page.locator('[data-rw="expected"]').fill('Toplam 1380 ₺ olmalı.');
      await page.locator('[data-rw="save"]').click();
      await page.locator('[data-rw="preview-view"]').waitFor();
      const download = page.waitForEvent('download');
      await page.locator('[data-rw="send"]').click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^\d{8}-\d{6}\.rewind\.md$/);
      const markdown = readFileSync(await file.path(), 'utf8');
      expect(markdown).toMatch(/^# Rewind olayı\nKöken: /);
      expect(markdown).toContain('**Ne olmalıydı?**\n> Toplam 1380 ₺ olmalı.');
      await page.locator('[data-rw="result"][data-result="download"]').waitFor();
      const before = receiver.drafts.length;
      receiver.down = false;
      await expect.poll(() => receiver.drafts.length, { timeout: 15_000 }).toBe(before + 1);
    } finally {
      receiver.down = false;
    }
    await page.close();
  });
});
