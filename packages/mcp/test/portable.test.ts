import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IncidentStore,
  PORTABLE_SPEC_TEMPLATE,
  buildPortableData,
  buildStepsData,
  dataLiteral,
  generateReproScript,
  loadConfig,
  renderPortableSpec,
  type RewindConfig,
} from '../src/index.js';
import { codeOutsideData, draft, extractData, pageLevelDraft, tmpDir } from './helpers.js';

const ASSERT = "await expect(target).toHaveText('1380 ₺')";

function setup(over: Partial<RewindConfig> = {}) {
  const dir = tmpDir();
  const config = { ...loadConfig({ REWIND_DIR: dir }, { cwd: process.cwd(), homedir: '/nonexistent' }), ...over };
  const store = new IncidentStore(dir, { log: () => {} });
  store.init();
  return { dir, config, store };
}

describe('FR-MCP-14: get_repro_script portable', () => {
  it('kendi kendine yeterli spec: .rewind/ ve fs bağımlılığı yok, göreli yollar, satır içi yardımcılar', () => {
    const { config, store } = setup();
    const d = draft();
    d.context.startUrl = 'http://localhost:5173/cart?x=1#top';
    d.steps.push({ t: 4000, type: 'navigate', fallbackSelectors: [], url: 'http://localhost:5173/checkout?step=2' });
    d.steps.push({ t: 4100, type: 'navigate', fallbackSelectors: [], url: 'https://evil.example/phish' });
    d.markedAtMs = 5000;
    const inc = store.create(d, 'p');
    const r = generateReproScript({ config, store }, { id: inc.id, assertions: ASSERT, portable: true });

    expect(r.portable).toBe(true);
    expect(r.stepsPath).toBeNull();
    expect(r.configPath).toBeNull();
    expect(r.specPath).toBe(path.join(store.dir, 'portable', `${inc.id}.spec.ts`));
    expect(fs.readFileSync(r.specPath, 'utf8')).toBe(r.spec);
    // run_repro dosyaları üretilmez/değişmez.
    expect(fs.existsSync(path.join(store.reproDir, `${inc.id}.steps.json`))).toBe(false);
    expect(fs.existsSync(path.join(store.reproDir, `${inc.id}.spec.ts`))).toBe(false);

    const spec = r.spec;
    expect(spec.startsWith('// @ts-nocheck\n')).toBe(true);
    expect(spec).toContain("import { test, expect } from '@playwright/test';");
    for (const banned of ['.rewind', 'node:fs', 'readFileSync', 'steps.json', 'require(', 'eval(', 'new Function', 'REWIND_REPORT_FILE', 'screenshotPath']) {
      expect(spec, banned).not.toContain(banned);
    }
    // Göreli yollar: kayıttaki köken hiçbir yerde yok; gezinme DATA'daki yolla ve baseURL'e göre.
    expect(spec).not.toContain('localhost:5173');
    expect(spec).not.toMatch(/https?:\/\//);
    expect(spec).toContain('await page.goto(DATA.startPath);');
    expect(spec).toContain('await page.goto(s.path);');
    expect(spec).toContain('baseURL');
    // Satır içi yardımcılar
    for (const helper of ['const find = async', 'const valueOf = ', 'const settle = ', 'const ensureOrigin = ', "context.route('**/*'"]) expect(spec).toContain(helper);

    const { value } = extractData(spec);
    expect(value).toMatchObject({ format: 'rewind-portable', incidentId: inc.id, startPath: '/cart?x=1#top', locale: 'tr-TR', timezone: 'Europe/Istanbul' });
    expect(value.steps.filter((s: { type: string }) => s.type === 'navigate')).toEqual([{ n: 4, type: 'navigate', selectors: [], path: '/checkout?step=2' }]);
    expect(value.steps[0]).toMatchObject({ type: 'input', value: 'rewind+1@example.test', env: ['REWIND_INPUT_EMAIL'] });
    expect(r.warnings.join('\n')).toContain('Adım 5: dış kökene ya da geçersiz URL\'ye gezinme atlandı.');
    // Beklenti yalnızca IR'den (renderAssertions çıktısı)
    expect(spec).toContain('  await expect(target).toHaveText("1380 ₺");');
  });

  it('varsayılan (portable verilmeyen) çıktı değişmez', () => {
    const { config, store } = setup();
    const inc = store.create(draft(), 'p');
    const local = generateReproScript({ config, store }, { id: inc.id, assertions: ASSERT });
    expect(local.portable).toBe(false);
    expect(local.spec).toContain("fs.readFileSync(test.info().file.replace(/\\.spec\\.ts$/, '.steps.json'), 'utf8')");
    expect(local.spec).not.toContain('const DATA = ');
    expect(fs.existsSync(local.stepsPath)).toBe(true);
    const explicit = generateReproScript({ config, store }, { id: inc.id, assertions: ASSERT, portable: false });
    expect(explicit.spec).toBe(local.spec);
  });

  it('REWIND_PASSWORD değeri gömülmez: parola alanı yer tutucu + ortam değişkeni; olay verisindeki gerçek değer temizlenir', () => {
    const PW = 'Gercek-Parola-123!';
    const { config, store } = setup({ password: PW });
    const d = draft();
    d.steps.push(
      { t: 4000, type: 'input', selector: '#password', fallbackSelectors: [], value: '[REDACTED:password]', valueRedactedAs: 'password' },
      // Gizleme kapalıyken parola sıradan bir alana yazılmış olabilir.
      { t: 4100, type: 'input', selector: '#note', fallbackSelectors: [], value: `not: ${PW}` },
    );
    d.markedAtMs = 5000;
    const inc = store.create(d, 'p');
    const r = generateReproScript({ config, store }, { id: inc.id, assertions: ASSERT, portable: true });
    expect(r.spec).not.toContain(PW);
    expect(fs.readFileSync(r.specPath, 'utf8')).not.toContain(PW);
    const steps = extractData(r.spec).value.steps;
    expect(steps.find((s: { selectors: string[] }) => s.selectors[0] === '#password')).toMatchObject({
      value: 'Rewind-Placeholder-1!',
      env: ['REWIND_INPUT_PASSWORD', 'REWIND_PASSWORD'],
    });
    expect(steps.find((s: { selectors: string[] }) => s.selectors[0] === '#note').value).toBe('not: [REDACTED:password]');
    // Ortam değişkeni çalışma anında okunur, yalnızca izinli adlar.
    expect(r.spec).toContain('process.env[name]');
    expect(r.spec).toContain('const ENV_NAME = /^REWIND_(PASSWORD|INPUT_[A-Z0-9_]{1,64})$/;');
  });

  it('portable kilit gerektirmez (run_repro dosyalarına dokunmaz); sayfa düzeyi olayda target yok', () => {
    const { config, store } = setup();
    const inc = store.create(pageLevelDraft(), 'p');
    expect(store.tryLock(inc.id)).toBe(true);
    try {
      expect(() => generateReproScript({ config, store }, { id: inc.id, assertions: "await expect(page.getByRole('alert')).toBeVisible()" })).toThrow(/koşu sürüyor/);
      const r = generateReproScript({ config, store }, { id: inc.id, assertions: "await expect(page.getByRole('alert')).toBeVisible()", portable: true });
      expect(extractData(r.spec).value.target).toBeNull();
      expect(r.spec).toContain('await expect(page.getByRole("alert")).toBeVisible();');
    } finally {
      store.unlock(inc.id);
    }
  });

  it('oturum işareti olan olayda uyarı; storageState yolu spec\'e girmez', () => {
    const state = path.join(tmpDir('rewind-state-'), 'state.json');
    fs.writeFileSync(state, JSON.stringify({ cookies: [{ name: 'sid', value: 'cookie-secret-value' }], origins: [] }));
    const { config, store } = setup({ storageState: state });
    const d = draft();
    d.context.cookieNames = ['sid'];
    const inc = store.create(d, 'p');
    const r = generateReproScript({ config, store }, { id: inc.id, assertions: ASSERT, portable: true });
    expect(r.warnings.join('\n')).toContain('oturum işareti var');
    expect(r.spec).not.toContain(state);
    expect(r.spec).not.toContain('cookie-secret-value');
    expect(r.spec).toContain('process.env.REWIND_STORAGE_STATE');
  });

  it('EK-B1: kod kaçışı yükleri yalnızca JSON.stringify ile DATA içine girer; kodun geri kalanında yoktur', () => {
    const { config, store } = setup();
    const payloads = [
      `'); require('fs').writeFileSync('/tmp/pwned', 'x'); ('`,
      `\${require('fs').writeFileSync('/tmp/pwned', 'x')}`,
      `"}; require("fs").writeFileSync("/tmp/pwned", "x"); const z = {"`,
      `\`; require('fs').writeFileSync('/tmp/pwned', 'x'); \``,
      `*/ require('fs').writeFileSync('/tmp/pwned', 'x'); /*`,
      `\n};\nrequire('fs').writeFileSync('/tmp/pwned', 'x');\nconst Y = {`,
      `/*__REWIND_ASSERTIONS__*/ /*__REWIND_DATA__*/`,
      `\u2028require('fs')\u2029`,
    ];
    const d = draft(undefined, {
      steps: [
        { t: 10, type: 'navigate', fallbackSelectors: [], url: `http://localhost:5173/?q='+require('fs').writeFileSync('/tmp/pwned','x')+'` },
        { t: 20, type: 'input', selector: payloads[0], fallbackSelectors: payloads.slice(1), value: payloads.join('|') },
        { t: 30, type: 'key', selector: '#coupon', fallbackSelectors: [], key: payloads[2] },
        { t: 40, type: 'click', selector: payloads[5], fallbackSelectors: [payloads[6], '#apply'] },
      ],
      note: { expected: payloads.join('\n') },
    });
    d.target!.selector = payloads[3];
    d.target!.fallbackSelectors = payloads;
    const inc = store.create(d, 'p');
    const r = generateReproScript({ config, store }, { id: inc.id, assertions: `await expect(target).toHaveText(${JSON.stringify(payloads[0])});`, portable: true });
    const outside = codeOutsideData(r.spec);
    expect(outside).not.toContain('pwned');
    expect(outside).not.toContain('writeFileSync');
    // Yer tutucu enjeksiyonu: şablon tek geçişte doldurulur.
    expect(r.spec.match(/^const DATA = /gm)).toHaveLength(1);
    expect(r.spec).not.toMatch(/^\s*\/\*__REWIND_(DATA|ASSERTIONS)__\*\/\s*$/m);
    // Beklenti satırı JSON.stringify'lı sabit.
    expect(r.spec).toContain(`await expect(target).toHaveText(${JSON.stringify(payloads[0])});`);
    // DATA, JSON olarak birebir aynı veriyi verir.
    const { value, text } = extractData(r.spec);
    expect(value.steps[1].selectors).toEqual(payloads);
    expect(value.steps[1].value).toBe(payloads.join('|'));
    expect(value.steps[2].key).toBe(payloads[2]);
    // URL ayrıştırması tırnakları yüzde-kodlar; değer yine yalnızca veri olarak page.goto'ya gider.
    expect(decodeURIComponent(value.steps[0].path)).toBe(`/?q='+require('fs').writeFileSync('/tmp/pwned','x')+'`);
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(value.target.selectors[0]).toBe(payloads[3]);
    // note (geliştirici metni) spec'e hiç girmez.
    expect(r.spec).not.toContain(payloads[5]);
  });

  it('dataLiteral: __proto__ anahtarı düşer, U+2028/2029 kaçışlanır; renderPortableSpec yer tutucuları tek geçişte doldurur', () => {
    const evil = JSON.parse('{"a":1,"__proto__":{"polluted":true},"s":"x\u2028y"}');
    const lit = dataLiteral(evil);
    expect(lit).not.toContain('__proto__');
    expect(lit).toContain('x\\u2028y');
    expect(JSON.parse(lit)).toEqual({ a: 1, s: 'x\u2028y' });
    const spec = renderPortableSpec({ s: '/*__REWIND_ASSERTIONS__*/' }, 'await expect(page).toHaveTitle("t");');
    expect(spec.match(/await expect\(page\)\.toHaveTitle/g)).toHaveLength(1);
    expect(spec).toContain('"s": "/*__REWIND_ASSERTIONS__*/"');
    expect(PORTABLE_SPEC_TEMPLATE.match(/\/\*__REWIND_DATA__\*\//g)).toHaveLength(1);
    expect(PORTABLE_SPEC_TEMPLATE.match(/\/\*__REWIND_ASSERTIONS__\*\//g)).toHaveLength(1);
  });

  it('buildPortableData: StepsData\'dan köken, ekran görüntüsü ve storageState yolu çıkarılır', () => {
    const inc = { ...store0(), id: 'rw-20261027-100000-abcd' };
    const { data } = buildStepsData(inc, {
      baseUrl: 'http://127.0.0.1:4000/',
      storageState: '/home/u/.rewind/state.json',
      strict: true,
      screenshotPath: '/home/u/.rewind/repro/x.png',
      passwordSet: false,
      allowOrigins: ['http://127.0.0.1:5000'],
    });
    const p = buildPortableData(data);
    expect(Object.keys(p).sort()).toEqual(
      ['firstActionIndex', 'format', 'incidentId', 'locale', 'startPath', 'steps', 'stepsSchemaVersion', 'strict', 'target', 'timezone', 'viewport'].sort(),
    );
    expect(JSON.stringify(p)).not.toMatch(/127\.0\.0\.1|\.rewind|state\.json|x\.png/);
    expect(p.strict).toBe(true);
  });
});

function store0() {
  const { store } = setup();
  return store.create(draft(), 'p');
}
