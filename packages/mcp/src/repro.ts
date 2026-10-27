import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import {
  renderAssertions,
  type AssertionIR,
  type Incident,
  type ReproRun,
  type Step,
} from '@rewind/shared';
import { parseAssertions } from './assertion-parser.js';
import { checkTargetUrl, type RewindConfig } from './config.js';
import { RewindError, ERROR_SUGGESTIONS } from './errors.js';
import { countedRuns, evaluateVerification } from './lifecycle.js';
import { sessionHints } from './report.js';
import { CONFIG_TEMPLATE, renderSpec } from './repro-template.js';
import { checkSecretValueAssertions, collectSecrets, envProvides, scrubSecrets, type Secret } from './secrets.js';
import type { IncidentStore } from './store.js';

export const STEPS_SCHEMA_VERSION = 1;
const CONFIG_FILE = 'playwright.rewind.config.mjs';
const SIDE_EFFECT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type ReproConfig = Pick<
  RewindConfig,
  'projectRoot' | 'allowOrigins' | 'baseUrl' | 'storageState' | 'reproTimeoutS' | 'password'
>;

type ErrorKind = NonNullable<ReproRun['errorKind']>;

// ---- Playwright çözümleme (FR-REPRO-01, FR-REPRO-18) -------------------------

export interface PlaywrightInfo {
  cliPath: string;
  version: string;
  /** Chromium yürütülebilir dosyası (bulunabildiyse). */
  chromiumPath?: string;
}

/** Projenin kendi `@playwright/test` paketini `REWIND_PROJECT_ROOT`'tan çözer. */
export function resolvePlaywright(projectRoot: string): PlaywrightInfo | undefined {
  try {
    const req = createRequire(path.join(projectRoot, 'package.json'));
    const pkgPath = req.resolve('@playwright/test/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };
    const info: PlaywrightInfo = { cliPath: path.join(path.dirname(pkgPath), 'cli.js'), version: pkg.version };
    try {
      const fromTest = createRequire(pkgPath);
      const fromPw = createRequire(fromTest.resolve('playwright/package.json'));
      const core = fromPw('playwright-core') as { chromium: { executablePath(): string } };
      info.chromiumPath = core.chromium.executablePath();
    } catch {
      /* chromium yolu bilinemedi */
    }
    return info;
  } catch {
    return undefined;
  }
}

// ---- İmza (§4) ---------------------------------------------------------------

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = canonical(val);
    }
    return out;
  }
  return v;
}

/** Koşu imzası: IR, strict, base_url, storageState kullanımı ve adım şeması sürümünün özeti. */
export function computeSignature(ir: AssertionIR, strict: boolean, baseUrl: string, usedStorageState: boolean): string {
  const payload = JSON.stringify(canonical({ ir, strict, baseUrl, usedStorageState, stepsSchemaVersion: STEPS_SCHEMA_VERSION }));
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

// ---- Adım verisi (EK-B1: tüm olay verisi JSON'da) ----------------------------

export interface StepsData {
  stepsSchemaVersion: number;
  incidentId: string;
  baseUrl: string;
  startUrl: string;
  markedAtMs: number;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  storageState: string | null;
  strict: boolean;
  steps: Array<{ n: number; type: Step['type']; selectors: string[]; value?: string; env?: string[]; key?: string; url?: string }>;
  firstActionIndex: number;
  target: { selectors: string[] } | null;
  /** Taban kökene ek olarak gezinmeye izin verilen kökenler (REWIND_ALLOW_ORIGINS). */
  allowedOrigins: string[];
  /** Ekran görüntüsünde maskelenecek, değeri gizli/sentetik girilen alanların seçicileri. */
  maskSelectors: string[];
  screenshotPath: string;
}

const MARKER_ALL = /\[REDACTED(?::([a-z_]+))?\]/g;

/** FR-REPRO-13: türüne uygun, geçerli sentetik değer. Parola için gerçek değer diske yazılmaz. */
function synthetic(type: string, n: number): { value: string; label: string; env?: string[] } {
  switch (type) {
    case 'email':
      return { value: `rewind+${n}@example.test`, label: `rewind+${n}@example.test` };
    case 'card':
      return { value: '4111111111111111', label: 'Luhn uyumlu test kartı 4111111111111111' };
    case 'tckn':
      return { value: '10000000146', label: 'algoritmaya uygun sahte TCKN 10000000146' };
    case 'iban':
      return { value: 'TR330006100519786457841326', label: 'mod-97 uyumlu test IBAN' };
    case 'phone':
      return { value: '+905550000000', label: '+905550000000' };
    case 'password':
      return { value: `Rewind-Placeholder-${n}!`, label: 'parola', env: ['REWIND_PASSWORD'] };
    default:
      return { value: `rewind-${type}-${n}`, label: `rewind-${type}-${n}` };
  }
}

/** Seçiciden alan adı (FR-REPRO-14: REWIND_INPUT_<ALAN_ADI>). */
export function fieldEnvName(selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const m = /\[name=["']?([^"'\]]+)/.exec(sel) ?? /\[id=["']?([^"'\]]+)/.exec(sel) ?? /#([A-Za-z][\w-]*)/.exec(sel);
    if (m) {
      const name = m[1].toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
      if (name) return `REWIND_INPUT_${name}`;
    }
  }
  return undefined;
}

/** Olay URL'sini taban kökene taşır; dış köken ya da http(s) dışı şema → null (FR-REPRO-SEC-03). */
function onBase(raw: string | undefined, base: URL, incidentOrigin: string): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw, incidentOrigin);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin !== incidentOrigin) return null;
  const out = new URL(base.href);
  out.pathname = u.pathname;
  out.search = u.search;
  out.hash = u.hash;
  return out.href;
}

export interface BuildStepsOptions {
  baseUrl: string;
  storageState: string | null;
  strict: boolean;
  screenshotPath: string;
  passwordSet: boolean;
  allowOrigins?: string[];
}

const SAFE_TYPE = /^[a-z_]{1,32}$/;

export function buildStepsData(inc: Incident, opts: BuildStepsOptions): { data: StepsData; syntheticInputs: string[]; warnings: string[] } {
  const base = new URL(opts.baseUrl);
  let incidentOrigin = base.origin;
  try {
    incidentOrigin = new URL(inc.context.url).origin;
  } catch {
    /* olay URL'si okunamadı: taban köken kullanılır */
  }
  const warnings: string[] = [];
  const syntheticInputs: string[] = [];
  const counters: Record<string, number> = {};
  const next = (type: string) => (counters[type] = (counters[type] ?? 0) + 1);

  const startUrl = onBase(inc.context.startUrl, base, incidentOrigin) ?? onBase(inc.context.url, base, incidentOrigin) ?? base.href;
  const steps: StepsData['steps'] = [];
  inc.steps.forEach((s, i) => {
    if (s.t > inc.markedAtMs) return;
    const n = i + 1;
    const selectors = [s.selector, ...s.fallbackSelectors].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (s.type === 'navigate') {
      const url = onBase(s.url, base, incidentOrigin);
      if (!url) warnings.push(`Adım ${n}: dış kökene ya da geçersiz URL'ye gezinme atlandı.`);
      else steps.push({ n, type: 'navigate', selectors: [], url });
      return;
    }
    const out: StepsData['steps'][number] = { n, type: s.type, selectors };
    if (s.type === 'key') out.key = s.key ?? 'Enter';
    if (s.type === 'input') {
      let value = s.value ?? '';
      const fieldEnv = fieldEnvName(selectors);
      if (s.valueRedactedAs || MARKER_ALL.test(value)) {
        MARKER_ALL.lastIndex = 0;
        const env: string[] = fieldEnv ? [fieldEnv] : [];
        if (s.valueRedactedAs) {
          // Şema türü sınırlar; yine de savunma amaçlı yalnızca güvenli biçim kullanılır.
          const type = SAFE_TYPE.test(s.valueRedactedAs) ? s.valueRedactedAs : 'secret';
          const syn = synthetic(type, next(type));
          value = syn.value;
          env.push(...(syn.env ?? []));
          const how =
            type === 'password'
              ? opts.passwordSet
                ? 'REWIND_PASSWORD ortam değişkeni'
                : 'yer tutucu (REWIND_PASSWORD tanımlı değil)'
              : syn.label;
          syntheticInputs.push(`Adım ${n}: ${type} → ${how}${fieldEnv ? ` (${fieldEnv} ile geçersiz kılınabilir)` : ''}`);
        } else {
          value = value.replace(MARKER_ALL, (_m, type: string | undefined) => {
            const t = type ?? 'secret';
            const syn = synthetic(t, next(t));
            syntheticInputs.push(`Adım ${n}: ${t} → ${t === 'password' ? 'yer tutucu' : syn.label}`);
            return syn.value;
          });
        }
        if (env.length) out.env = env;
      }
      out.value = value;
    }
    steps.push(out);
  });

  const data: StepsData = {
    stepsSchemaVersion: STEPS_SCHEMA_VERSION,
    incidentId: inc.id,
    baseUrl: base.href,
    startUrl,
    markedAtMs: inc.markedAtMs,
    viewport: inc.context.viewport,
    locale: inc.context.locale,
    timezone: inc.context.timezone,
    storageState: opts.storageState,
    strict: opts.strict,
    steps,
    firstActionIndex: steps.findIndex((s) => s.selectors.length > 0),
    target: inc.target ? { selectors: [inc.target.selector, ...inc.target.fallbackSelectors].filter(Boolean) } : null,
    allowedOrigins: (opts.allowOrigins ?? []).filter((o) => o !== base.origin),
    maskSelectors: [...new Set(steps.filter((s) => s.env?.length).flatMap((s) => s.selectors))],
    screenshotPath: opts.screenshotPath,
  };
  return { data, syntheticInputs, warnings };
}

// ---- Sınıflandırma (FR-REPRO-16) ---------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const clean = (s: string) => s.replace(ANSI, '');

interface PwAttachment {
  name?: string;
  body?: string;
}
interface PwResult {
  status: string;
  error?: { message?: string };
  errors?: Array<{ message?: string }>;
  attachments?: PwAttachment[];
}
interface PwSuite {
  specs?: Array<{ tests?: Array<{ results?: PwResult[] }> }>;
  suites?: PwSuite[];
}
interface PwReport {
  suites?: PwSuite[];
  errors?: Array<{ message?: string }>;
}

function collectResults(suites: PwSuite[] = []): PwResult[] {
  const out: PwResult[] = [];
  for (const s of suites) {
    for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) out.push(...(t.results ?? []));
    out.push(...collectResults(s.suites));
  }
  return out;
}

/** Spec'in kendi kod yollarıyla yazdığı gözlem (test eki). Sayfa içeriği bu alanları belirleyemez. */
export interface Observed {
  phase?: string;
  failure?: 'precondition' | 'selector' | 'server_down' | 'timeout' | 'step' | 'setup' | 'assertion' | null;
  console: string[];
  network: string[];
  targetFound: boolean | null;
}

export interface Classified {
  status: ReproRun['status'];
  errorKind?: ErrorKind;
  error?: string;
  observed?: Observed;
}

function readObserved(r: PwResult): Observed | undefined {
  const att = r.attachments?.find((a) => a.name === 'rewind-observed' && typeof a.body === 'string');
  if (!att?.body) return undefined;
  try {
    const o = JSON.parse(Buffer.from(att.body, 'base64').toString('utf8')) as Partial<Observed>;
    return {
      phase: typeof o.phase === 'string' ? o.phase : undefined,
      failure: o.failure ?? null,
      console: Array.isArray(o.console) ? o.console.map(String) : [],
      network: Array.isArray(o.network) ? o.network.map(String) : [],
      targetFound: typeof o.targetFound === 'boolean' ? o.targetFound : null,
    };
  } catch {
    return undefined;
  }
}

const FAILURE_KIND: Record<string, ErrorKind> = {
  precondition: 'precondition',
  selector: 'selector',
  server_down: 'server_down',
  timeout: 'timeout',
  step: 'internal',
  setup: 'internal',
};

/** Yalnızca mesajın ilk satırının başına bakılır (sayfa metni sınıflandırmayı etkileyemesin). */
const browserMissing = (msg: string) => /^(Error: )?browserType\.launch: Executable doesn't exist/.test(clean(msg).trimStart());

/**
 * Playwright JSON raporu ve süreç çıktısından koşu sonucu (FR-REPRO-16). Faz bilgisi spec'in eklediği
 * `rewind-observed` ekinden okunur; hata metnindeki önekler dikkate alınmaz. Assertion bloğu dışındaki
 * hata asla kırmızı sayılmaz.
 */
export function classifyRun(input: { report?: PwReport; stdout: string; stderr: string; killedByTimeout: boolean }): Classified[] {
  if (input.killedByTimeout) return [{ status: 'error', errorKind: 'timeout', error: 'Koşu zaman aşımına uğradı ve durduruldu.' }];
  const results = collectResults(input.report?.suites);
  if (!results.length) {
    const msgs = (input.report?.errors ?? []).map((e) => e.message ?? '');
    const text = clean([...msgs, input.stderr, input.stdout].join('\n'));
    if (msgs.some(browserMissing) || /^\s*(Error: )?browserType\.launch: Executable doesn't exist/m.test(input.stderr)) {
      return [{ status: 'error', errorKind: 'browser_missing', error: tail(text) }];
    }
    if (/Cannot find (module|package) '@playwright\/test'/.test(text)) return [{ status: 'error', errorKind: 'playwright_missing', error: tail(text) }];
    return [{ status: 'error', errorKind: 'internal', error: tail(text) || 'Playwright sonuç üretmedi.' }];
  }
  return results.map((r): Classified => {
    const observed = readObserved(r);
    const msg = clean(r.error?.message ?? r.errors?.map((e) => e.message ?? '').join('\n') ?? '');
    const error = msg ? tail(msg) : undefined;
    if (r.status === 'passed') return { status: 'passed', observed };
    if (r.status === 'timedOut') return { status: 'error', errorKind: 'timeout', error: error ?? 'Test zaman aşımı.', observed };
    if (observed?.failure === 'assertion') return { status: 'failed_assertion', error, observed };
    if (observed?.failure) return { status: 'error', errorKind: FAILURE_KIND[observed.failure] ?? 'internal', error, observed };
    if (browserMissing(msg)) return { status: 'error', errorKind: 'browser_missing', error, observed };
    return { status: 'error', errorKind: 'internal', error, observed };
  });
}

const tail = (s: string, max = 2000) => (s.length > max ? `…${s.slice(-max)}` : s).trim();

/** Tekrarlar tek kayda toplanır: hata > kırmızı > yeşil; farklı sonuçlar `mixed` (FR-REPRO-20). */
export function aggregate(results: Classified[]): Classified & { mixed: boolean } {
  const kinds = new Set(results.map((r) => r.status));
  const mixed = kinds.size > 1;
  const pick = results.find((r) => r.status === 'error') ?? results.find((r) => r.status === 'failed_assertion') ?? results[0];
  return { ...pick, mixed };
}

// ---- Çalıştırma --------------------------------------------------------------

export interface RunReproInput {
  id: string;
  assertions: unknown;
  strict?: boolean;
  baseUrl?: string;
  headed?: boolean;
  repeat?: number;
}

export interface RunReproResult {
  run: ReproRun;
  assertionText: string;
  comment: string[];
  previousRuns: string;
  screenshot?: Buffer;
}

export interface ReproDeps {
  config: ReproConfig;
  store: IncidentStore;
  now?: () => Date;
  log?: (msg: string) => void;
}

/** FR-REPRO-22 + FR-REPRO-SEC-03: hedef adres önceliği ve doğrulaması. */
export function resolveBaseUrl(inc: Incident, param: string | undefined, config: Pick<ReproConfig, 'baseUrl' | 'allowOrigins'>): string {
  let raw = param || config.baseUrl;
  const source = param ? 'base_url' : config.baseUrl ? 'REWIND_BASE_URL' : 'olay URL\'si';
  if (!raw) {
    try {
      raw = new URL(inc.context.url).origin;
    } catch {
      throw new RewindError('base_url_rejected', 'Olay URL\'si okunamadı; base_url ver.');
    }
  }
  const check = checkTargetUrl(raw, config.allowOrigins);
  if (!check.ok) throw new RewindError('base_url_rejected', `${source} reddedildi: ${check.reason}.`);
  return check.url.origin + (check.url.pathname === '/' ? '/' : check.url.pathname);
}

async function isServerUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

interface Prepared {
  inc: Incident;
  ir: AssertionIR;
  assertionText: string;
  baseUrl: string;
  usedStorageState: boolean;
  signature: string;
  stepsPath: string;
  specPath: string;
  configPath: string;
  screenshotPath: string;
  storageState: string | null;
  syntheticInputs: string[];
  warnings: string[];
}

/** Assertion'ı ayrıştırır ve repro dosyalarını üretir. Çağıran kilidi tutmalıdır. */
function prepare(deps: ReproDeps, input: RunReproInput, runTag: string): Prepared {
  const { store, config } = deps;
  const inc = store.require(input.id);
  const { ir, text } = parseAssertions(input.assertions, { hasTarget: inc.target !== null });
  const baseUrl = resolveBaseUrl(inc, input.baseUrl, config);
  const warnings: string[] = [];
  let storageState: string | null = null;
  if (config.storageState) {
    if (fs.existsSync(config.storageState)) storageState = config.storageState;
    else warnings.push('REWIND_STORAGE_STATE dosyası bulunamadı; oturumsuz koşuldu.');
  }
  const strict = input.strict ?? false;
  const signature = computeSignature(ir, strict, baseUrl, storageState !== null);

  store.init();
  const dir = store.reproDir;
  const specPath = path.join(dir, `${inc.id}.spec.ts`);
  const stepsPath = path.join(dir, `${inc.id}.steps.json`);
  const configPath = path.join(dir, CONFIG_FILE);
  const screenshotPath = path.join(dir, `${inc.id}-${runTag}.png`);
  const built = buildStepsData(inc, {
    baseUrl,
    storageState,
    strict,
    screenshotPath,
    passwordSet: !!(config.password || process.env.REWIND_PASSWORD),
    allowOrigins: config.allowOrigins,
  });
  // Değeri ortam değişkeninden gelen alanlar assertion ile okunamaz (gerçek değer hata metnine sızar).
  const secretSelectors = built.data.steps
    .filter((s) => s.env?.some((name) => envProvides(name, { password: config.password })))
    .flatMap((s) => s.selectors);
  checkSecretValueAssertions(ir, secretSelectors, built.data.target?.selectors ?? null);
  store.writeAtomic(stepsPath, JSON.stringify(built.data, null, 2));
  store.writeAtomic(specPath, renderSpec(renderAssertions(ir)));
  store.writeAtomic(configPath, CONFIG_TEMPLATE);
  return {
    inc,
    ir,
    assertionText: text,
    baseUrl,
    usedStorageState: storageState !== null,
    signature,
    stepsPath,
    specPath,
    configPath,
    screenshotPath,
    storageState,
    syntheticInputs: built.syntheticInputs,
    warnings: [...warnings, ...built.warnings],
  };
}

/** `get_repro_script`: testi çalıştırmadan üretir (FR-MCP-06). */
export function generateReproScript(deps: ReproDeps, input: Omit<RunReproInput, 'repeat' | 'headed'>) {
  if (!deps.store.tryLock(input.id)) throw new RewindError('busy', 'Bu olay için bir koşu sürüyor.');
  try {
    const p = prepare(deps, input, 'manual');
    return {
      specPath: p.specPath,
      stepsPath: p.stepsPath,
      configPath: p.configPath,
      spec: fs.readFileSync(p.specPath, 'utf8'),
      assertionText: p.assertionText,
      signature: p.signature,
      command: `npx playwright test ${path.basename(p.specPath)} --config ${CONFIG_FILE}   # çalışma dizini: ${path.dirname(p.specPath)}`,
      syntheticInputs: p.syntheticInputs,
      warnings: p.warnings,
    };
  } finally {
    deps.store.unlock(input.id);
  }
}

function spawnPlaywright(
  pw: PlaywrightInfo,
  p: Prepared,
  opts: { headed: boolean; repeat: number; timeoutS: number; projectRoot: string; password?: string },
): Promise<{ report?: PwReport; stdout: string; stderr: string; killedByTimeout: boolean }> {
  const reportFile = path.join(path.dirname(p.specPath), `${p.inc.id}.report.json`);
  const outputDir = path.join(path.dirname(p.specPath), `${p.inc.id}.results`);
  fs.rmSync(reportFile, { force: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    REWIND_REPORT_FILE: reportFile,
    REWIND_OUTPUT_DIR: outputDir,
    REWIND_TEST_TIMEOUT_MS: String(opts.timeoutS * 1000),
    REWIND_HEADED: opts.headed ? '1' : '0',
    FORCE_COLOR: '0',
    // .rewind proje dışındaysa spec'in '@playwright/test' içe aktarımı projeden çözülsün.
    NODE_PATH: [path.join(opts.projectRoot, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };
  if (opts.password) env.REWIND_PASSWORD = opts.password;
  const args = [pw.cliPath, 'test', path.basename(p.specPath), '--config', CONFIG_FILE, '--repeat-each', String(opts.repeat)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: path.dirname(p.specPath),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout = (stdout + c.toString()).slice(-20_000)));
    child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString()).slice(-20_000)));
    let killedByTimeout = false;
    const timer = setTimeout(
      () => {
        killedByTimeout = true;
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      },
      opts.timeoutS * 1000 * opts.repeat + 10_000,
    );
    const finish = () => {
      clearTimeout(timer);
      let report: PwReport | undefined;
      try {
        report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as PwReport;
      } catch {
        report = undefined;
      }
      // Rapor ve Playwright çıktıları (error-context.md vb.) gerçek giriş değerlerini içerebilir: kalıcı tutulmaz.
      fs.rmSync(reportFile, { force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
      resolve({ report, stdout, stderr, killedByTimeout });
    };
    child.on('error', (e) => {
      stderr += String(e);
      finish();
    });
    child.on('close', finish);
  });
}

const ICON: Record<ReproRun['status'], string> = { passed: '✅', failed_assertion: '❌', error: '⚠' };

function formatRuns(runs: ReproRun[]): string {
  if (!runs.length) return 'Önceki koşular: yok';
  const fmt = (r: ReproRun) => {
    const time = new Date(r.t).toLocaleTimeString('tr-TR', { hour12: false });
    return `${ICON[r.status]} ${time}${r.errorKind ? ` (${r.errorKind})` : ''} [${r.signature.slice(0, 6)}]`;
  };
  return `Önceki koşular: ${runs.slice(-10).map(fmt).join(' · ')}`;
}

/** FR-REPRO-06/11/17: ajana yönelik yorum. `before` bu koşu eklenmeden önceki olaydır. */
export function buildComment(
  before: Incident,
  run: ReproRun,
  extra: { targetFound: boolean | null; sessionWarning: boolean },
): string[] {
  const lines: string[] = [];
  const prevValid = countedRuns(before);
  if (run.status === 'error') {
    if (run.errorKind === 'precondition') {
      lines.push('Ön koşul eksik; kırmızı sayılmadı. Uygulama kayıttaki başlangıç durumuna ulaşamadı (ör. /login yönlendirmesi ya da ilk öğe yok).');
    } else lines.push(`Altyapı hatası (${run.errorKind}); kırmızı sayılmadı.`);
    lines.push(`Öneri: ${ERROR_SUGGESTIONS[run.errorKind === 'server_down' ? 'dev_server_down' : (run.errorKind ?? 'internal')]}`);
  } else {
    const after = { ...before, repros: [...before.repros, run] };
    const v = evaluateVerification(countedRuns(after));
    if (run.status === 'passed') {
      if (prevValid.length === 0) {
        lines.push(
          'Hata yeniden üretilemedi: olayın ilk geçerli koşusu yeşil. Assertion geliştiricinin notunu doğru ifade ediyorsa mark_fixed(resolution: "cannot_reproduce") düşün; değilse assertion\'ı nota göre güçlendir.',
        );
      } else if (v.verified) {
        lines.push('Doğrulama koşulu sağlandı (aynı imzayla kırmızı → yeşil → yeşil). mark_fixed(resolution: "fixed") çağırabilirsin.');
      } else lines.push(`Yeşil. ${v.missing ?? ''}`.trim());
    } else {
      const hadGreen = prevValid.some((r) => r.signature === run.signature && r.status === 'passed');
      lines.push(
        hadGreen
          ? 'Kırmızı: daha önce yeşil olan aynı beklenti yeniden başarısız oldu; düzeltme kalıcı değil ya da sonuç kararsız.'
          : 'Hata yeniden üretildi (kırmızı). Şimdi kodu düzelt ve AYNI assertion ile run_repro\'yu iki kez çalıştır.',
      );
    }
  }
  if (run.mixed) lines.push(`Uyarı: ${run.repeat} tekrarda sonuçlar karışık; hata zamanlamaya bağlı olabilir.`);
  if (extra.targetFound === false && run.status !== 'error') {
    lines.push('Uyarı: hedef öğe kayıttaki seçicilerle bulunamadı; assertion var olmayan bir öğe üzerinde değerlendirildi.');
  }
  if (extra.sessionWarning) {
    lines.push('Uyarı: başlangıç bağlamında oturum işareti var ama REWIND_STORAGE_STATE tanımlı değil (FR-REPRO-11); sonuç oturumsuz durumu yansıtabilir.');
  }
  return lines;
}

/** `run_repro` (FR-MCP-05, §7.8). Koşu olaya eklenir; altyapı hataları kırmızı sayılmaz. */
export async function runRepro(deps: ReproDeps, input: RunReproInput): Promise<RunReproResult> {
  const { store, config } = deps;
  const now = deps.now ?? (() => new Date());
  store.require(input.id);
  if (!store.tryLock(input.id)) throw new RewindError('busy', 'Bu olay için bir run_repro koşusu sürüyor.');
  try {
    const before = store.require(input.id);
    const runNo = before.repros.length + 1;
    const p = prepare(deps, input, String(runNo));
    const repeat = Math.min(Math.max(Math.trunc(input.repeat ?? 1), 1), 5);
    const started = Date.now();
    const sideEffects = before.network
      .filter((n) => SIDE_EFFECT_METHODS.has(n.method.toUpperCase()))
      .slice(0, 20)
      .map((n) => {
        let where = n.url;
        try {
          where = new URL(n.url).pathname;
        } catch {
          /* ham URL */
        }
        return `${n.method.toUpperCase()} ${where} → ${n.status}`;
      });

    let outcome: Classified & { mixed: boolean };
    const secrets: Secret[] = collectSecrets({ password: config.password, storageState: p.storageState });
    const pw = resolvePlaywright(config.projectRoot);
    if (!(await isServerUp(p.baseUrl))) {
      outcome = { status: 'error', errorKind: 'server_down', error: `${p.baseUrl} adresine bağlanılamadı; test başlatılmadı.`, mixed: false };
    } else if (!pw) {
      outcome = {
        status: 'error',
        errorKind: 'playwright_missing',
        error: `@playwright/test ${config.projectRoot} konumundan çözülemedi.`,
        mixed: false,
      };
    } else {
      const res = await spawnPlaywright(pw, p, {
        headed: input.headed ?? false,
        repeat,
        timeoutS: config.reproTimeoutS,
        projectRoot: config.projectRoot,
        password: config.password,
      });
      outcome = aggregate(classifyRun({ ...res, stdout: scrubSecrets(res.stdout, secrets), stderr: scrubSecrets(res.stderr, secrets) }));
    }
    const scrub = (x: string) => scrubSecrets(x, secrets);
    const observed = outcome.observed ?? { console: [], network: [], targetFound: null };

    const screenshot = fs.existsSync(p.screenshotPath) ? fs.readFileSync(p.screenshotPath) : undefined;
    const run: ReproRun = {
      id: `${before.id}-${runNo}`,
      t: now().toISOString(),
      status: outcome.status,
      errorKind: outcome.status === 'error' ? outcome.errorKind : undefined,
      assertionIR: p.ir,
      signature: p.signature,
      strict: input.strict ?? false,
      baseUrl: p.baseUrl,
      usedStorageState: p.usedStorageState,
      unsafe: false,
      durationMs: Date.now() - started,
      error: outcome.error === undefined ? undefined : scrub(outcome.error),
      observed: { console: observed.console.slice(0, 50).map(scrub), network: observed.network.slice(0, 50).map(scrub) },
      screenshotPath: screenshot ? p.screenshotPath : undefined,
      syntheticInputs: p.syntheticInputs,
      sideEffects,
      repeat: repeat > 1 ? repeat : undefined,
      mixed: repeat > 1 ? outcome.mixed : undefined,
    };
    store.update(input.id, (inc) => {
      inc.repros.push(run);
    });

    const comment = buildComment(before, run, {
      targetFound: observed.targetFound,
      sessionWarning: sessionHints(before).length > 0 && !p.usedStorageState,
    });
    if (sideEffects.length && before.repros.length === 0) {
      // İstek listesi olay verisidir; ajana çitli blokta gösterilir (bkz. tools.ts).
      comment.push(`Uyarı: kayıtta ${sideEffects.length} yan etkili istek var; repro bunları canlı backend'e yeniden gönderir (FR-REPRO-19).`);
    }
    comment.push(...p.warnings);
    return { run, assertionText: p.assertionText, comment, previousRuns: formatRuns(before.repros), screenshot };
  } finally {
    store.unlock(input.id);
  }
}
