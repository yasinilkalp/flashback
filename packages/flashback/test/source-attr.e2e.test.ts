/**
 * R13: `flashback-devtools/vite` kaynak eklentisi, React 19 + Vite demo (eklenti açık), Chromium.
 * Önce öğelerin tamamı özniteliğe göre doğru satırı vermeli. Sonra `Cart.tsx`'in başına iki satır eklenir (Fast
 * Refresh): hem HMR'den önce kaydedilen klipte (canlı öğenin özniteliği) hem yeni klipte konum yeni satırı göstermeli.
 * Eklentisiz React 19'da bu durum `resolved:false` olur (EK-B3). Dosya test sonunda geri yazılır.
 * Önkoşul: `npm run build`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findTarget,
  formatResults,
  measureSources,
  openApp,
  openPanel,
  pickSource,
  recordAgain,
  repo,
  sendSelected,
  startReceiver,
  startVite,
  summarize,
  type DevServer,
  type Receiver,
  type SourceTarget,
} from './e2e-utils.js';

const demoDir = join(repo, 'examples/demo');
const cartFile = join(demoDir, 'src/Cart.tsx');
const T = (id: string, css: string, file: string, find: string): SourceTarget => findTarget(demoDir, id, css, `src/${file}`, find);

const targets: SourceTarget[] = [
  T('header', 'header', 'App.tsx', '<header>'),
  T('link', 'nav a[href$="/account"]', 'App.tsx', '<a href={to}'),
  T('products-title', '#products-title', 'ProductList.tsx', '<h2 id="products-title">'),
  T('product-price', '.products li span:nth-of-type(2)', 'ProductList.tsx', '<span>{formatTry(p.price)}</span>'),
  T('add', '[data-testid="add-1"]', 'ProductList.tsx', '<button type="button" data-testid={`add-${p.id}`}'),
  T('cart-li', '.cart li', 'Cart.tsx', '<li key={i.id}>'),
  T('subtotal', '[data-testid="subtotal"]', 'Cart.tsx', '<dd data-testid="subtotal">'),
  T('total', '[data-testid="total"]', 'Cart.tsx', '<dd data-testid="total">'),
  T('coupon', '#coupon', 'Cart.tsx', '<input id="coupon"'),
];

describe.runIf(process.env.FLASHBACK_E2E)('flashback-devtools/vite: data-flashback-source (R13)', () => {
  let receiver: Receiver;
  let vite: DevServer;
  let browser: Browser;
  let page: Page;
  const original = readFileSync(cartFile, 'utf8');

  beforeAll(async () => {
    receiver = await startReceiver();
    process.env.VITE_FLASHBACK_ENDPOINT = receiver.url;
    process.env.FLASHBACK_DEMO_DETERMINISTIC = '1';
    delete process.env.FLASHBACK_DEMO_SOURCE_ATTR;
    vite = await startVite(demoDir);
    browser = await chromium.launch();
    page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
  });

  afterAll(async () => {
    writeFileSync(cartFile, original);
    await browser?.close();
    await vite?.close();
    await receiver?.close();
  });

  it('öznitelikle tüm hedefler doğru dosya:satır', async () => {
    const errors = await openApp(page, vite.url, 300);
    expect(await page.getAttribute('[data-testid="subtotal"]', 'data-flashback-source')).toMatch(/^src\/Cart\.tsx:\d+:\d+$/);
    await page.getByTestId('add-1').click();
    await expect.poll(() => page.getByTestId('subtotal').textContent()).toBe('250 ₺');
    await page.waitForTimeout(1000);
    await openPanel(page);
    const results = await measureSources(page, targets);
    console.log(formatResults('React 19 + Vite + kaynak eklentisi', results));
    expect(summarize(results)).toMatchObject({ correct: targets.length, wrong: 0, unresolved: 0 });
    expect(errors).toEqual([]);
  });

  it('HMR sonrası (Fast Refresh) eski ve yeni klipte güncel satır; yükte öznitelik yok', async () => {
    const subtotal = targets.find((t) => t.id === 'subtotal')!;
    const total = targets.find((t) => t.id === 'total')!;
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(cartFile, `// HMR denemesi 1${eol}// HMR denemesi 2${eol}${original}`);
    await page.waitForFunction(
      (line) => document.querySelector('[data-testid="subtotal"]')?.getAttribute('data-flashback-source')?.split(':')[1] === String(line),
      subtotal.line + 2,
      { timeout: 30_000 },
    );

    // HMR'den önce kaydedilen klip: canlı öğe yeniden render edildi, özniteliği yeni satırı gösterir.
    expect(await pickSource(page, subtotal.css)).toBe(`src/Cart.tsx:${subtotal.line + 2}`);

    await recordAgain(page);
    expect(await pickSource(page, total.css)).toBe(`src/Cart.tsx:${total.line + 2}`);
    const draft = await sendSelected(page, receiver);
    expect(draft.target).toMatchObject({ file: 'src/Cart.tsx', line: total.line + 2, resolved: true });
    expect(draft.target?.snippet?.lines.join('\n')).toContain('<dd data-testid="total">');
    expect(draft.target?.snippet?.lines.join('\n')).not.toContain('data-flashback-source');
    expect(draft.confidence.find((c) => c.key === 'source')?.message).toMatch(/derleme eklentisi/);
    // Öznitelik panelde kalır ama yüke (olaylar, öğe HTML'i, DOM) girmez.
    expect(JSON.stringify(draft)).not.toContain('data-flashback-source');
  });
});
