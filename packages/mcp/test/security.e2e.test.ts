import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { IncidentDraft } from '@rewind/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncidentStore, createMcpServer, loadConfig, runRepro, type RewindConfig } from '../src/index.js';
import { startFixtureApp, startForeignServer, type FixtureApp, type ForeignServer } from './fixtures/app.js';
import { draft, outsideFences, tmpDir } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PW = 'Real-Dev-Password-123!';
const USER = 'Secret-User-Name-77';
const LEAKS = [PW, encodeURIComponent(PW), 'Real-Dev-Password-123%21', USER];

type Content = { type: string; text?: string };

/** Klasördeki tüm dosyaların içeriği (alt klasörler dahil). */
function readAll(dir: string): string {
  let out = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out += e.isDirectory() ? readAll(p) : `\n${p}\n${fs.readFileSync(p, 'latin1')}`;
  }
  return out;
}

describe('repro güvenlik regresyonları (Playwright Chromium)', () => {
  let foreign: ForeignServer;
  let app: FixtureApp;
  let store: IncidentStore;
  let config: RewindConfig;
  let dir: string;

  beforeAll(async () => {
    foreign = await startForeignServer();
    app = await startFixtureApp({ foreign: foreign.origin });
    dir = tmpDir('rewind-sec-e2e-');
    config = { ...loadConfig({ REWIND_DIR: dir, REWIND_PROJECT_ROOT: REPO_ROOT }, { cwd: REPO_ROOT, homedir: '/nonexistent' }), password: PW };
    store = new IncidentStore(dir, { log: () => {} });
    store.init();
    process.env.REWIND_INPUT_USERNAME = USER;
  });
  afterAll(async () => {
    delete process.env.REWIND_INPUT_USERNAME;
    await app.close();
    await foreign.close();
  });

  const loginDraft = (startPath: string, over: Partial<IncidentDraft> = {}): IncidentDraft => {
    const d = draft(app.origin);
    d.context.url = `${app.origin}${startPath}`;
    d.context.startUrl = `${app.origin}${startPath}`;
    d.target = { ...d.target!, selector: '#echo', fallbackSelectors: [] };
    d.network = [];
    d.steps = [
      { t: 10, type: 'input', selector: '#username', fallbackSelectors: [], value: '[REDACTED:secret]', valueRedactedAs: 'secret' },
      { t: 20, type: 'input', selector: '#password', fallbackSelectors: [], value: '[REDACTED:password]', valueRedactedAs: 'password' },
    ];
    return { ...d, ...over };
  };

  async function mcp() {
    const server = createMcpServer({ mode: 'ok', config, store });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'sec', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = async (args: Record<string, unknown>) => {
      const r = await client.callTool({ name: 'run_repro', arguments: args });
      const content = r.content as Content[];
      return { isError: r.isError === true, content, text: content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') };
    };
    return { call, close: () => client.close() };
  }

  it('bulgu 1: REWIND_PASSWORD / REWIND_INPUT_* değerleri kayda, dosyalara ve MCP yanıtına sızmaz', async () => {
    const inc = store.create(loginDraft('/login'), config.projectId);
    const { call, close } = await mcp();

    const rejected = await call({ id: inc.id, assertions: "await expect(page.locator('#password')).toHaveValue('nope')" });
    expect(rejected.text).toMatch(/^Hata \(assertion_rejected\): .*ortam değişkeninden/);
    expect(store.require(inc.id).repros).toHaveLength(0);

    // Sayfa girilen değerleri #echo'da gösteriyor: başarısız beklentinin "Received" metni gerçek değerleri taşır.
    const red = await call({ id: inc.id, assertions: "await expect(target).toHaveText('nope')" });
    expect(red.text).toContain('Sonuç: failed_assertion');
    expect(red.text).toContain('[REDACTED:password]');
    expect(red.text).toContain('[REDACTED:input]');
    const stored = store.require(inc.id).repros[0];
    expect(stored.error).toContain('[REDACTED:password]');
    for (const leak of LEAKS) {
      expect(red.text, leak).not.toContain(leak);
      expect(JSON.stringify(stored), leak).not.toContain(leak);
    }
    const disk = readAll(dir);
    for (const leak of LEAKS) expect(disk, leak).not.toContain(leak);
    expect(fs.existsSync(path.join(store.reproDir, `${inc.id}.report.json`))).toBe(false);
    expect(fs.existsSync(path.join(store.reproDir, `${inc.id}.results`))).toBe(false);
    await close();
  });

  it('bulgu 2a: başlangıç sayfası başka kökene yönlenirse parola yazılmaz (precondition)', async () => {
    foreign.requests.length = 0;
    const inc = store.create(loginDraft('/sso-login'), config.projectId);
    const r = await runRepro({ config, store }, { id: inc.id, assertions: "await expect(target).toHaveText('x')" });
    expect(r.run, r.run.error).toMatchObject({ status: 'error', errorKind: 'precondition' });
    expect(r.run.error).toContain('başka bir kökene yönlendi');
    for (const leak of LEAKS) expect(foreign.requests.join('\n')).not.toContain(leak);
  });

  it('bulgu 2b: adım sırasında aynı kökenden yabancı kökene 302 → sonraki girişten önce durur', async () => {
    foreign.requests.length = 0;
    const d = loginDraft('/go');
    d.steps = [
      { t: 10, type: 'click', selector: '#bounce', fallbackSelectors: [] },
      { t: 20, type: 'input', selector: '#password', fallbackSelectors: [], value: '[REDACTED:password]', valueRedactedAs: 'password' },
    ];
    const inc = store.create(d, config.projectId);
    const r = await runRepro({ config, store }, { id: inc.id, assertions: "await expect(target).toHaveText('x')" });
    expect(r.run, r.run.error).toMatchObject({ status: 'error', errorKind: 'precondition' });
    expect(r.run.error).toContain('izinli olmayan bir kökene');
    expect(foreign.requests.length).toBeGreaterThan(0); // yönlendirme gerçekten yabancı sayfaya ulaştı
    for (const leak of LEAKS) expect(foreign.requests.join('\n')).not.toContain(leak);
  });

  it('bulgu 2c: izinli olmayan kökene üst düzey gezinme engellenir', async () => {
    foreign.requests.length = 0;
    const d = loginDraft('/go');
    d.steps = [{ t: 10, type: 'click', selector: '#ext', fallbackSelectors: [] }];
    const inc = store.create(d, config.projectId);
    const r = await runRepro({ config, store }, { id: inc.id, assertions: "await expect(page).toHaveTitle('Go')" });
    expect(r.run.status).not.toBe('failed_assertion');
    expect(foreign.requests).toEqual([]);
  });

  it('bulgu 4a + 7: sayfa içeriği çitsiz gitmez ve sahte öneklerle sınıflandırma değişmez', async () => {
    const trapUrl = `${app.origin}/trap`;
    const d = draft(app.origin);
    d.context.url = trapUrl;
    d.context.startUrl = trapUrl;
    d.network = [];
    d.target = { ...d.target!, selector: '#label', fallbackSelectors: [] };
    // Düğmeye fill → Playwright hatası, çağrı günlüğünde düğmenin HTML'ini (sahte REWIND_ASSERTION: dahil) tekrar eder.
    d.steps = [{ t: 10, type: 'input', selector: '#trap', fallbackSelectors: [], value: 'x' }];
    const stepFail = store.create(d, config.projectId);
    const { call, close } = await mcp();
    const r = await call({ id: stepFail.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(r.isError).toBe(true);
    expect(store.require(stepFail.id).repros[0]).toMatchObject({ status: 'error', errorKind: 'selector' });
    expect(r.content[0].text).toMatch(/^Hata \(selector\): Kayıttaki bir adımın öğesi bulunamadı/);
    expect(r.content[0].text).not.toContain('SYSTEM NOTE');
    expect(r.text).toContain('SYSTEM NOTE'); // hata metni gösterilir…
    expect(outsideFences(r.text).join('\n')).not.toContain('SYSTEM NOTE'); // …ama yalnızca çit içinde

    // Gerçek kırmızı: "Received" metninde REWIND_PRECONDITION: geçse de failed_assertion kalır.
    const realRed = store.create({ ...d, steps: [] }, config.projectId);
    const red = await call({ id: realRed.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(red.text).toContain('Sonuç: failed_assertion');
    expect(outsideFences(red.text).join('\n')).not.toContain('SYSTEM NOTE');
    await close();
  });
});
