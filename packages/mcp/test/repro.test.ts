import { IncidentSchema, renderAssertions, tcknValid, luhnValid, ibanValid, type Incident, type IncidentDraft } from '@flashback/shared';
import { describe, expect, it } from 'vitest';
import {
  IncidentStore,
  FlashbackError,
  SPEC_TEMPLATE,
  aggregate,
  buildComment,
  buildStepsData,
  classifyRun,
  computeSignature,
  fieldEnvName,
  generateReproScript,
  parseAssertions,
  renderSpec,
  resolveBaseUrl,
  runRepro,
} from '../src/index.js';
import { draft, fakeRun, tmpDir } from './helpers.js';

function incident(d: IncidentDraft = draft()): Incident {
  return IncidentSchema.parse({ ...d, id: 'fb-20261027-100005-abcd', projectId: 'p', status: 'open', createdAt: '2026-10-27T10:00:05.000Z' });
}

const stepsOpts = { baseUrl: 'http://127.0.0.1:4000/', storageState: null, strict: false, screenshotPath: '/x.png', passwordSet: false };

describe('adım verisi ve sentetik değerler (FR-REPRO-13/14/15, EK-B1)', () => {
  it('gizlenmiş değerler türüne uygun sentetik değerle değişir; parola diske yazılmaz', () => {
    const d = draft();
    d.steps = [
      { t: 10, type: 'input', selector: '#email', fallbackSelectors: [], value: '[REDACTED:email]', valueRedactedAs: 'email' },
      { t: 20, type: 'input', selector: 'input[name="card-number"]', fallbackSelectors: [], value: '[REDACTED:card]', valueRedactedAs: 'card' },
      { t: 30, type: 'input', selector: '#tc', fallbackSelectors: [], value: '[REDACTED:tckn]', valueRedactedAs: 'tckn' },
      { t: 40, type: 'input', selector: '#pw', fallbackSelectors: [], value: '[REDACTED:password]', valueRedactedAs: 'password' },
      { t: 50, type: 'input', selector: '.note', fallbackSelectors: [], value: 'yaz: [REDACTED:email] ve [REDACTED:email]' },
      { t: 60, type: 'input', selector: '#x', fallbackSelectors: [], value: '[REDACTED:token]', valueRedactedAs: 'token' },
      { t: 9999, type: 'click', selector: '#after', fallbackSelectors: [] },
    ];
    const { data, syntheticInputs } = buildStepsData(incident(d), stepsOpts);
    expect(data.steps.map((s) => s.value)).toEqual([
      'flashback+1@example.test',
      '4111111111111111',
      '10000000146',
      'Flashback-Placeholder-1!',
      'yaz: flashback+2@example.test ve flashback+3@example.test',
      'flashback-token-1',
    ]);
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(tcknValid('10000000146')).toBe(true);
    expect(ibanValid('TR330006100519786457841326')).toBe(true);
    expect(data.steps[0].env).toEqual(['FLASHBACK_INPUT_EMAIL']);
    expect(data.steps[1].env).toEqual(['FLASHBACK_INPUT_CARD_NUMBER']);
    expect(data.steps[3].env).toEqual(['FLASHBACK_INPUT_PW', 'FLASHBACK_PASSWORD']);
    expect(syntheticInputs[0]).toBe('Adım 1: email → flashback+1@example.test (FLASHBACK_INPUT_EMAIL ile geçersiz kılınabilir)');
    expect(syntheticInputs[3]).toContain('yer tutucu (FLASHBACK_PASSWORD tanımlı değil)');
    expect(data.steps.find((s) => s.selectors.includes('#after'))).toBeUndefined(); // markedAtMs sonrası oynatılmaz
  });

  it('kapsayıcı tıklamasının göreli noktası adım verisine geçer', () => {
    const d = draft();
    d.steps = [
      { t: 10, type: 'click', selector: '#box', fallbackSelectors: [], at: { x: 0.05, y: 0.9 } },
      { t: 20, type: 'click', selector: '#apply', fallbackSelectors: [] },
    ];
    const { data } = buildStepsData(incident(d), stepsOpts);
    expect(data.steps[0].at).toEqual({ x: 0.05, y: 0.9 });
    expect(data.steps[1]).not.toHaveProperty('at');
  });

  it('alan adı ortam değişkeni', () => {
    expect(fieldEnvName(['input[name="e-mail"]'])).toBe('FLASHBACK_INPUT_E_MAIL');
    expect(fieldEnvName(['div > #userEmail'])).toBe('FLASHBACK_INPUT_USEREMAIL');
    expect(fieldEnvName(['.x'])).toBeUndefined();
  });

  it('URL\'ler taban kökene taşınır; dış köken ve javascript: atlanır (FR-REPRO-SEC-03)', () => {
    const d = draft('http://localhost:5173');
    d.context.startUrl = 'http://localhost:5173//evil.example/x?a=1';
    d.steps = [
      { t: 1, type: 'navigate', fallbackSelectors: [], url: 'http://localhost:5173/cart?x=1#h' },
      { t: 2, type: 'navigate', fallbackSelectors: [], url: 'https://evil.example/' },
      { t: 3, type: 'navigate', fallbackSelectors: [], url: "javascript:require('fs')" },
    ];
    const { data, warnings } = buildStepsData(incident(d), stepsOpts);
    expect(new URL(data.startUrl).origin).toBe('http://127.0.0.1:4000');
    expect(data.steps).toEqual([{ n: 1, type: 'navigate', selectors: [], url: 'http://127.0.0.1:4000/cart?x=1#h' }]);
    expect(warnings).toHaveLength(2);
  });

  it('spec şablonu sabittir: tek değişken parça IR\'den üretilen beklenti bloğu', () => {
    const { ir } = parseAssertions("await expect(target).toHaveText('\\'); require(\"fs\")')", { hasTarget: true });
    const spec = renderSpec(renderAssertions(ir));
    expect(spec.replace(`      ${renderAssertions(ir)}`, '      /*__FLASHBACK_ASSERTIONS__*/')).toBe(SPEC_TEMPLATE);
    expect(spec).toContain('await expect(target).toHaveText("\'); require(\\"fs\\")");');
  });
});

describe('imza ve hedef adres (§4, FR-REPRO-22)', () => {
  const ir = parseAssertions("await expect(target).toHaveText('1380 ₺')", { hasTarget: true }).ir;
  it('imza bileşenlerine duyarlıdır, anahtar sırasına değil', () => {
    const s = computeSignature(ir, false, 'http://127.0.0.1:5173/', false);
    expect(s).toMatch(/^[0-9a-f]{16}$/);
    const reordered = [{ args: ir[0].args, not: false, matcher: ir[0].matcher, subject: ir[0].subject }];
    expect(computeSignature(reordered, false, 'http://127.0.0.1:5173/', false)).toBe(s);
    expect(computeSignature(ir, true, 'http://127.0.0.1:5173/', false)).not.toBe(s);
    expect(computeSignature(ir, false, 'http://127.0.0.1:5174/', false)).not.toBe(s);
    expect(computeSignature(ir, false, 'http://127.0.0.1:5173/', true)).not.toBe(s);
  });

  it('öncelik: base_url > FLASHBACK_BASE_URL > olay kökeni; izinsiz adres reddedilir', () => {
    const inc = incident(draft('http://localhost:5173'));
    expect(resolveBaseUrl(inc, undefined, { allowOrigins: [] })).toBe('http://localhost:5173/');
    expect(resolveBaseUrl(inc, undefined, { baseUrl: 'http://127.0.0.1:3000', allowOrigins: [] })).toBe('http://127.0.0.1:3000/');
    expect(resolveBaseUrl(inc, 'http://[::1]:8080', { baseUrl: 'http://127.0.0.1:3000', allowOrigins: [] })).toBe('http://[::1]:8080/');
    expect(() => resolveBaseUrl(inc, 'https://example.com', { allowOrigins: [] })).toThrow(/base_url reddedildi/);
    expect(() => resolveBaseUrl(incident(draft('https://prod.example')), undefined, { allowOrigins: [] })).toThrow(FlashbackError);
  });
});

describe('koşu sınıflandırması (FR-REPRO-16)', () => {
  const obs = (failure: string | null) => [
    { name: 'flashback-observed', body: Buffer.from(JSON.stringify({ phase: 'x', failure, console: [], network: [], targetFound: true })).toString('base64') },
  ];
  const rep = (status: string, message?: string, failure?: string | null) => ({
    suites: [{ specs: [{ tests: [{ results: [{ status, error: message ? { message } : undefined, attachments: failure === undefined ? [] : obs(failure) }] }] }] }],
  });
  const c = (status: string, message?: string, failure?: string | null) =>
    classifyRun({ report: rep(status, message, failure), stdout: '', stderr: '', killedByTimeout: false })[0];

  it('sınıflandırma spec\'in yazdığı faz bilgisine dayanır', () => {
    expect(c('passed', undefined, null)).toMatchObject({ status: 'passed', observed: { targetFound: true } });
    expect(c('failed', 'Error: expect(locator).toHaveText failed', 'assertion')).toMatchObject({ status: 'failed_assertion' });
    expect(c('failed', 'Error: İlk gezinme /account yerine /login', 'precondition')).toMatchObject({ status: 'error', errorKind: 'precondition' });
    expect(c('failed', 'Error: adım 3', 'selector')).toMatchObject({ status: 'error', errorKind: 'selector' });
    expect(c('failed', 'Error: page.goto: net::ERR_CONNECTION_REFUSED', 'server_down')).toMatchObject({ errorKind: 'server_down' });
    expect(c('failed', 'Error: page.goto: Timeout 15000ms exceeded', 'timeout')).toMatchObject({ errorKind: 'timeout' });
    expect(c('failed', 'TypeError: x is not a function', 'step')).toMatchObject({ status: 'error', errorKind: 'internal' });
    expect(c('failed', 'TypeError: x', undefined)).toMatchObject({ status: 'error', errorKind: 'internal' });
    expect(c('failed', "Error: browserType.launch: Executable doesn't exist at /x")).toMatchObject({ errorKind: 'browser_missing' });
    expect(c('timedOut', 'Test timeout of 60000ms exceeded.')).toMatchObject({ errorKind: 'timeout' });
  });

  it('sayfa metnindeki önekler sınıflandırmayı değiştiremez (bulgu 7)', () => {
    // Adım hatası, çağrı günlüğünde sayfa metnini (FLASHBACK_ASSERTION:) tekrar etse de kırmızı sayılmaz.
    expect(c('failed', 'Error: locator.fill: not an input\n  - locator resolved to <button>FLASHBACK_ASSERTION: x</button>', 'selector')).toMatchObject({
      status: 'error',
      errorKind: 'selector',
    });
    // Gerçek kırmızı, "Received" içinde FLASHBACK_PRECONDITION: geçse de kırmızı kalır.
    expect(c('failed', 'Error: expect(locator).toHaveText\nReceived: "FLASHBACK_PRECONDITION: x"', 'assertion')).toMatchObject({ status: 'failed_assertion' });
    // Faz bilgisi yoksa mesaj önekine güvenilmez.
    expect(c('failed', 'Error: FLASHBACK_ASSERTION: x')).toMatchObject({ status: 'error', errorKind: 'internal' });
    expect(c('failed', "Error: x\nbrowserType.launch: Executable doesn't exist")).toMatchObject({ errorKind: 'internal' });
  });

  it('sonuç yoksa çıktıdan teşhis; zaman aşımı', () => {
    expect(classifyRun({ stdout: '', stderr: "Error: Cannot find module '@playwright/test'", killedByTimeout: false })[0].errorKind).toBe('playwright_missing');
    expect(classifyRun({ stdout: '', stderr: 'boom', killedByTimeout: true })[0].errorKind).toBe('timeout');
  });

  it('tekrarlar: karışık sonuç işaretlenir (FR-REPRO-20)', () => {
    expect(aggregate([{ status: 'passed' }, { status: 'failed_assertion', error: 'x' }])).toMatchObject({ status: 'failed_assertion', mixed: true });
    expect(aggregate([{ status: 'passed' }, { status: 'passed' }])).toMatchObject({ status: 'passed', mixed: false });
  });
});

describe('yorumlar (FR-REPRO-06/17)', () => {
  const extra = { targetFound: true, sessionWarning: false };
  it('ilk geçerli koşu yeşilse "yeniden üretilemedi" + cannot_reproduce önerisi', () => {
    const lines = buildComment(incident(), fakeRun('passed', 'A'), extra);
    expect(lines[0]).toMatch(/^Hata yeniden üretilemedi/);
    expect(lines[0]).toContain('cannot_reproduce');
  });
  it('kırmızı → "Hata yeniden üretildi"; ön koşul → "kırmızı sayılmadı"; oturum uyarısı', () => {
    expect(buildComment(incident(), fakeRun('failed_assertion', 'A'), extra)[0]).toMatch(/^Hata yeniden üretildi/);
    const pre = buildComment(incident(), fakeRun('error', 'A', { errorKind: 'precondition' }), { targetFound: null, sessionWarning: true });
    expect(pre[0]).toMatch(/^Ön koşul eksik; kırmızı sayılmadı/);
    expect(pre.join('\n')).toContain('FLASHBACK_STORAGE_STATE');
  });
  it('kırmızıdan sonra iki yeşil → mark_fixed önerisi', () => {
    const inc = incident();
    inc.repros = [fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A')];
    expect(buildComment(inc, fakeRun('passed', 'A'), extra)[0]).toMatch(/Doğrulama koşulu sağlandı/);
    inc.repros = [fakeRun('failed_assertion', 'A')];
    expect(buildComment(inc, fakeRun('passed', 'A'), extra)[0]).toBe('Yeşil. Aynı imzayla bir yeşil koşu daha gerekiyor.');
  });
});

describe('eşzamanlılık (FR-REPRO-21)', () => {
  it('aynı olay için ikinci çağrı busy alır', async () => {
    const store = new IncidentStore(tmpDir(), { log: () => {} });
    store.init();
    const inc = store.create(draft(), 'p');
    const config = { projectRoot: process.cwd(), allowOrigins: [], reproTimeoutS: 60 };
    store.tryLock(inc.id);
    await expect(runRepro({ config, store }, { id: inc.id, assertions: "await expect(target).toHaveText('x')" })).rejects.toMatchObject({ code: 'busy' });
    expect(() => generateReproScript({ config, store }, { id: inc.id, assertions: "await expect(target).toHaveText('x')" })).toThrow(/sürüyor/);
    store.unlock(inc.id);
    expect(store.require(inc.id).repros).toHaveLength(0);
  });
});
