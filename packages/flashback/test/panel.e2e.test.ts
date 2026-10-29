/**
 * Uçtan uca: Vite demo + sahte alıcı + Playwright Chromium.
 * Önkoşul: `npm run build -w @flashback/shared && npm run build -w flashback-devtools` (demo paketi dist'ten kullanır).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { IncidentDraft } from '@flashback/shared';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeScreenAndMic, freePort, freshBasket, saveToBasket, sendAll, startReceiver, startRecording, type Receiver } from './e2e-utils.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const demoDir = join(repo, 'examples/demo');
const cartSource = readFileSync(join(demoDir, 'src/Cart.tsx'), 'utf8');
const TOTAL_LINE = cartSource.split('\n').findIndex((l) => l.includes('data-testid="total"')) + 1;

interface ViteServer {
  listen(): Promise<unknown>;
  close(): Promise<void>;
}

describe.runIf(process.env.FLASHBACK_E2E)('Flashback panel e2e (Vite demo + Chromium)', () => {
  let receiver: Receiver;
  let vite: ViteServer;
  let browser: Browser;
  let context: BrowserContext;
  let base: string;

  beforeAll(async () => {
    if (!existsSync(join(repo, 'packages/flashback/dist/index.js'))) {
      throw new Error('flashback-devtools derlenmemiş: önce `npm run build -w @flashback/shared && npm run build -w flashback-devtools`');
    }
    receiver = await startReceiver();
    process.env.VITE_FLASHBACK_ENDPOINT = receiver.url;
    process.env.FLASHBACK_DEMO_DETERMINISTIC = '1';
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
    await page.addInitScript(freshBasket);
    await page.goto(base + path);
    await page.locator('[data-fb="launcher"]').waitFor();
    await startRecording(page);
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

  /** Sepeti açar: süren kayıt durur ve olay olarak sepete eklenip seçilir. */
  async function openPanel(page: Page) {
    await page.locator('[data-fb="launcher"][data-receiver="connected"]').waitFor({ timeout: 10_000 });
    await page.locator('[data-fb="launcher"]').click();
    await page.locator('[data-fb="panel"]').waitFor();
  }

  /** Önizlemeyi (oturumdaki ilk kayıtta zorunlu) geçip olayı sepete kaydeder, gönderir ve alıcıya ulaşan taslağı döndürür. */
  async function previewAndSend(page: Page): Promise<IncidentDraft> {
    const before = receiver.drafts.length;
    await page.locator('[data-fb="save"]').click();
    const preview = page.locator('[data-fb="preview-view"]');
    await preview.waitFor();
    await expect.poll(() => preview.textContent()).toContain('Kanıt güveni');
    expect(await preview.textContent()).toContain('Ayrıca gönderilenler');
    await page.locator('[data-fb="preview-save"]').click();
    await page.locator('[data-fb="saved"]').waitFor();
    await sendAll(page);
    expect(receiver.rejected).toEqual([]);
    expect(receiver.drafts.length).toBe(before + 1);
    return receiver.drafts[receiver.drafts.length - 1];
  }

  it('YAZ10: go back, select the total in the replay, send → Cart.tsx JSX line, component stack, steps, network', async () => {
    const page = await openApp();
    // FR-RED-13: işaretli bölgeler kayda hiç girmez / metni maskelenir.
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<div data-flashback-block>GIZLI-BLOK</div><p data-flashback-mask>GIZLI-METIN</p>'),
    );
    await fillCart(page, 'YAZ10');
    await expect.poll(() => page.getByTestId('total').textContent()).toBe('135030 ₺');
    await page.waitForTimeout(1500);
    await openPanel(page);
    await page.locator('[data-fb="back"]').click(); // 1 sn geri sar
    await page.keyboard.press('s');
    await page.locator('[data-fb="pick-overlay"]').waitFor();
    const point = await page.evaluate(() => {
      const iframe = document.querySelector('flashback-devtools')!.shadowRoot!.querySelector('iframe')!;
      const el = iframe.contentDocument!.querySelector('[data-testid="total"]')!;
      const f = iframe.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      const scale = f.width / iframe.offsetWidth;
      return { x: f.left + (e.left + e.width / 2) * scale, y: f.top + (e.top + e.height / 2) * scale, text: el.textContent };
    });
    expect(point.text).toBe('135030 ₺');
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('[data-fb="selected-source"]').textContent(), { timeout: 10_000 }).toContain('Cart.tsx');
    expect(await page.locator('[data-fb="selected-selector"]').textContent()).toBe('[data-testid="total"]');
    await expect(page.locator('[data-fb="save"]').isDisabled()).resolves.toBe(true);
    await page.locator('[data-fb="expected"]').fill('Toplam 1380 ₺ olmalı.');

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
    // FR-REC-10: Flashback'in kendi DOM'u ve alıcı istekleri pakette yok.
    expect(draft.network.some((n) => n.url.startsWith(receiver.url))).toBe(false);
    expect(JSON.stringify(draft.events)).not.toContain('flashback-devtools');
    expect(draft.domSnapshot).toContain('135030 ₺');
    expect(draft.domSnapshot).not.toContain('flashback-devtools');
    expect(draft.context.startUrl).toBe(`${base}/`);
    expect(JSON.stringify(draft)).not.toContain('GIZLI-BLOK');
    expect(JSON.stringify(draft)).not.toContain('GIZLI-METIN');
    expect(draft.domSnapshot).toMatch(/<p data-flashback-mask="">\*+<\/p>/);
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
    await page.locator('[data-fb="page-level"]').click();
    await page.locator('[data-fb="selection"]').waitFor();
    await page.locator('[data-fb="expected"]').fill('"Kupon uygulanamadı" uyarısı gösterilmeli.');
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
    await page.locator('[data-fb="page-level"]').click();
    await page.locator('[data-fb="expected"]').fill('Sipariş sayısı 4 olmalı.');
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
    await page.locator('[data-fb="scrubber"]').focus();
    await page.keyboard.press('Home');
    await page.locator('[data-fb="select"]').click();
    await page.locator('[data-fb="pick-overlay"]').waitFor();
    const point = await page.evaluate(() => {
      const iframe = document.querySelector('flashback-devtools')!.shadowRoot!.querySelector('iframe')!;
      const el = Array.from(iframe.contentDocument!.querySelectorAll('p')).find((p) => p.textContent === 'Sepetiniz boş.')!;
      const f = iframe.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      const scale = f.width / iframe.offsetWidth;
      return { x: f.left + (e.left + e.width / 2) * scale, y: f.top + (e.top + e.height / 2) * scale };
    });
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('[data-fb="selected-source"]').textContent(), { timeout: 10_000 }).toContain('Cart.tsx');
    await page.locator('[data-fb="expected"]').fill('Boş sepet mesajı doğru.');
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
    const style = await page.locator('[data-fb="launcher-bar"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, display: cs.display, direction: cs.flexDirection, radius: cs.borderTopLeftRadius };
    });
    expect(style).toEqual({ position: 'fixed', display: 'flex', direction: 'column', radius: '14px' });
    // Odak metin girişindeyken kısayol kaydı durdurmaz.
    await page.locator('#coupon').focus();
    await page.keyboard.press('Alt+Shift+KeyR');
    expect(await page.locator('[data-fb="record"]').getAttribute('aria-pressed')).toBe('true');
    await page.locator('[data-fb="launcher"]').click();
    expect(await page.locator('[data-fb="panel"]').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await page.close();
  });

  it('sepet (FR-BSK-01…06): iki kayıt iki olay olur, yenilemede korunur, notsuz olay gönderilmez; prompt kopyalanır ve olaylar grup olarak gider', async () => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const page = await openApp();
    const count = () => page.locator('[data-fb="basket-count"]').textContent();
    // 1. olay: kısayol kaydı durdurur, olay sepete düşer ve olayın ekranı (not ve öğe seçimi) hemen açılır.
    await page.getByTestId('add-1').click();
    await page.waitForTimeout(700);
    await page.keyboard.press('Alt+Shift+KeyR');
    await expect.poll(() => page.locator('[data-fb="toast"]').textContent()).toBe('Olay 1 sepete eklendi');
    expect(await page.locator('[data-fb="record"]').getAttribute('aria-pressed')).toBe('false');
    expect(await count()).toBe('1');
    await page.locator('[data-fb="panel"]').waitFor();
    expect(await page.getByRole('tab', { name: /Sepet/ }).getAttribute('aria-selected')).toBe('true');
    await expect.poll(() => page.locator('[data-fb="basket-item-1"]').getAttribute('aria-pressed')).toBe('true');
    await page.locator('[data-fb="expected"]').waitFor();
    await page.locator('[data-fb="close"]').click();
    // 2. olay: düğmeyle başlat ve durdur.
    await startRecording(page);
    await page.getByTestId('add-2').click();
    await page.waitForTimeout(700);
    await page.locator('[data-fb="record"]').click();
    await expect.poll(count).toBe('2');
    await expect.poll(() => page.locator('[data-fb="basket-item-2"]').getAttribute('aria-pressed')).toBe('true');
    // Sayfa yenilense de sepet durur (IndexedDB).
    await page.reload();
    await expect.poll(count, { timeout: 10_000 }).toBe('2');

    // Kayıtlar düğmesi paneli o sekmede açar.
    await page.locator('[data-fb="launcher"][data-receiver="connected"]').waitFor({ timeout: 10_000 });
    await page.locator('[data-fb="open-incidents"]').click();
    expect(await page.getByRole('tab', { name: /Kayıtlar/ }).getAttribute('aria-selected')).toBe('true');
    await page.getByRole('tab', { name: /Sepet/ }).click();
    expect(await page.locator('.fb-chip').count()).toBe(2);
    expect(await page.locator('[data-fb="basket-status"]').textContent()).toBe('2 olay not bekliyor');
    expect(await page.locator('[data-fb="send-all"]').isDisabled()).toBe(true);

    for (const n of [1, 2]) {
      await page.locator(`[data-fb="basket-item-${n}"]`).click();
      await expect.poll(() => page.locator(`[data-fb="basket-item-${n}"]`).getAttribute('aria-pressed')).toBe('true');
      await page.locator('[data-fb="page-level"]').click();
      await saveToBasket(page, `Olay ${n} notu.`);
    }
    expect(await page.locator('[data-fb="basket-status"]').textContent()).toBe('Hepsi hazır');

    await page.locator('[data-fb="copy-prompt"]').click();
    await page.locator('[data-fb="prompt-delivered"][data-result="clipboard"]').waitFor();
    // Windows panosu satır sonlarını CRLF'ye çevirir.
    const prompt = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(prompt.split('\n')[0]).toBe('# Flashback: 2 olay');
    expect(prompt.indexOf('# Olay 1/2')).toBeLessThan(prompt.indexOf('# Olay 2/2'));
    expect(prompt).toContain('> Olay 1 notu.');
    expect(prompt).toContain('> Olay 2 notu.');

    const before = receiver.drafts.length;
    const ids = await sendAll(page);
    expect(ids).toHaveLength(2);
    expect(receiver.rejected).toEqual([]);
    const sent = receiver.drafts.slice(before);
    expect(sent.map((d) => d.note.expected)).toEqual(['Olay 1 notu.', 'Olay 2 notu.']);
    const groupId = sent[0].group!.id;
    expect(groupId).toMatch(/^grp-\d{8}-\d{6}-[a-z0-9]{4}$/);
    expect(sent.map((d) => d.group)).toEqual([
      { id: groupId, index: 1, size: 2 },
      { id: groupId, index: 2, size: 2 },
    ]);
    expect(await page.locator('[data-fb="group-id"]').textContent()).toBe(groupId);
    const agent = await page.locator('[data-fb="agent-prompt"]').textContent();
    expect(agent).toContain(groupId);
    for (const id of ids) expect(agent).toContain(id);
    // Gönderilenler sepetten düşer.
    await page.locator('[data-fb="basket-empty"]').waitFor();
    expect(await page.locator('[data-fb="basket-count"]').count()).toBe(0);

    // Küçültme yeniden yüklemede korunur; açınca seçim silinir (bağlamı paylaşan sonraki testler açık çubukla başlar).
    await page.keyboard.press('Escape');
    await page.locator('[data-fb="collapse"]').click();
    expect(await page.locator('[data-fb="launcher"]').count()).toBe(0);
    await page.reload();
    await page.locator('[data-fb="expand"]').click();
    await page.locator('[data-fb="launcher"]').waitFor();
    await page.close();
  });

  it('sepet: kayıt sürerken sepeti açmak kaydı durdurup olayı ekler; çok kısa kayıt eklenmez', async () => {
    const page = await openApp();
    await page.waitForTimeout(700);
    await openPanel(page);
    await expect.poll(() => page.locator('[data-fb="basket-item-1"]').getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('[data-fb="record"]').getAttribute('aria-pressed')).toBe('false');
    await page.locator('[data-fb="close"]').click();
    await startRecording(page);
    await page.locator('[data-fb="record"]').click();
    await expect.poll(() => page.locator('[data-fb="toast"]').textContent()).toBe('Kayıt çok kısa; sepete eklenmedi.');
    expect(await page.locator('[data-fb="panel"]').count()).toBe(0);
    expect(await page.locator('[data-fb="basket-count"]').textContent()).toBe('1');
    await page.close();
  });

  it('erişilebilirlik: axe denetiminde kritik/ciddi ihlal yok ve Tab odağı panelin dışına kaçmaz (FR-UI-13)', async () => {
    const page = await openApp();
    await fillCart(page, 'YAZ10');
    await openPanel(page);
    await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
    const audit = async () =>
      page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> } }).axe;
        const r = await axe.run(
          { include: [['flashback-devtools']], exclude: [['flashback-devtools', 'iframe']] },
          { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
        );
        return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`);
      });
    expect(await audit()).toEqual([]);
    await page.getByRole('tab', { name: /Kayıtlar/ }).click();
    expect(await audit()).toEqual([]);
    // Öbür tema da kontrast denetiminden geçmeli (açık ve koyu).
    await page.locator('[data-fb="theme"]').click();
    expect(await audit()).toEqual([]);
    await page.getByRole('tab', { name: /Sepet/ }).click();
    expect(await audit()).toEqual([]);

    // Odak tuzağı: panel sayfayı kaplar; Tab ile görünmeyen sayfaya geçilmez.
    await page.locator('[data-fb="panel"]').focus();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
      const inside = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() === 'flashback-devtools');
      expect(inside, `Tab #${i + 1}`).toBe(true);
    }
    await page.close();
  });

  it('Kayda başla penceresi: Esc/İptal kapatır, kısayol açar; ekran/pencere + mikrofon kaydı .webm ve anahtar karelerle gider (FR-REC-16)', async () => {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(freshBasket);
    // Başsız Chromium'da ekran seçme penceresi yok: ekran hareketli bir tuvalden, mikrofon bir osilatörden gelir.
    await page.addInitScript(fakeScreenAndMic);
    await page.goto(base + '/');
    await page.locator('[data-fb="launcher"][data-receiver="connected"]').waitFor({ timeout: 15_000 });

    // Kayıt düğmesi kaydı hemen başlatmaz: seçim penceresini açar.
    await page.locator('[data-fb="record"]').click();
    const picker = page.locator('[data-fb="record-picker"]');
    await picker.waitFor();
    const text = await picker.textContent();
    for (const s of ['Kayda başla', 'En fazla 60 sn', 'Bu sekme', 'Ekran / pencere', 'Mikrofonu ekle', 'İptal', 'Kaydı başlat']) expect(text).toContain(s);
    expect(await page.locator('[data-fb="record"]').getAttribute('aria-pressed')).toBe('false');
    expect(await page.locator('[data-fb="record"]').getAttribute('aria-expanded')).toBe('true');
    // Odak "Kaydı başlat"ta; Esc kapatır ve odak kayıt düğmesine döner.
    const focused = () => page.evaluate(() => document.querySelector('flashback-devtools')!.shadowRoot!.activeElement?.getAttribute('data-fb'));
    expect(await focused()).toBe('rec-start');
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });
    expect(await focused()).toBe('record');
    // Kısayol da pencereyi açar; İptal kapatır.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Alt+Shift+KeyR');
    await picker.waitFor();
    await picker.locator('[data-fb="rec-cancel"]').click();
    await picker.waitFor({ state: 'detached' });
    expect(await page.locator('[data-fb="record"]').getAttribute('aria-pressed')).toBe('false');

    await startRecording(page, { source: 'screen', mic: true });
    await fillCart(page, 'YAZ10');
    await page.waitForTimeout(2500);
    await page.locator('[data-fb="record"]').click();
    // Durunca olay sepete girer ve ekranı açılır: kayıt kartında video oynatıcısı.
    await page.locator('[data-fb="panel"]').waitFor();
    await expect.poll(() => page.locator('[data-fb="basket-item-1"]').getAttribute('aria-pressed')).toBe('true');
    await page.locator('[data-fb="basket-item-1"] [data-fb="chip-media"]').waitFor();
    const card = page.locator('[data-fb="media-card"]');
    await card.waitFor();
    expect(await card.locator('video').count()).toBe(1);
    expect(await card.textContent()).toContain('mikrofon sesiyle');
    expect(await card.textContent()).toMatch(/\d+ anahtar kare/);

    await page.locator('[data-fb="page-level"]').click();
    await page.locator('[data-fb="expected"]').fill('Toplam 1380 ₺ olmalı.');
    await page.locator('[data-fb="preview"]').click();
    const preview = page.locator('[data-fb="preview-view"]');
    await preview.waitFor();
    await preview.locator('[data-fb="also-sent-media"]').waitFor();
    expect(await preview.locator('[data-fb="exclude-media"]').isChecked()).toBe(false);
    await page.locator('[data-fb="preview-save"]').click();
    await page.locator('[data-fb="saved"]').waitFor();

    const before = { drafts: receiver.drafts.length, media: receiver.media.length };
    const [id] = await sendAll(page);
    expect(receiver.rejected).toEqual([]);
    const draft = receiver.drafts[before.drafts];
    expect(draft.media).toMatchObject({ source: 'screen', video: true, audio: true });
    expect(draft.media!.mimeType).toMatch(/^video\/webm/);
    expect(draft.media!.durationMs).toBeGreaterThan(2000);
    const frames = draft.media!.keyframes;
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames.length).toBeLessThanOrEqual(6);
    for (const k of frames) {
      expect(k.jpeg!.startsWith('/9j/')).toBe(true); // JPEG imzası (base64)
      expect(k.width).toBeLessThanOrEqual(960);
    }
    expect(frames.map((k) => k.t)).toEqual([...frames.map((k) => k.t)].sort((a, b) => a - b));
    expect(receiver.media.slice(before.media)).toEqual([{ id, type: expect.stringMatching(/^video\/webm/), bytes: draft.media!.bytes, webm: true }]);
    expect(await page.locator('[data-fb="media-failed"]').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('receiver down: "Hepsini gönder" falls back to a redacted .md prompt download and keeps the incident in the basket', async () => {
    const page = await openApp();
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await page.reload();
    await page.locator('[data-fb="launcher"]').waitFor();
    await startRecording(page);
    await fillCart(page, 'YAZ10');
    await page.waitForTimeout(500);
    await openPanel(page);
    await page.locator('[data-fb="page-level"]').click();
    await saveToBasket(page, 'Toplam 1380 ₺ olmalı.');
    receiver.down = true;
    try {
      const download = page.waitForEvent('download');
      await page.locator('[data-fb="send-all"]').click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^\d{8}-\d{6}\.flashback\.md$/);
      const markdown = readFileSync(await file.path(), 'utf8');
      expect(markdown).toMatch(/^# Flashback olayı\nKöken: /);
      expect(markdown).toContain('**Ne olmalıydı?**\n> Toplam 1380 ₺ olmalı.');
      await page.locator('[data-fb="batch-offline"]').waitFor();
      expect(await page.locator('[data-fb="basket-item-1"]').getAttribute('data-ready')).toBe('true');
      const before = receiver.drafts.length;
      receiver.down = false;
      await page.locator('[data-fb="launcher"][data-receiver="connected"]').waitFor({ timeout: 15_000 });
      await sendAll(page);
      expect(receiver.drafts.length).toBe(before + 1);
    } finally {
      receiver.down = false;
    }
    await page.close();
  });
});
