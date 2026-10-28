/**
 * FR-MARK-06 Vue 3 smoke testi: React dışı bir uygulamada Flashback kaydeder, zaman çizelgesi çalışır, öğe seçilip olay
 * gönderilebilir; bileşen yığını boş, kaynak satırı yok ve paket öğenin React dışı olduğunu söyler.
 * Panel ayrı bir React kökünde çalışır (flashback-devtools React'i eş bağımlılık olarak ister).
 */
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, openPanel, pickSource, repo, sendSelected, startReceiver, startVite, type DevServer, type Receiver } from './e2e-utils.js';

const appDir = join(repo, 'examples/vue');

describe.runIf(process.env.FLASHBACK_E2E)('Vue 3 + Vite + Chromium smoke (FR-MARK-06)', () => {
  let receiver: Receiver;
  let vite: DevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    receiver = await startReceiver();
    process.env.VITE_FLASHBACK_ENDPOINT = receiver.url;
    vite = await startVite(appDir);
    browser = await chromium.launch();
    page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
  });

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await receiver?.close();
  });

  it('kayıt + zaman çizelgesi + öğe seçimi → boş bileşen yığını, React dışı çözümleme notu, çökme yok', async () => {
    const errors = await openApp(page, vite.url, 300);
    await page.getByTestId('add-1').click();
    await page.getByTestId('add-2').click();
    await expect.poll(() => page.getByTestId('total').textContent()).toBe('750 ₺');
    await page.waitForTimeout(800);
    await openPanel(page);
    // Zaman çizelgesi: tıklamalar ve sayfa olayları kaydedildi. Klip sepetten eşzamansız yüklenir; çizelge sonra gelir.
    await page.locator('[data-fb="scrubber"]').waitFor({ timeout: 15_000 });
    expect(await page.locator('[data-fb="scrubber"]').count()).toBe(1);
    expect(await pickSource(page, '[data-testid="total"]')).toBe('—');
    expect(await page.locator('[data-fb="selected-selector"]').textContent()).toBe('[data-testid="total"]');
    const draft = await sendSelected(page, receiver, 'Toplam 750 ₺ olmalı.');
    const t = draft.target!;
    expect(draft.source.framework).toBe('vue');
    expect(t.componentStack).toEqual([]);
    expect(t.file).toBeUndefined();
    expect(t.resolved).toBe(false);
    expect(t.resolution).toBe('exact');
    expect(t.resolutionReason).toContain('React dışı');
    expect(t.resolutionReason).toContain('vue');
    expect(t.text).toBe('750 ₺');
    expect(draft.steps.filter((s) => s.type === 'click').length).toBeGreaterThanOrEqual(2);
    expect(draft.domSnapshot).toContain('750 ₺');
    expect(draft.confidence.find((c) => c.key === 'source')!.level).toBe('warn');
    expect(errors).toEqual([]);
  });
});
