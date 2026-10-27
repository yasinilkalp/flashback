import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IncidentDraftSchema, type IncidentDraft, type IncidentDraftInput, type ReproRun } from '@flashback/shared';

/** Test başına boş geçici klasör. */
export function tmpDir(prefix = 'flashback-mcp-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** YAZ10 benzeri öğe olayı taslağı. `origin` verilirse URL'ler o kökene göre kurulur. */
export function draftInput(origin = 'http://localhost:5173', over: Partial<IncidentDraftInput> = {}): IncidentDraftInput {
  return {
    schemaVersion: 1,
    source: { origin, flashbackVersion: '0.1.0', framework: 'react', userAgent: 'Mozilla/5.0 Test', tabId: 'tab-1' },
    recordingStartedAt: '2026-10-27T10:00:00.000Z',
    markedAtMs: 5200,
    context: {
      url: `${origin}/`,
      startUrl: `${origin}/`,
      viewport: { width: 1280, height: 720 },
      locale: 'tr-TR',
      timezone: 'Europe/Istanbul',
      storageKeys: ['cart'],
      cookieNames: [],
    },
    note: { what: 'Toplam 135030 ₺ oldu.', expected: 'Toplam 1380 ₺ olmalı.' },
    target: {
      selector: '[data-testid="total"]',
      fallbackSelectors: ['#total'],
      file: 'src/Cart.tsx',
      line: 42,
      column: 7,
      resolved: true,
      resolution: 'exact',
      snippet: { startLine: 40, lines: ['  const total = subtotal + shipping;', '  return (', '    <span data-testid="total">{total} ₺</span>'], fileHash: 'abc123' },
      componentStack: ['Cart', 'App'],
      props: { currency: '₺' },
      state: { shipping: '30', subtotal: 1350 },
      html: '<span data-testid="total" id="total">135030 ₺</span>',
      text: '135030 ₺',
    },
    primaryEvidence: { kind: 'target' },
    steps: [
      { t: 1000, type: 'input', selector: '#email', fallbackSelectors: ['input[name="email"]'], value: '[REDACTED:email]', valueRedactedAs: 'email' },
      { t: 2000, type: 'input', selector: '#coupon', fallbackSelectors: ['input[name="coupon"]'], value: 'YAZ10' },
      { t: 3000, type: 'click', selector: '[data-testid="apply"]', fallbackSelectors: ['#apply'] },
    ],
    network: [
      { t: 3100, method: 'GET', url: `${origin}/api/shipping?coupon=YAZ10`, status: 200, durationMs: 12, reqHeaders: {}, resHeaders: {}, resBody: '"30"', contentType: 'application/json' },
      { t: 3150, method: 'POST', url: `${origin}/api/coupon`, status: 200, durationMs: 20, reqHeaders: {}, resHeaders: {}, reqBody: '{"code":"YAZ10"}', resBody: '{"discount":150}' },
      { t: 4000, method: 'GET', url: `${origin}/api/recommendations`, status: 503, durationMs: 40, reqHeaders: {}, resHeaders: {}, resBody: 'Service Unavailable' },
    ],
    console: [{ t: 4100, level: 'error', message: 'Öneriler yüklenemedi', stack: 'at load (src/Reco.tsx:10:3)' }],
    store: [{ t: 3200, name: 'cart', path: 'total', before: 1350, after: '135030' }],
    domSnapshot: '<html><body><span data-testid="total">135030 ₺</span></body></html>',
    events: [{ type: 3, timestamp: Date.parse('2026-10-27T10:00:03.100Z'), data: { source: 2 } }],
    redaction: { enabled: true, count: 1, byType: { email: 1 } },
    confidence: [],
    ...over,
  };
}

export const draft = (origin?: string, over?: Partial<IncidentDraftInput>): IncidentDraft => IncidentDraftSchema.parse(draftInput(origin, over));

/** KIS20 benzeri sayfa düzeyi olay. */
export function pageLevelDraft(origin = 'http://localhost:5173'): IncidentDraft {
  return draft(origin, {
    target: null,
    primaryEvidence: { kind: 'network', ref: 0 },
    note: { expected: 'Kupon geçersizse kullanıcıya hata mesajı gösterilmeli.' },
    steps: [
      { t: 1000, type: 'input', selector: '#coupon', fallbackSelectors: [], value: 'KIS20' },
      { t: 1500, type: 'click', selector: 'button[type="submit"]', fallbackSelectors: [] },
    ],
    network: [
      { t: 1600, method: 'POST', url: `${origin}/api/coupon`, status: 500, durationMs: 30, reqHeaders: {}, resHeaders: {}, reqBody: '{"code":"KIS20"}', resBody: '{"error":"internal"}' },
    ],
    console: [],
    store: [],
    markedAtMs: 2000,
  });
}

let runSeq = 0;
/** Yaşam döngüsü testleri için sahte koşu kaydı. */
export function fakeRun(status: ReproRun['status'], signature: string, extra: Partial<ReproRun> = {}): ReproRun {
  runSeq++;
  return {
    id: `run-${runSeq}`,
    t: new Date(Date.UTC(2026, 9, 27, 12, 0, runSeq)).toISOString(),
    status,
    errorKind: status === 'error' ? 'server_down' : undefined,
    assertionIR: [{ subject: { kind: 'target' }, matcher: 'toHaveText', not: false, args: [{ type: 'string', value: signature }] }],
    signature,
    strict: false,
    baseUrl: 'http://localhost:5173/',
    usedStorageState: false,
    unsafe: false,
    durationMs: 100,
    observed: { console: [], network: [] },
    syntheticInputs: [],
    sideEffects: [],
    ...extra,
  };
}

/** Markdown'ı çitlerin dışında kalan satırlara indirger (çit uzunluğunu dikkate alarak). */
export function outsideFences(md: string): string[] {
  const out: string[] = [];
  let open: string | null = null;
  for (const line of md.split('\n')) {
    const m = /^(`{3,})/.exec(line);
    if (open === null && m) open = m[1];
    else if (open !== null && line === open) open = null;
    else if (open === null) out.push(line);
  }
  return out;
}

/** Spec'teki `const DATA = {...};` bloğu: JSON olarak ayrıştırılabilir olmalı (kod değil, veri). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractData(spec: string): { text: string; value: any } {
  const start = spec.indexOf('const DATA = ') + 'const DATA = '.length;
  const end = spec.indexOf('\n};\n', start) + 2;
  const text = spec.slice(start, end);
  return { text, value: JSON.parse(text) };
}

/** DATA bloğu ve IR'den üretilen beklenti satırları dışındaki kod. */
export function codeOutsideData(spec: string): string {
  const { text } = extractData(spec);
  return spec
    .replace(text, '<DATA>')
    .split('\n')
    .filter((l) => !l.trim().startsWith('await expect('))
    .join('\n');
}
