import * as fs from 'node:fs';
import type { AssertionIR } from '@flashback/shared';
import { AssertionParseError } from './assertion-parser.js';

/**
 * Repro koşusunda kullanılan gerçek gizli değerler: `FLASHBACK_PASSWORD`, `FLASHBACK_INPUT_*` ve storageState
 * dosyasındaki çerez/localStorage değerleri. Bunlar hiçbir koşu kaydına, MCP yanıtına ya da kalıcı
 * Playwright çıktısına yazılmaz (FR-RED-15, FR-REPRO-10).
 */
export interface Secret {
  value: string;
  type: 'password' | 'input' | 'session';
}

export const SECRET_ENV = /^FLASHBACK_(PASSWORD|INPUT_[A-Z0-9_]{1,64})$/;
/** Çok kısa değerler sıradan metinle çakışır; gizleme anlamsızlaşır. */
const MIN_SECRET_LENGTH = 4;

export interface SecretSource {
  password?: string;
  storageState?: string | null;
}

/** Ortam değişkeni koşuda gerçekten bir değer sağlıyor mu? */
export function envProvides(name: string, src: SecretSource, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!SECRET_ENV.test(name)) return false;
  if (name === 'FLASHBACK_PASSWORD') return !!(src.password || env.FLASHBACK_PASSWORD);
  return !!env[name];
}

export function collectSecrets(src: SecretSource, env: NodeJS.ProcessEnv = process.env): Secret[] {
  const out: Secret[] = [];
  const add = (value: unknown, type: Secret['type']) => {
    if (typeof value === 'string' && value.length >= MIN_SECRET_LENGTH) out.push({ value, type });
  };
  add(src.password, 'password');
  for (const [k, v] of Object.entries(env)) {
    if (k === 'FLASHBACK_PASSWORD') add(v, 'password');
    else if (SECRET_ENV.test(k)) add(v, 'input');
  }
  if (src.storageState) {
    try {
      const st = JSON.parse(fs.readFileSync(src.storageState, 'utf8')) as {
        cookies?: Array<{ value?: unknown }>;
        origins?: Array<{ localStorage?: Array<{ value?: unknown }> }>;
      };
      for (const c of st.cookies ?? []) add(c.value, 'session');
      for (const o of st.origins ?? []) for (const e of o.localStorage ?? []) add(e.value, 'session');
    } catch {
      /* okunamayan storageState: gizlenecek değer yok */
    }
  }
  return out;
}

function variants(v: string): string[] {
  const html = v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [v, encodeURIComponent(v), new URLSearchParams({ x: v }).toString().slice(2), JSON.stringify(v).slice(1, -1), html];
}

/** Metindeki gizli değerleri (ve URL/form/JSON/HTML kodlanmış biçimlerini) `[REDACTED:<tür>]` ile değiştirir. */
export function scrubSecrets(text: string, secrets: Secret[]): string {
  if (!text || !secrets.length) return text;
  const pairs = secrets
    .flatMap((s) => variants(s.value).map((v) => ({ v, type: s.type })))
    .filter((p) => p.v.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.v.length - a.v.length);
  let out = text;
  for (const p of pairs) out = out.split(p.v).join(`[REDACTED:${p.type}]`);
  return out;
}

const SECRETISH = /passw|pwd|secret|type=["']?password/i;

/**
 * Ortam değişkeninden doldurulan alanların değeri assertion ile okunamaz: `toHaveValue` /
 * `toHaveAttribute('value', …)` başarısız olunca Playwright gerçek değeri hata metnine yazar.
 * Yerel konumlayıcılar (getByRole, getByLabel…) hangi alanı gösterdikleri statik olarak bilinemediği için reddedilir.
 */
export function checkSecretValueAssertions(ir: AssertionIR, secretSelectors: string[], targetSelectors: string[] | null): void {
  if (!secretSelectors.length) return;
  const secret = new Set(secretSelectors);
  ir.forEach((a, i) => {
    const readsValue =
      a.matcher === 'toHaveValue' ||
      (a.matcher === 'toHaveAttribute' && a.args[0]?.type === 'string' && a.args[0].value.toLowerCase() === 'value');
    if (!readsValue) return;
    const s = a.subject;
    let risky: boolean;
    if (s.kind === 'target') risky = (targetSelectors ?? []).some((t) => secret.has(t) || SECRETISH.test(t));
    else if (s.kind === 'locator') risky = secret.has(s.selector) || SECRETISH.test(s.selector);
    else risky = true;
    if (risky) {
      throw new AssertionParseError(
        `${i + 1}. beklenti (${a.matcher}): bu olayda değeri ortam değişkeninden (FLASHBACK_PASSWORD / FLASHBACK_INPUT_*) doldurulan alanlar var; ` +
          'bu alanların değeri assertion ile okunamaz, çünkü başarısız beklenti gerçek değeri hata metnine yazar. ' +
          'Değer denetimini yalnızca bu alanlar dışındaki bir page.locator(...) seçicisiyle yap ya da sonucu sayfadaki görünür metinle doğrula.',
      );
    }
  });
}
