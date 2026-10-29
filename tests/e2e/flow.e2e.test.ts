/**
 * Uçtan uca akış: demo (Vite + eklenti) → seçim kipi → öğeye tıkla → not → Enter → `.flashback/<id>.md` + pano →
 * `flashback-mcp` (gerçek stdio) raporu verir. Önce: `npm run build` ve `npx playwright install chromium`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const demo = join(repo, 'examples', 'demo');

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

/** Demonun kendi Vite sürümüyle süreç içi geliştirme sunucusu. */
async function startDemo(): Promise<{ url: string; close(): Promise<void> }> {
  const entry = createRequire(join(demo, 'package.json')).resolve('vite');
  const { createServer } = (await import(pathToFileURL(entry).href)) as { createServer: (c: object) => Promise<ViteServer> };
  const port = await freePort();
  const vite = await createServer({ root: demo, configFile: join(demo, 'vite.config.ts'), logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1' } });
  await vite.listen();
  return { url: `http://localhost:${port}`, close: () => vite.close() };
}

const ui = (page: Page, fb: string) => page.locator(`flashback-devtools [data-fb="${fb}"]`);

describe('Flashback akışı', () => {
  let dir: string;
  let server: { url: string; close(): Promise<void> };
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'flashback-e2e-'));
    process.env.FLASHBACK_DIR = dir;
    process.env.FLASHBACK_DEMO_DETERMINISTIC = '1';
    server = await startDemo();
    browser = await chromium.launch();
    const context = await browser.newContext({ locale: 'tr-TR', permissions: ['clipboard-read', 'clipboard-write'] });
    page = await context.newPage();
    await page.goto(server.url);
    await ui(page, 'fab').waitFor();
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    delete process.env.FLASHBACK_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  async function report(note: string, pick: () => Promise<void>): Promise<{ clipboard: string; markdown: string; file: string }> {
    await page.keyboard.press('Alt+Shift+F');
    await ui(page, 'hint').waitFor();
    await pick();
    await ui(page, 'note-input').fill(note);
    await ui(page, 'note-input').press('Enter');
    await ui(page, 'toast').waitFor();
    // Windows panosu satır sonlarını CRLF yapar.
    const clipboard = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    const file = (await ui(page, 'toast-path').textContent()) ?? '';
    return { clipboard, file, markdown: existsSync(file) ? readFileSync(file, 'utf8') : '' };
  }

  it('öğeye tıkla, bir cümle yaz: rapor dosyaya yazılır, panoya kısa istem gider', async () => {
    for (const id of [1, 2, 3]) await page.getByTestId(`add-${id}`).click();
    await page.locator('#coupon').fill('YAZ10');
    await page.getByRole('button', { name: 'Uygula' }).click();
    await expect.poll(() => page.getByTestId('total').textContent()).toContain('135030');

    const total = page.getByTestId('total');
    const { clipboard, file, markdown } = await report('Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor', async () => {
      await total.hover();
      await expect.poll(() => ui(page, 'tag').textContent()).toContain('Cart.tsx:69');
      await total.click();
      await expect.poll(() => ui(page, 'note-src').textContent()).toContain('Cart.tsx:69');
    });

    expect(file).toMatch(/fb-\d{8}-\d{6}-[a-z0-9]+\.md$/);
    expect(clipboard).toBe(`Flashback raporunu oku ve hatayı düzelt: ${file}\n\nNot: Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor`);
    expect(markdown.split('\n')[0]).toBe('# Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor');
    expect(markdown).toContain('`examples/demo/src/Cart.tsx:69` · <Cart>');
    expect(markdown).toContain('▶ 69 │         <dd data-testid="total">{formatTry(total)}</dd>');
    // Kök neden: sayfa yüklenirken alınan kargo ücreti metin.
    expect(markdown).toMatch(/GET `http:\/\/localhost:\d+\/api\/shipping` → 200[^\n]*\n {2}- yanıt: `\{"fee":"30"\}`/);
    expect(markdown).toContain('POST `http://localhost');
    expect(markdown).toContain('tıkla `Uygula`');
    // Seçim tıklaması uygulamaya ulaşmaz ve adım olarak kaydedilmez.
    expect(markdown).not.toContain('tıkla `135030');
    expect(markdown).not.toContain('data-flashback-source');
  });

  it('Enter ile sayfa geneli rapor; KIS20 500 hatası raporda', async () => {
    await page.locator('#coupon').fill('KIS20');
    await page.getByRole('button', { name: 'Uygula' }).click();
    await page.waitForTimeout(300);
    const { markdown } = await report('Kupon hatası kullanıcıya gösterilmiyor', () => page.keyboard.press('Enter'));
    expect(markdown).toContain('Öğe seçilmedi; rapor sayfanın geneli için.');
    expect(markdown).toMatch(/POST `http:\/\/localhost:\d+\/api\/coupon` → 500/);
    expect(markdown).toContain('Kupon isteği başarısız');
  });

  it('Esc vazgeçer; seçim kipi kapanınca sayfa tıklamaları yine çalışır', async () => {
    await page.keyboard.press('Alt+Shift+F');
    await ui(page, 'hint').waitFor();
    await page.keyboard.press('Escape');
    await expect.poll(() => ui(page, 'hint').count()).toBe(0);
    const before = await page.getByTestId('total').textContent();
    await page.getByTestId('add-1').click();
    await expect.poll(() => page.getByTestId('total').textContent()).not.toBe(before);
  });

  it('flashback-mcp en yeni raporu verir', async () => {
    const client = new Client({ name: 'e2e', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [join(repo, 'packages', 'mcp', 'dist', 'cli.js')], env: { ...process.env, FLASHBACK_DIR: dir } as Record<string, string> }),
    );
    const list = (await client.callTool({ name: 'list_reports', arguments: {} })) as { structuredContent: { reports: Array<{ title: string }> } };
    expect(list.structuredContent.reports.map((r) => r.title)).toEqual(['Kupon hatası kullanıcıya gösterilmiyor', 'Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor']);
    const latest = (await client.callTool({ name: 'get_report', arguments: {} })) as { content: Array<{ text: string }> };
    expect(latest.content[0].text).toContain('# Kupon hatası kullanıcıya gösterilmiyor');
    await client.close();
  });
});
