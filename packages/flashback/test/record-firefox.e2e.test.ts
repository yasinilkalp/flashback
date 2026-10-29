/**
 * Kayıt tarafı Firefox'ta (FRD §3.3 dipnot 2, NFR-COMP-01): Vite demo + sahte alıcı + Playwright Firefox.
 * Firefox'ta yığın biçimi `fn@url:satır:sütun`, `ImageCapture` yok (anahtar kareler `<video>` yedeğinden) ve
 * MediaRecorder kodek desteği farklı. Firefox Playwright tarayıcısı yoksa (`npx playwright install firefox`) atlanır;
 * CI'da `firefox` işi çalıştırır. Önkoşul: `npm run build`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { firefox, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fakeScreenAndMic,
  findTarget,
  freshBasket,
  openApp,
  pickSource,
  repo,
  sendAll,
  sendSelected,
  startReceiver,
  startRecording,
  startVite,
  type DevServer,
  type Receiver,
} from './e2e-utils.js';

const demoDir = join(repo, 'examples/demo');
const total = findTarget(demoDir, 'total', '[data-testid="total"]', 'src/Cart.tsx', '<dd data-testid="total">');

describe.runIf(process.env.FLASHBACK_E2E && existsSync(firefox.executablePath()))('Kayıt: Firefox (Vite demo)', () => {
  let receiver: Receiver;
  let vite: DevServer;
  let browser: Browser;

  beforeAll(async () => {
    receiver = await startReceiver();
    process.env.VITE_FLASHBACK_ENDPOINT = receiver.url;
    process.env.FLASHBACK_DEMO_DETERMINISTIC = '1';
    vite = await startVite(demoDir);
    browser = await firefox.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await receiver?.close();
  });

  async function fillCart(page: Page) {
    for (const id of [1, 2, 3]) await page.getByTestId(`add-${id}`).click();
    await expect.poll(() => page.getByTestId('subtotal').textContent()).toBe('1500 ₺');
    await page.locator('#coupon').fill('YAZ10');
    const response = page.waitForResponse((r) => r.url().endsWith('/api/coupon'));
    await page.getByRole('button', { name: 'Uygula' }).click();
    await response;
    await expect.poll(() => page.getByTestId('total').textContent()).toBe('135030 ₺');
  }

  /** Kayıt düğmesiyle durdurur: olay sepete girer, panel açılır ve olay seçilir (FR-BSK-01). */
  async function stopRecording(page: Page) {
    await page.locator('[data-fb="record"]').click();
    await page.locator('[data-fb="panel"]').waitFor();
    await expect.poll(() => page.locator('[data-fb="basket-item-1"]').getAttribute('aria-pressed')).toBe('true');
  }

  it('bu sekme: kayıt → olay ekranı → tekrar oynatmada öğe seçimi → gönderim (adımlar, ağ, store, kaynak satırı)', async () => {
    const page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
    const errors = await openApp(page, vite.url, 300);
    await fillCart(page);
    await page.waitForTimeout(1000);
    await stopRecording(page);

    expect(await pickSource(page, total.css)).toBe(`src/Cart.tsx:${total.line}`);
    const draft = await sendSelected(page, receiver, 'Toplam 1380 ₺ olmalı.');
    expect(draft.source.userAgent).toContain('Firefox');
    expect(draft.target).toMatchObject({ file: 'src/Cart.tsx', line: total.line, resolved: true, resolution: 'exact', text: '135030 ₺' });
    expect(draft.target!.componentStack[0]).toBe('Cart');
    expect(draft.target!.snippet?.lines.join('\n')).toContain('data-testid="total"');
    expect(draft.steps.find((s) => s.type === 'input' && s.selector === '#coupon')?.value).toBe('YAZ10');
    expect(draft.steps.filter((s) => s.type === 'click').length).toBeGreaterThanOrEqual(4);
    expect(draft.network.find((n) => n.url.endsWith('/api/shipping'))?.resBody).toContain('"30"');
    expect(draft.network.some((n) => n.url.endsWith('/api/coupon') && n.reqBody?.includes('YAZ10'))).toBe(true);
    expect(draft.store.some((s) => s.name === 'cart' && s.path === 'discount' && s.after === 0.1)).toBe(true);
    expect(draft.events.length).toBeGreaterThan(0);
    expect(draft.domSnapshot).toContain('135030 ₺');
    expect(JSON.stringify(draft.events)).not.toContain('flashback-devtools');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('ekran + mikrofon: .webm yüklenir, anahtar kareler <video> yedeğinden (ImageCapture yok) (FR-REC-16)', async () => {
    const page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(freshBasket);
    await page.addInitScript(fakeScreenAndMic);
    await page.goto(vite.url + '/');
    await page.locator('[data-fb="launcher"][data-receiver="connected"]').waitFor({ timeout: 30_000 });
    expect(await page.evaluate(() => 'ImageCapture' in window)).toBe(false);

    await startRecording(page, { source: 'screen', mic: true });
    await fillCart(page);
    await page.waitForTimeout(2500);
    await stopRecording(page);
    const card = page.locator('[data-fb="media-card"]');
    await card.waitFor();
    expect(await card.textContent()).toContain('mikrofon sesiyle');

    await page.locator('[data-fb="page-level"]').click();
    await page.locator('[data-fb="expected"]').fill('Toplam 1380 ₺ olmalı.');
    await page.locator('[data-fb="save"]').click();
    const preview = page.locator('[data-fb="preview-view"]');
    await preview.waitFor();
    await preview.locator('[data-fb="also-sent-media"]').waitFor();
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
    for (const k of frames) {
      expect(k.jpeg!.startsWith('/9j/')).toBe(true); // JPEG imzası (base64)
      expect(k.width).toBeLessThanOrEqual(960);
    }
    expect(receiver.media.slice(before.media)).toEqual([{ id, type: expect.stringMatching(/^video\/webm/), bytes: draft.media!.bytes, webm: true }]);
    expect(await page.locator('[data-fb="media-failed"]').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  });
});
