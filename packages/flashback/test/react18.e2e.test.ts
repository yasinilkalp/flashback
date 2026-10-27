/**
 * EK-B3 (FRD §3.5): React 18.3 + Vite 8 (@vitejs/plugin-react 6) + Chromium. React 18'de kaynak satırı fiber'ın
 * `_debugSource` alanından gelir (JSX geliştirme dönüşümü `jsxDEV`'e dosya/satır geçirir).
 * Önkoşul: `npm run build`.
 */
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatResults,
  markerTargets,
  measureSources,
  openApp,
  openPanel,
  pickSource,
  repo,
  sendSelected,
  startReceiver,
  startVite,
  summarize,
  type DevServer,
  type Receiver,
} from './e2e-utils.js';

const appDir = join(repo, 'examples/react18');
const targets = markerTargets(appDir, ['src']);

describe.runIf(process.env.FLASHBACK_E2E)('React 18.3 + Vite + Chromium: JSX kaynak çözümleme (_debugSource)', () => {
  let receiver: Receiver;
  let vite: DevServer;
  let browser: Browser;
  let page: Page;
  let errors: string[];

  beforeAll(async () => {
    receiver = await startReceiver();
    process.env.VITE_FLASHBACK_ENDPOINT = receiver.url;
    vite = await startVite(appDir);
    browser = await chromium.launch();
    page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
    errors = await openApp(page, vite.url);
    // Gerçekten React 18 yolu: fiber'da `_debugSource` var, `_debugStack` yok.
    const debug = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="title"]')!;
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
      const f = (el as unknown as Record<string, { _debugSource?: unknown; _debugStack?: unknown }>)[key];
      return { source: !!f._debugSource, stack: !!f._debugStack };
    });
    expect(debug).toEqual({ source: true, stack: false });
    await openPanel(page);
  });

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await receiver?.close();
  });

  it('≥ %90 doğru dosya:satır, 0 yanlış', async () => {
    expect(targets.length).toBeGreaterThanOrEqual(20);
    const results = await measureSources(page, targets);
    console.log(formatResults('React 18 + Vite', results));
    const s = summarize(results);
    expect(s.wrong).toBe(0);
    expect(s.missing).toBe(0);
    expect(s.correctPct).toBeGreaterThanOrEqual(90);
    expect(errors).toEqual([]);
  });

  it('olay paketi: dev sunucusu köküne göreli yol, kod parçası ve bileşen yığını', async () => {
    const total = targets.find((t) => t.id === 'total')!;
    expect(await pickSource(page, total.css)).toBe(`src/Cart.tsx:${total.line}`);
    const draft = await sendSelected(page, receiver);
    const t = draft.target!;
    expect(t).toMatchObject({ file: 'src/Cart.tsx', line: total.line, resolved: true, resolution: 'exact' });
    expect(t.snippet?.lines.join('\n')).toContain('data-testid="total"');
    expect(t.componentStack.slice(0, 2)).toEqual(['Cart', 'App']);
    expect(draft.confidence.find((c) => c.key === 'source')!.level).toBe('ok');
  });
});
