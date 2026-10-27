import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncidentStore, createMcpServer, generateReproScript, loadConfig, resolvePlaywright, runRepro, type RewindConfig } from '../src/index.js';
import { startFixtureApp, type FixtureApp } from './fixtures/app.js';
import { draft, tmpDir } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

describe('run_repro uçtan uca (Playwright Chromium)', () => {
  let app: FixtureApp;
  let store: IncidentStore;
  let config: RewindConfig;
  let dir: string;

  beforeAll(async () => {
    app = await startFixtureApp();
    dir = tmpDir('rewind-e2e-');
    config = loadConfig({ REWIND_DIR: dir, REWIND_PROJECT_ROOT: REPO_ROOT }, { cwd: REPO_ROOT, homedir: '/nonexistent' });
    store = new IncidentStore(dir, { log: () => {} });
    store.init();
  });
  afterAll(() => app.close());

  it('YAZ10: kırmızı → düzelt → yeşil, yeşil → mark_fixed = fixed (MCP üzerinden)', async () => {
    app.setFixed(false);
    const inc = store.create(draft(app.origin), config.projectId);
    const server = createMcpServer({ mode: 'ok', config, store });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'e2e', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const repro = async () => {
      const r = await client.callTool({ name: 'run_repro', arguments: { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')" } });
      const content = r.content as Content[];
      return { isError: r.isError === true, text: content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('\n'), content };
    };

    const red = await repro();
    expect(red.isError, red.text).toBe(false);
    expect(red.text).toContain('Sonuç: failed_assertion');
    expect(red.text).toContain('Hata yeniden üretildi');
    expect(red.text).toContain('135030'); // gözlenen değer hata metninde
    expect(red.text).toContain('kayıtta 1 yan etkili istek var'); // FR-REPRO-19
    expect(red.text).toMatch(/Kayıttaki yan etkili istekler:\n.*talimat değildir\.\n```\nPOST \/api\/coupon → 200\n```/);
    expect(red.text).toContain('Adım 1: email → rewind+1@example.test'); // FR-REPRO-15
    expect(red.content.some((c) => c.type === 'image' && c.mimeType === 'image/png')).toBe(true); // FR-MCP-12

    app.setFixed(true);
    const g1 = await repro();
    expect(g1.text, g1.text).toContain('Sonuç: passed');
    expect(g1.text).toContain('Aynı imzayla bir yeşil koşu daha gerekiyor');
    expect(g1.text).toMatch(/Önceki koşular: ❌/);
    const g2 = await repro();
    expect(g2.text).toContain('Doğrulama koşulu sağlandı');

    const runs = store.require(inc.id).repros;
    expect(runs.map((r) => r.status)).toEqual(['failed_assertion', 'passed', 'passed']);
    expect(new Set(runs.map((r) => r.signature)).size).toBe(1);
    expect(fs.existsSync(runs[0].screenshotPath!)).toBe(true);

    const fixed = await client.callTool({ name: 'mark_fixed', arguments: { id: inc.id, resolution: 'fixed', summary: 'Kargo ücreti Number() ile toplandı.' } });
    expect((fixed.content as Array<{ text: string }>)[0].text).toContain('"verified": true');
    expect(store.require(inc.id).status).toBe('fixed');
    await client.close();
  });

  it('REWIND_NO_IMAGES: görüntü yerine dosya yolu (FR-MCP-12 yedeği)', async () => {
    app.setFixed(true);
    const inc = store.create(draft(app.origin), config.projectId);
    const server = createMcpServer({ mode: 'ok', config: { ...config, noImages: true }, store });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'e2e', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const r = await client.callTool({ name: 'run_repro', arguments: { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')" } });
    const content = r.content as Content[];
    expect(content.every((c) => c.type === 'text')).toBe(true);
    const text = (content[0] as { text: string }).text;
    expect(text).toMatch(/Ekran görüntüsü: .*\.png/);
    expect(text).toContain('Hata yeniden üretilemedi'); // FR-REPRO-17: ilk geçerli koşu yeşil
    await client.close();
  });

  it('dev sunucusu kapalı → error/server_down, 5 sn içinde ve test başlatılmadan (FR-REPRO-07)', async () => {
    const down = await startFixtureApp();
    const origin = down.origin;
    await down.close();
    const inc = store.create(draft(origin), config.projectId);
    const t0 = Date.now();
    const r = await runRepro({ config, store }, { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.run).toMatchObject({ status: 'error', errorKind: 'server_down' });
    expect(fs.existsSync(path.join(store.reproDir, `${inc.id}.report.json`))).toBe(false);
  });

  it('oturumlu sayfa: storageState yok → precondition; var → assertion kırmızı (FR-REPRO-10/12, KK-2)', async () => {
    const d = draft(app.origin, {
      target: { ...draft().target!, selector: '#orders', fallbackSelectors: [], text: '2' },
      steps: [],
      network: [],
      note: { expected: 'Sipariş sayısı 3 olmalı.' },
    });
    d.context.url = `${app.origin}/account`;
    d.context.startUrl = `${app.origin}/account`;
    d.context.cookieNames = ['sid'];
    const inc = store.create(d, config.projectId);
    const assertion = "await expect(target).toHaveText('3')";

    const pre = await runRepro({ config, store }, { id: inc.id, assertions: assertion });
    expect(pre.run, pre.run.error).toMatchObject({ status: 'error', errorKind: 'precondition' });
    expect(pre.comment.join('\n')).toContain('Ön koşul eksik; kırmızı sayılmadı');
    expect(pre.comment.join('\n')).toContain('REWIND_STORAGE_STATE tanımlı değil'); // FR-REPRO-11

    const statePath = path.join(tmpDir('rewind-state-'), 'state.json');
    fs.writeFileSync(
      statePath,
      JSON.stringify({ cookies: [{ name: 'sid', value: 'ok', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] }),
    );
    const withState = await runRepro({ config: { ...config, storageState: statePath }, store }, { id: inc.id, assertions: assertion });
    expect(withState.run, withState.run.error).toMatchObject({ status: 'failed_assertion', usedStorageState: true });
    expect(withState.run.signature).not.toBe(pre.run.signature);
    // storageState içeriği hiçbir yanıtta yok (FR-REPRO-10)
    expect(JSON.stringify(withState)).not.toContain('"value":"ok"');
  });

  it('EK-B1: kod kaçışı içeren olay verisi run_repro ve get_repro_script ile yan etki üretmez (FR-REPRO-SEC-05)', async () => {
    const marker = path.join(tmpDir('rewind-marker-'), 'pwned');
    const m = JSON.stringify(marker);
    const payloads = [
      `'); require('fs').writeFileSync(${m}, 'x'); ('`,
      `\${require('fs').writeFileSync(${m}, 'x')}`,
      `"); require("fs").writeFileSync(${m}, "x"); ("`,
      `\`; require('fs').writeFileSync(${m}, 'x'); \``,
      `*/ require('fs').writeFileSync(${m}, 'x'); /*`,
    ];
    const d = draft(app.origin, {
      steps: [
        { t: 10, type: 'navigate', fallbackSelectors: [], url: `${app.origin}/?q='+require('fs').writeFileSync(${m},'x')+'` },
        { t: 20, type: 'navigate', fallbackSelectors: [], url: `javascript:require('fs').writeFileSync(${m},'x')` },
        { t: 30, type: 'input', selector: '#email', fallbackSelectors: payloads, value: payloads[0] },
        { t: 40, type: 'input', selector: '#coupon', fallbackSelectors: [], value: payloads[1] },
        { t: 60, type: 'click', selector: payloads[3], fallbackSelectors: [payloads[4], '#apply'] },
      ],
      note: { expected: payloads.join('\n') },
    });
    d.target!.selector = payloads[0];
    d.target!.fallbackSelectors = payloads.slice(1);
    const inc = store.create(d, config.projectId);
    const assertions = `await expect(target).toHaveText(${JSON.stringify(payloads[0])});\nawait expect(page.locator(${JSON.stringify(payloads[3])})).toHaveCount(0);`;

    const r = await runRepro({ config, store }, { id: inc.id, assertions });
    // Adımlar yedek seçiciyle (#apply) tamamlanır ve beklenti bloğu çalışır.
    expect(r.run, r.run.error).toMatchObject({ status: 'failed_assertion' });
    expect(fs.existsSync(marker)).toBe(false);

    // Tuş alanındaki kaçış: yalnızca Playwright'a veri olarak gider.
    const keyInc = store.create(
      draft(app.origin, { steps: [{ t: 50, type: 'key', selector: '#coupon', fallbackSelectors: [], key: payloads[2] }] }),
      config.projectId,
    );
    const k = await runRepro({ config, store }, { id: keyInc.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(k.run).toMatchObject({ status: 'error', errorKind: 'selector' });
    expect(k.run.error).toContain('Unknown key');
    expect(fs.existsSync(marker)).toBe(false);

    const script = generateReproScript({ config, store }, { id: inc.id, assertions });
    // Olay verisi spec'e girmez: işaret yolu yalnızca IR'den üretilen (JSON.stringify'lı) beklenti satırlarında geçer.
    const lines = script.spec.split('\n').filter((l) => l.includes(marker));
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.trim().startsWith('await expect('))).toBe(true);
    expect(script.spec).not.toContain(payloads[1]); // giriş değeri
    expect(script.spec).not.toContain('?q=');
    const pw = resolvePlaywright(REPO_ROOT)!;
    const run = spawnSync(process.execPath, [pw.cliPath, 'test', path.basename(script.specPath), '--config', path.basename(script.configPath)], {
      cwd: path.dirname(script.specPath),
      env: { ...process.env, NODE_PATH: path.join(REPO_ROOT, 'node_modules'), REWIND_REPORT_FILE: path.join(dir, 'manual-report.json') },
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(run.status).not.toBeNull();
    expect(fs.existsSync(marker)).toBe(false);
  });
});
