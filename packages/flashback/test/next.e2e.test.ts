/**
 * EK-B3 (FRD §3.5): Next.js 16 App Router + React 19 (Next'in paketlediği sürüm) — Turbopack ve webpack geliştirme
 * sunucularında JSX kaynak çözümleme. Panelin gerçek seçim yolu kullanılır; her öğenin beklenen satırı kaynaktaki
 * `data-testid` işaretinden okunur.
 * Önkoşul: `npm run build` (örnek flashback-devtools'u dist'ten kullanır).
 */
import { existsSync } from 'node:fs';
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
  recordAgain,
  sendSelected,
  startNext,
  startReceiver,
  summarize,
  judge,
  type DevServer,
  type Receiver,
} from './e2e-utils.js';

const appDir = join(repo, 'examples/next-app');
// `app/owner-limit` ayrı sayfadır (sınır durumu testi), ana sayfa ölçümüne girmez.
const all = markerTargets(appDir, ['app']);
const targets = all.filter((t) => !t.file.startsWith('app/owner-limit/'));
const ownerLimit = all.find((t) => t.id === 'after-owner-limit')!;
const byId = (id: string) => targets.find((t) => t.id === id)!;

for (const mode of [
  { name: 'Turbopack', webpack: false },
  { name: 'webpack', webpack: true },
]) {
  describe.runIf(process.env.FLASHBACK_E2E)(`Next.js App Router (${mode.name}) + Chromium: JSX kaynak çözümleme`, () => {
    let receiver: Receiver;
    let next: DevServer;
    let browser: Browser;
    let page: Page;
    let errors: string[];

    beforeAll(async () => {
      if (!existsSync(join(repo, 'packages/flashback/dist/index.js'))) throw new Error('flashback-devtools derlenmemiş: önce `npm run build`');
      receiver = await startReceiver();
      next = await startNext(appDir, { webpack: mode.webpack, env: { NEXT_PUBLIC_FLASHBACK_ENDPOINT: receiver.url } });
      browser = await chromium.launch();
      page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
      errors = await openApp(page, next.url);
      await openPanel(page);
    }, 240_000);

    afterAll(async () => {
      await browser?.close();
      await next?.close();
      await receiver?.close();
    });

    it('istemci bileşenleri: ≥ %90 doğru dosya:satır, 0 yanlış; RSC öğeleri: doğru ya da resolved:false, 0 yanlış', async () => {
      expect(targets.filter((t) => !t.server).length).toBeGreaterThanOrEqual(20);
      const results = await measureSources(page, targets);
      console.log(formatResults(`Next ${mode.name}`, results));
      const client = summarize(results.filter((r) => !r.server));
      const server = summarize(results.filter((r) => r.server));
      expect(client.wrong).toBe(0);
      expect(client.missing).toBe(0);
      expect(client.correctPct).toBeGreaterThanOrEqual(90);
      expect(server.wrong).toBe(0);
      expect(errors).toEqual([]);
    });

    it('olay paketi: istemci öğesi için dosya:satır, kod parçası, bileşen yığını', async () => {
      const total = byId('total');
      expect(await pickSource(page, total.css)).toMatch(/Cart\.tsx:\d+$/);
      const draft = await sendSelected(page, receiver, 'Toplam doğru olmalı.');
      const t = draft.target!;
      expect(t.file!.split('\\').join('/')).toMatch(/(?:^|\/)app\/components\/Cart\.tsx$/);
      expect(t.line).toBe(total.line);
      expect(t.resolved).toBe(true);
      expect(t.resolution).toBe('exact');
      expect(t.snippet?.lines.join('\n')).toContain('data-testid="total"');
      expect(t.componentStack[0]).toBe('Cart');
      expect(t.componentStack).toContain('Shop');
      expect(draft.source.framework).toBe('react');
      expect(draft.confidence.find((c) => c.key === 'source')!.level).toBe('ok');
      await recordAgain(page);
    });

    it('olay paketi: RSC öğesi asla yanlış satır vermez ve RSC olduğu belirtilir', async () => {
      const title = byId('srv-title');
      await pickSource(page, title.css);
      const draft = await sendSelected(page, receiver, 'Başlık doğru olmalı.');
      const t = draft.target!;
      if (t.resolved) {
        expect(t.file!.split('\\').join('/')).toMatch(/(?:^|\/)app\/page\.tsx$/);
        expect(t.line).toBe(title.line);
      }
      expect(t.resolutionReason).toContain('React Server Component');
      // Sunucu bileşenlerinin istemci fiber'ı yoktur; yığında sunucu bileşeni adı görünmez.
      expect(t.componentStack).not.toContain('Page');
      await recordAgain(page);
    });

    it('React sahip yığını sınırı (>10 000 öğe/sn): öğenin kendi satırı yok → ata öğe olarak işaretlenir, asla sessizce yanlış satır', async () => {
      const p = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
      await openApp(p, `${next.url}/owner-limit`);
      const stack = await p.evaluate(() => {
        const el = document.querySelector('[data-testid="after-owner-limit"]')!;
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
        return (el as unknown as Record<string, { _debugStack?: { stack?: string } }>)[key]._debugStack?.stack ?? '';
      });
      expect(stack).toContain('UnknownOwner');
      await openPanel(p);
      const shown = await pickSource(p, ownerLimit.css);
      console.log(`[EK-B3] Next ${mode.name} sahip yığını sınırı: ${shown}`);
      expect(['ancestor', 'unresolved', 'missing']).toContain(judge(shown, ownerLimit));
      await p.close();
    });
  });
}
