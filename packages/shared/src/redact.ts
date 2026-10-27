/**
 * Hassas veri gizleme (FR-RED-01…15).
 *
 * Tarayıcıda, olay gönderilmeden ÖNCE çalışır. Saf TypeScript'tir; hem tarayıcıda hem Node'da
 * (rewind-mcp'nin savunma amaçlı ikinci geçişi ve testler) kullanılır.
 */

/** FR-RED-10: kapalı, sürümlü anahtar listesi. Eşleşme büyük/küçük harfe duyarsızdır, `-` ve `_` yok sayılır. */
export const REDACT_KEYS_VERSION = 1;
export const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'api_key',
  'x-api-key',
  'authorization',
  'cookie',
  'set-cookie',
  'session',
  'sessionid',
  'csrf',
];

/** Anahtar bu eklerden biriyle bitiyorsa da hassas sayılır (ör. `userPassword`, `csrfToken`, `githubToken`). */
const SENSITIVE_SUFFIXES = ['password', 'passwd', 'secret', 'token', 'apikey', 'sessionid', 'csrf'];

export interface RedactOptions {
  /** `false` her şeyi olduğu gibi bırakır (FR-RED-08). */
  enabled?: boolean;
  /** Ek hassas anahtar adları (FR-RED-06). */
  keys?: string[];
  /** Ek desenler (FR-RED-06). Her eşleşme `[REDACTED:custom]` olur. */
  patterns?: RegExp[];
  /** E-posta gizleme (varsayılan açık, FR-RED-05). */
  emails?: boolean;
  /** Telefon gizleme (varsayılan kapalı, FR-RED-05 / AS-4). */
  phones?: boolean;
}

export interface RedactionStats {
  count: number;
  byType: Record<string, number>;
}

/** `user[password]`, `X-Api-Key`, `api_key` → karşılaştırma için tek biçim. */
export const normalizeKey = (k: string) => k.toLowerCase().replace(/[-_\s[\]]/g, '');

/**
 * Serbest metindeki `anahtar: değer` / `anahtar=değer` çiftleri (log satırları, GraphQL argümanları, gömülü JSON parçaları).
 * Yalnızca tam anahtar adları (sonek değil) — `tokenCount: 1200` gibi değerler etkilenmez.
 */
const KV_RE =
  /(["']?)\b(password|passwd|secret|token|access_token|refresh_token|id_token|client_secret|api_key|apikey|x-api-key|authorization|sessionid|session_id|csrf|csrf_token)\1(\s*[:=]\s*)(?!\[REDACTED)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:(?:Bearer|Basic)\s+)?[^\s,&;}\])]+)/gi;

export function marker(type: string) {
  return `[REDACTED:${type}]`;
}

const MARKER_RE = /\[REDACTED(?::[a-z_]+)?\]/;

// ---- sağlama algoritmaları --------------------------------------------------

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const val = code >= 65 ? String(code - 55) : ch;
    for (const d of val) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

export function tcknValid(s: string): boolean {
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = s.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d11 === d[10];
}

// ---- desenler ---------------------------------------------------------------

interface PatternRule {
  type: string;
  re: RegExp;
  /** Eşleşmenin gerçekten gizlenmesi gerekip gerekmediğini denetler (sağlama). */
  check?: (m: string) => boolean;
}

const SECRET_RULES: PatternRule[] = [
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g },
  { type: 'token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { type: 'token', re: /\bBasic\s+[A-Za-z0-9+/=]{8,}/g },
  { type: 'api_key', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g },
  { type: 'api_key', re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g },
  { type: 'api_key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { type: 'api_key', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'api_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
];

const EMAIL_RULE: PatternRule = {
  type: 'email',
  re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
};

const PII_RULES: PatternRule[] = [
  {
    type: 'iban',
    re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g,
    check: (m) => ibanValid(m),
  },
  {
    type: 'card',
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    check: (m) => {
      const digits = m.replace(/[ -]/g, '');
      // Yalnızca kart ağlarının ön ekleri (2–6). Böylece 1 ile başlayan epoch-ms zaman damgaları etkilenmez.
      return (
        digits.length >= 13 &&
        digits.length <= 19 &&
        /^[2-6]/.test(digits) &&
        luhnValid(digits) &&
        !/^(\d)\1+$/.test(digits)
      );
    },
  },
  { type: 'tckn', re: /\b[1-9]\d{10}\b/g, check: (m) => tcknValid(m) },
];

const PHONE_RULE: PatternRule = {
  type: 'phone',
  re: /(?:\+90[\s-]?|\b0)5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b|\+[1-9]\d{7,14}\b/g,
};

// ---- Redactor ---------------------------------------------------------------

export class Redactor {
  readonly enabled: boolean;
  readonly stats: RedactionStats = { count: 0, byType: {} };
  private readonly keySet: Set<string>;
  private readonly rules: PatternRule[];

  constructor(opts: RedactOptions = {}) {
    this.enabled = opts.enabled !== false;
    this.keySet = new Set([...DEFAULT_SENSITIVE_KEYS, ...(opts.keys ?? [])].map(normalizeKey));
    const rules = [...SECRET_RULES];
    if (opts.emails !== false) rules.push(EMAIL_RULE);
    rules.push(...PII_RULES);
    if (opts.phones === true) rules.push(PHONE_RULE);
    for (const p of opts.patterns ?? []) {
      const flags = p.flags.includes('g') ? p.flags : p.flags + 'g';
      rules.push({ type: 'custom', re: new RegExp(p.source, flags) });
    }
    this.rules = rules;
  }

  private bump(type: string) {
    this.stats.count++;
    this.stats.byType[type] = (this.stats.byType[type] ?? 0) + 1;
  }

  /** Anahtar hassas mı? Hassassa kategori adını döndürür. */
  keyType(key: string): string | null {
    const k = normalizeKey(key);
    if (!k) return null;
    const hit = this.keySet.has(k) || SENSITIVE_SUFFIXES.some((s) => k.endsWith(s));
    if (!hit) return null;
    if (k.includes('passw')) return 'password';
    if (k.includes('cookie')) return 'cookie';
    if (k.startsWith('session')) return 'session';
    if (k.includes('token') || k === 'authorization') return 'token';
    return 'secret';
  }

  /** `auth.token`, `items[0].password` gibi bir yolun herhangi bir parçası hassas mı? (store değişiklikleri) */
  pathType(path: string): string | null {
    for (const seg of path.split(/[.[\]/]+/)) {
      const type = seg ? this.keyType(seg) : null;
      if (type) return type;
    }
    return null;
  }

  /** Serbest metindeki desenleri gizler (FR-RED-03/04/05). */
  text(input: string): string {
    if (!this.enabled || !input) return input;
    let out = input;
    for (const rule of this.rules) {
      rule.re.lastIndex = 0;
      out = out.replace(rule.re, (m) => {
        if (MARKER_RE.test(m)) return m;
        if (rule.check && !rule.check(m)) return m;
        this.bump(rule.type);
        return marker(rule.type);
      });
    }
    // Desenlerden SONRA: `Authorization: Bearer …` önce desenle bütünüyle gizlenir.
    out = out.replace(KV_RE, (m, q: string, key: string, sep: string, val: string) => {
      if (MARKER_RE.test(val)) return m;
      const type = this.keyType(key) ?? 'secret';
      this.bump(type);
      const quoted = /^["']/.test(val) ? val[0] + marker(type) + val[0] : marker(type);
      return `${q}${key}${q}${sep}${quoted}`;
    });
    return out;
  }

  /** JSON benzeri bir değeri derin gezinmeyle gizler (FR-RED-09). */
  value<T>(v: T, depth = 0): T {
    if (!this.enabled) return v;
    if (depth > 50) return v;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.length > 1 && /^[{[]/.test(s)) {
        try {
          // Metin alanında saklanan JSON (`{"payload":"{\"password\":…}"}`).
          return JSON.stringify(this.value(JSON.parse(s), depth + 1)) as unknown as T;
        } catch {
          /* JSON değil */
        }
      }
      return this.text(v) as unknown as T;
    }
    if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1e10) {
      // JSON sayısı olarak gelen kart / TCKN numaraları.
      const s = String(v);
      const r = this.text(s);
      return (r === s ? v : r) as unknown as T;
    }
    if (Array.isArray(v)) return v.map((x) => this.value(x, depth + 1)) as unknown as T;
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const type = this.keyType(k);
        if (type && val !== null && val !== undefined && val !== '') {
          this.bump(type);
          out[k] = marker(type);
        } else {
          out[k] = this.value(val, depth + 1);
        }
      }
      return out as T;
    }
    return v;
  }

  /** Başlık kaydı. `Authorization`, `Cookie`, `Set-Cookie` her zaman gizlenir (Ek C). */
  headers(h: Record<string, string>): Record<string, string> {
    if (!this.enabled) return h;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      const type = this.keyType(k);
      if (type) {
        this.bump(type);
        out[k] = marker(type);
      } else out[k] = this.text(v);
    }
    return out;
  }

  /** `a=1&b=2` biçimindeki parametre listesi: hassas anahtarların değeri gizlenir, diğerlerinde desen taraması. */
  private params(query: string): string {
    return query
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=');
        if (eq === -1) return this.text(pair);
        const k = pair.slice(0, eq);
        let decodedKey = k;
        try {
          decodedKey = decodeURIComponent(k);
        } catch {
          /* olduğu gibi */
        }
        const type = this.keyType(decodedKey);
        if (type) {
          this.bump(type);
          return `${k}=${marker(type)}`;
        }
        let val = pair.slice(eq + 1);
        try {
          const decoded = decodeURIComponent(val.replace(/\+/g, ' '));
          const red = this.text(decoded);
          if (red !== decoded) val = red;
        } catch {
          val = this.text(val);
        }
        return `${k}=${val}`;
      })
      .join('&');
  }

  /** URL: hassas sorgu ve fragment parametrelerinin değeri, yol ve diğer değerlerdeki desenler gizlenir. */
  url(raw: string): string {
    if (!this.enabled || !raw) return raw;
    const hashAt = raw.indexOf('#');
    const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt);
    const hash = hashAt === -1 ? '' : raw.slice(hashAt + 1);
    const q = beforeHash.indexOf('?');
    const base = q === -1 ? beforeHash : beforeHash.slice(0, q);
    let out = this.text(base);
    if (q !== -1) out += '?' + this.params(beforeHash.slice(q + 1));
    // OAuth implicit akışı: `#access_token=…&state=…`
    if (hashAt !== -1) out += '#' + (hash.includes('=') ? this.params(hash) : this.text(hash));
    return out;
  }

  /** İstek/yanıt gövdesi: JSON, form-urlencoded ya da düz metin. */
  body(raw: string | undefined, contentType = ''): string | undefined {
    if (!this.enabled || raw === undefined || raw === '') return raw;
    const trimmed = raw.trim();
    if (contentType.includes('json') || /^[{[]/.test(trimmed)) {
      try {
        return JSON.stringify(this.value(JSON.parse(trimmed)));
      } catch {
        /* JSON değil */
      }
    }
    if (contentType.includes('x-www-form-urlencoded') || /^[\w.%-]+=[^&]*(&[\w.%-]+=[^&]*)*$/.test(trimmed)) {
      return this.url('?' + trimmed).slice(1);
    }
    return this.text(raw);
  }

  /**
   * Kayıt anında giriş değerini gizler (FR-RED-11). Parola alanları her zaman gizlenir.
   * Dönüş: gizlenmiş değer ve (gizlendiyse) türü.
   */
  input(value: string, el: { type?: string; name?: string; id?: string; autocomplete?: string }): { value: string; as?: string } {
    if (el.type === 'password') {
      this.bump('password');
      return { value: marker('password'), as: 'password' };
    }
    if (!this.enabled) return { value };
    for (const k of [el.name, el.id, el.autocomplete]) {
      const type = k ? this.keyType(k) : null;
      if (type) {
        this.bump(type);
        return { value: marker(type), as: type };
      }
    }
    const before = this.stats.count;
    const out = this.text(value);
    if (this.stats.count === before) return { value };
    const m = out.match(/\[REDACTED:([a-z_]+)\]/);
    return { value: out, as: m?.[1] ?? 'secret' };
  }
}

/** Bu metinde gizlenmiş bir değer işareti var mı? */
export function hasMarker(s: string): boolean {
  return MARKER_RE.test(s);
}
