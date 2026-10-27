import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncidentStore, createMcpServer, generateReproScript, loadConfig, resolvePlaywright, type RewindConfig } from '../src/index.js';
import { startFixtureApp, type FixtureApp } from './fixtures/app.js';
import { codeOutsideData, draft, tmpDir } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * FR-MCP-14 kabul kriteri: "Taşınan dosya projenin Playwright'ı ile geçer."
 * Rewind'den bağımsız bir fixture proje kurulur: kendi package.json'ı, kendi node_modules'ü (depo
 * node_modules'üne bağlantı) ve kendi playwright.config dosyası (baseURL = fixture uygulama). Portable spec
 * projenin test klasörüne kopyalanır ve projenin Playwright CLI'ıyla, projenin yapılandırmasıyla çalıştırılır.
 */
function createProject(baseURL: string): string {
  const root = tmpDir('rewind-portable-project-');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-project', private: true }, null, 2));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(
    path.join(root, 'playwright.config.mjs'),
    `export default {
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: './test-results',
  use: { baseURL: ${JSON.stringify(baseURL)}, browserName: 'chromium', headless: true, trace: 'off', screenshot: 'off', video: 'off' },
};
`,
  );
  return root;
}

/**
 * Projenin kendi Playwright'ı ile, projenin yapılandırmasıyla (cwd'de bulunur) çalıştırır. Rewind ortam değişkenleri verilmez.
 * Eşzamansızdır: fixture uygulama bu süreçte çalışır, spawnSync olay döngüsünü kilitlerdi.
 */
function runProject(root: string, extraEnv: Record<string, string> = {}): Promise<{ status: number | null; out: string }> {
  const pw = resolvePlaywright(root);
  if (!pw) throw new Error('fixture projede @playwright/test çözülemedi');
  const env: NodeJS.ProcessEnv = { FORCE_COLOR: '0' };
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('REWIND_') && k !== 'NODE_PATH') env[k] = v;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [pw.cliPath, 'test'], { cwd: root, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (out += c.toString()));
    const timer = setTimeout(() => child.kill('SIGKILL'), 150_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, out });
    });
  });
}

describe('get_repro_script portable: projenin kendi Playwright yapılandırmasıyla (FR-MCP-14)', () => {
  let app: FixtureApp;
  let store: IncidentStore;
  let config: RewindConfig;

  beforeAll(async () => {
    app = await startFixtureApp();
    const dir = tmpDir('rewind-portable-e2e-');
    config = loadConfig({ REWIND_DIR: dir, REWIND_PROJECT_ROOT: REPO_ROOT }, { cwd: REPO_ROOT, homedir: '/nonexistent' });
    store = new IncidentStore(dir, { log: () => {} });
    store.init();
  });
  afterAll(() => app.close());

  it('YAZ10: kopyalanan spec düzeltmeden önce kırmızı, sonra yeşil; yollar projenin baseURL\'ine göre', async () => {
    // Olay başka bir kökende (localhost:5173) kaydedildi; proje baseURL'i fixture uygulama. Spec yalnızca göreli yol taşır.
    const inc = store.create(draft('http://localhost:5173'), config.projectId);
    const server = createMcpServer({ mode: 'ok', config, store });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'e2e', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    await client.listTools(); // istemci structuredContent'i şemayla doğrular
    const r = await client.callTool({
      name: 'get_repro_script',
      arguments: { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')", portable: true },
    });
    await client.close();
    expect(r.isError).not.toBe(true);
    const sc = r.structuredContent as { portable: boolean; spec: string; specPath: string };
    expect(sc.portable).toBe(true);
    expect(sc.spec).not.toContain('localhost:5173');
    expect(fs.readFileSync(sc.specPath, 'utf8')).toBe(sc.spec);

    const project = createProject(app.origin);
    fs.copyFileSync(sc.specPath, path.join(project, 'tests', path.basename(sc.specPath)));
    // Kaynak .rewind klasörü olmadan da çalışmalı.
    fs.rmSync(store.dir, { recursive: true, force: true });
    store.init();

    app.setFixed(false);
    const red = await runProject(project);
    expect(red.status, red.out).toBe(1);
    expect(red.out).toContain('1 failed');
    expect(red.out).toContain('toHaveText');
    expect(red.out).toContain('135030 ₺');

    app.setFixed(true);
    const green = await runProject(project);
    expect(green.status, green.out).toBe(0);
    expect(green.out).toContain('1 passed');

    // Sentetik giriş ortam değişkeninden okunur (REWIND_INPUT_EMAIL): geçersiz e-posta uygulamada hata metni üretir.
    const overridden = await runProject(project, { REWIND_INPUT_EMAIL: 'gecersiz' });
    expect(overridden.status, overridden.out).toBe(1);
    expect(overridden.out).toContain('e-posta geçersiz');
  });

  it('EK-B1: kod kaçışı içeren olay verisi taşınabilir spec çalışırken yan etki üretmez (FR-REPRO-SEC-05)', async () => {
    const marker = path.join(tmpDir('rewind-portable-marker-'), 'pwned');
    const m = JSON.stringify(marker);
    const payloads = [
      `'); require('fs').writeFileSync(${m}, 'x'); ('`,
      `\${require('fs').writeFileSync(${m}, 'x')}`,
      `"}; require("fs").writeFileSync(${m}, "x"); const z = {"`,
      `\`; require('fs').writeFileSync(${m}, 'x'); \``,
      `*/ require('fs').writeFileSync(${m}, 'x'); /*`,
      `\n};\nrequire('fs').writeFileSync(${m}, 'x');\nconst Y = {`,
      `/*__REWIND_ASSERTIONS__*/ require('fs').writeFileSync(${m}, 'x');`,
    ];
    const origin = app.origin;
    const d = draft(origin, {
      steps: [
        { t: 10, type: 'navigate', fallbackSelectors: [], url: `${origin}/?q='+require('fs').writeFileSync(${m},'x')+'` },
        { t: 20, type: 'navigate', fallbackSelectors: [], url: `javascript:require('fs').writeFileSync(${m},'x')` },
        { t: 30, type: 'input', selector: '#email', fallbackSelectors: payloads, value: payloads[0] },
        { t: 40, type: 'input', selector: '#coupon', fallbackSelectors: [], value: payloads.slice(1).join('|') },
        { t: 60, type: 'click', selector: payloads[3], fallbackSelectors: [payloads[4], payloads[5], '#apply'] },
      ],
      note: { expected: payloads.join('\n') },
    });
    d.target!.selector = payloads[0];
    d.target!.fallbackSelectors = payloads.slice(1);
    const inc = store.create(d, config.projectId);
    const assertions = `await expect(target).toHaveText(${JSON.stringify(payloads[0])});\nawait expect(page.locator(${JSON.stringify(payloads[3])})).toHaveCount(0);`;
    const script = generateReproScript({ config, store }, { id: inc.id, assertions, portable: true });
    expect(codeOutsideData(script.spec)).not.toContain(marker);

    // Tuş alanındaki kaçış: yalnızca Playwright'a veri olarak gider.
    const keyInc = store.create(
      draft(origin, { steps: [{ t: 50, type: 'key', selector: '#coupon', fallbackSelectors: [], key: payloads[2] }] }),
      config.projectId,
    );
    const keyScript = generateReproScript({ config, store }, { id: keyInc.id, assertions: "await expect(target).toHaveText('1380 ₺')", portable: true });
    expect(codeOutsideData(keyScript.spec)).not.toContain(marker);

    const project = createProject(origin);
    fs.writeFileSync(path.join(project, 'tests', 'injection.spec.ts'), script.spec);
    fs.writeFileSync(path.join(project, 'tests', 'injection-key.spec.ts'), keyScript.spec);
    app.setFixed(false);
    const run = await runProject(project);
    // İki test de çalışır ve başarısız olur (beklenti / bilinmeyen tuş); hiçbiri işaret dosyası oluşturmaz.
    expect(run.status, run.out).toBe(1);
    expect(run.out).toContain('2 failed');
    expect(run.out).toContain('toHaveText');
    expect(run.out).toContain('Unknown key');
    expect(fs.existsSync(marker)).toBe(false);
  });
});
