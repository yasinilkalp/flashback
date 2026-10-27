/**
 * Tarayıcı tarafı: headless Chromium, CPU kısma (CDP Emulation.setCPUThrottlingRate) ve sayfa içi gözlemciler.
 *
 * Sayfa içi gözlemciler (addInitScript, yalnızca üst çerçeve):
 *  - Event Timing (`event`, durationThreshold 16 ms) → etkileşim gecikmesi / INP
 *  - Long Tasks (`longtask`)
 *  - Checkout yoklayıcısı: 50 ms'de bir `record.mirror.getMeta(document)` nesne kimliğine bakar. rrweb her tam anlık
 *    görüntüde belge düğümü için yeni bir serileştirilmiş düğüm üretir (kimlik numarası aynı kalır, nesne değişir);
 *    böylece checkout'un hangi [from, to] aralığında olduğu bilinir ve o aralıkla çakışan long task "checkout" sayılır.
 *    Yoklayıcı her iki kipte de çalışır (eşit yük); kayıt kapalıyken `__benchRecord` yoktur.
 */
import { chromium } from 'playwright';

export const VIEWPORT = { width: 1280, height: 800 };

const INIT = () => {
  if (window !== window.top) return;
  const B = (window.__bench = { events: [], longtasks: [], checkouts: [], panel: null });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        B.events.push({ name: e.name, start: e.startTime, duration: e.duration, id: e.interactionId ?? 0, ps: e.processingStart, pe: e.processingEnd });
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch {
    B.noEventTiming = true;
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) B.longtasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    B.noLongTask = true;
  }
  let lastMeta = null;
  let lastPoll = performance.now();
  setInterval(() => {
    const now = performance.now();
    const rec = window.__benchRecord;
    if (rec) {
      let meta = null;
      try {
        meta = rec.mirror.getMeta(document);
      } catch {
        /* kayıt henüz başlamadı */
      }
      if (meta && lastMeta && meta !== lastMeta) B.checkouts.push({ from: lastPoll, to: now });
      if (meta) lastMeta = meta;
    }
    lastPoll = now;
  }, 50);
};

export async function launch() {
  const browser = await chromium.launch({ headless: true });
  return { browser, version: browser.version() };
}

/** Yeni bağlam + sayfa; `throttle` > 1 ise CPU kısma. */
export async function newPage(browser, { throttle = 1, locale = 'tr-TR' } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, locale });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return { context, page, cdp };
}

export const nextFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
export const pageNow = (page) => page.evaluate(() => performance.now());

/** Uygulama ve (kayıt açıksa) Flashback hazır olana dek bekler. */
export async function waitReady(page, { pageName, mode }) {
  if (pageName === 'demo') await page.getByTestId('add-1').waitFor({ timeout: 60_000 });
  else await page.locator('#bump').waitFor({ timeout: 60_000 });
  if (mode === 'on') await page.locator('[data-fb="launcher"]').waitFor({ state: 'attached', timeout: 60_000 });
  if (mode !== 'off') {
    await page.waitForFunction(() => {
      try {
        return !!window.__benchRecord?.mirror.getMeta(document);
      } catch {
        return false;
      }
    }, null, { timeout: 60_000 });
  }
}

export async function collect(page) {
  return page.evaluate(() => ({ ...window.__bench, interactionCount: performance.interactionCount ?? null }));
}
