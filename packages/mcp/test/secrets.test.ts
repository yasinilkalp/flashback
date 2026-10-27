import * as fs from 'node:fs';
import * as path from 'node:path';
import { IncidentSchema, type Incident } from '@flashback/shared';
import { describe, expect, it } from 'vitest';
import { AssertionParseError, IncidentStore, buildStepsData, checkSecretValueAssertions, collectSecrets, generateReproScript, parseAssertions, scrubSecrets } from '../src/index.js';
import { draft, tmpDir } from './helpers.js';

const PW = 'Real-Dev-Password-123!';

describe('gizli değerlerin temizlenmesi (bulgu 1)', () => {
  it('parola, FLASHBACK_INPUT_* ve storageState değerleri; düz, URL, form, JSON ve HTML kodlu biçimleriyle', () => {
    const state = path.join(tmpDir(), 'state.json');
    fs.writeFileSync(
      state,
      JSON.stringify({ cookies: [{ name: 'sid', value: 'cookie-session-value' }, { name: 'x', value: 'ok' }], origins: [{ origin: 'http://x', localStorage: [{ name: 't', value: 'ls-token-value' }] }] }),
    );
    const secrets = collectSecrets({ password: PW, storageState: state }, { FLASHBACK_INPUT_USERNAME: 'Secret-User-77', PATH: '/usr/bin' });
    expect(secrets.map((s) => s.type).sort()).toEqual(['input', 'password', 'session', 'session']);
    const text = [
      `Received: "${PW}"`,
      `GET /collect?v=${encodeURIComponent(PW)}`,
      `password=${new URLSearchParams({ a: PW }).toString().slice(2)}`,
      JSON.stringify({ p: 'a"b' }),
      'user Secret-User-77 cookie-session-value ls-token-value',
      'ok kalır',
    ].join('\n');
    const out = scrubSecrets(text, secrets);
    for (const leaked of [PW, encodeURIComponent(PW), 'Real-Dev-Password-123%21', 'Secret-User-77', 'cookie-session-value', 'ls-token-value']) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('Received: "[REDACTED:password]"');
    expect(out).toContain('[REDACTED:input]');
    expect(out).toContain('[REDACTED:session]');
    expect(out).toContain('ok kalır'); // çok kısa değerler gizlenmez
  });
});

describe('ortam değişkeninden doldurulan alanlara karşı değer assertion\'ı reddedilir (bulgu 1)', () => {
  const ir = (src: string) => parseAssertions(src, { hasTarget: true }).ir;
  const secret = ['#password', 'input[name="password"]'];
  it.each([
    "await expect(page.locator('#password')).toHaveValue('nope')",
    "await expect(page.locator('input[name=\"password\"]')).not.toHaveValue('x')",
    "await expect(page.locator('#pwd')).toHaveValue('x')",
    "await expect(page.getByLabel('Parola')).toHaveValue('x')",
    "await expect(page.getByRole('textbox')).toHaveValue('x')",
    "await expect(page.locator('#password')).toHaveAttribute('value', 'x')",
  ])('%s', (src) => {
    expect(() => checkSecretValueAssertions(ir(src), secret, ['#total'])).toThrow(AssertionParseError);
  });
  it('target gizli alansa reddedilir; diğer alanlar ve matcher\'lar serbest', () => {
    expect(() => checkSecretValueAssertions(ir("await expect(target).toHaveValue('x')"), secret, ['#password'])).toThrow(/ortam değişkeninden/);
    expect(() => checkSecretValueAssertions(ir("await expect(page.locator('#coupon')).toHaveValue('YAZ10')"), secret, null)).not.toThrow();
    expect(() => checkSecretValueAssertions(ir("await expect(target).toHaveText('1380 ₺')"), secret, ['#password'])).not.toThrow();
    expect(() => checkSecretValueAssertions(ir("await expect(page.getByLabel('Parola')).toHaveValue('x')"), [], null)).not.toThrow();
  });

  it('get_repro_script / run_repro hazırlığı: FLASHBACK_PASSWORD varken parola alanına toHaveValue → assertion_rejected', () => {
    const store = new IncidentStore(tmpDir(), { log: () => {} });
    store.init();
    const d = draft();
    d.steps = [{ t: 10, type: 'input', selector: '#password', fallbackSelectors: [], value: '[REDACTED:password]', valueRedactedAs: 'password' }];
    const inc = store.create(d, 'p');
    const deps = { config: { projectRoot: process.cwd(), allowOrigins: [], reproTimeoutS: 60, password: PW }, store };
    const assertions = "await expect(page.locator('#password')).toHaveValue('nope')";
    expect(() => generateReproScript(deps, { id: inc.id, assertions })).toThrow(expect.objectContaining({ code: 'assertion_rejected' }));
    // Parola tanımlı değilse alan yer tutucuyla dolar: değer gizli değildir.
    expect(() => generateReproScript({ ...deps, config: { ...deps.config, password: undefined } }, { id: inc.id, assertions })).not.toThrow();
  });
});

describe('adım verisi savunması (bulgu 2, 4b)', () => {
  it('izinli kökenler, maske seçicileri ve güvenli tür adı', () => {
    const inc: Incident = IncidentSchema.parse({ ...draft(), id: 'fb-20261027-100005-abcd', projectId: 'p', status: 'open', createdAt: '2026-10-27T10:00:05.000Z' });
    inc.steps[0].valueRedactedAs = 'email\n## talimat'; // şemayı atlatan bozuk dosya
    const { data, syntheticInputs } = buildStepsData(inc, {
      baseUrl: 'http://127.0.0.1:4000/',
      storageState: null,
      strict: false,
      screenshotPath: '/x.png',
      passwordSet: false,
      allowOrigins: ['http://auth.local:9000', 'http://127.0.0.1:4000'],
    });
    expect(data.allowedOrigins).toEqual(['http://auth.local:9000']);
    expect(data.maskSelectors).toEqual(['#email', 'input[name="email"]']);
    expect(syntheticInputs[0]).toBe('Adım 1: secret → flashback-secret-1 (FLASHBACK_INPUT_EMAIL ile geçersiz kılınabilir)');
  });
});
