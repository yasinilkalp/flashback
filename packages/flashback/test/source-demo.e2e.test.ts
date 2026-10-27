/**
 * EK-B3 (FRD §3.5): React 19 + Vite 8 demo — Chromium ve (kuruluysa) Firefox. Firefox'ta yığın biçimi
 * `fn@url:satır:sütun`'dur. Firefox Playwright tarayıcısı yoksa (`npx playwright install firefox`) o kısım atlanır.
 * Önkoşul: `npm run build`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, firefox, type Browser, type BrowserType, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findTarget,
  formatResults,
  measureSources,
  openApp,
  openPanel,
  repo,
  startReceiver,
  startVite,
  summarize,
  type DevServer,
  type Receiver,
  type SourceTarget,
} from './e2e-utils.js';

const demoDir = join(repo, 'examples/demo');
const T = (id: string, css: string, file: string, find: string): SourceTarget => findTarget(demoDir, id, css, `src/${file}`, find);

/** Demo kaynağına dokunmadan 24 öğe: beklenen satır, dosyada tek geçen bir JSX parçasından bulunur. */
const targets: SourceTarget[] = [
  T('app', '.app', 'App.tsx', '<div className="app">'),
  T('header', 'header', 'App.tsx', '<header>'),
  T('h1', 'h1', 'App.tsx', '<h1>Flashback Mağaza</h1>'),
  T('nav', 'nav', 'App.tsx', '<nav aria-label='),
  T('link', 'nav a[href$="/account"]', 'App.tsx', '<a href={to}'),
  T('main', 'main', 'App.tsx', '<main>'),
  T('shop', '.shop', 'App.tsx', '<div className="shop">'),
  T('products', 'section.products', 'ProductList.tsx', '<section className="products"'),
  T('products-title', '#products-title', 'ProductList.tsx', '<h2 id="products-title">'),
  T('product-li', '.products li', 'ProductList.tsx', '<li key={p.id}>'),
  T('product-name', '.products li span:first-of-type', 'ProductList.tsx', '<span>{p.name}</span>'),
  T('product-price', '.products li span:nth-of-type(2)', 'ProductList.tsx', '<span>{formatTry(p.price)}</span>'),
  T('add', '[data-testid="add-1"]', 'ProductList.tsx', '<button type="button" data-testid={`add-${p.id}`}'),
  T('cart', 'section.cart', 'Cart.tsx', '<section className="cart"'),
  T('cart-title', '#cart-title', 'Cart.tsx', '<h2 id="cart-title">'),
  T('cart-li', '.cart li', 'Cart.tsx', '<li key={i.id}>'),
  T('dl', '.cart dl', 'Cart.tsx', '<dl>'),
  T('dt', '.cart dt', 'Cart.tsx', '<dt>Ara toplam</dt>'),
  T('subtotal', '[data-testid="subtotal"]', 'Cart.tsx', '<dd data-testid="subtotal">'),
  T('total', '[data-testid="total"]', 'Cart.tsx', '<dd data-testid="total">'),
  T('dt-shipping', '.cart dt:nth-of-type(2)', 'Cart.tsx', '<dt>Kargo</dt>'),
  T('label', 'label[for="coupon"]', 'Cart.tsx', '<label htmlFor="coupon">'),
  T('coupon', '#coupon', 'Cart.tsx', '<input id="coupon"'),
  T('apply', '.cart form button', 'Cart.tsx', '<button type="submit">'),
];

const browsers: Array<{ name: string; type: BrowserType; available: boolean }> = [
  { name: 'Chromium', type: chromium, available: true },
  { name: 'Firefox', type: firefox, available: existsSync(firefox.executablePath()) },
];

describe.runIf(process.env.FLASHBACK_E2E)('React 19 + Vite demo: JSX kaynak çözümleme matrisi', () => {
  let receiver: Receiver;
  let vite: DevServer;

  beforeAll(async () => {
    receiver = await startReceiver();
    process.env.VITE_FLASHBACK_ENDPOINT = receiver.url;
    process.env.FLASHBACK_DEMO_DETERMINISTIC = '1';
    vite = await startVite(demoDir);
  });

  afterAll(async () => {
    await vite?.close();
    await receiver?.close();
  });

  for (const b of browsers) {
    describe(b.name, () => {
      let browser: Browser;
      let page: Page;

      beforeAll(async () => {
        if (!b.available) return;
        browser = await b.type.launch();
        page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
      });
      afterAll(async () => browser?.close());

      it.runIf(b.available)('≥ %90 doğru dosya:satır, 0 yanlış', async () => {
        const errors = await openApp(page, vite.url, 300);
        await page.getByTestId('add-1').click();
        await expect.poll(() => page.getByTestId('subtotal').textContent()).toBe('250 ₺');
        await page.waitForTimeout(1000);
        await openPanel(page);
        const results = await measureSources(page, targets);
        console.log(formatResults(`React 19 + Vite + ${b.name}`, results));
        const s = summarize(results);
        expect(s.wrong).toBe(0);
        expect(s.missing).toBe(0);
        expect(s.correctPct).toBeGreaterThanOrEqual(90);
        expect(errors).toEqual([]);
      });
    });
  }
});
