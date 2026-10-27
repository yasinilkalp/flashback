import {
  ASSERTION_MATCHERS,
  AssertionIRSchema,
  renderAssertions,
  type Assertion,
  type AssertionArg,
  type AssertionIR,
  type AssertionMatcher,
  type AssertionSubject,
} from '@rewind/shared';
import { z } from 'zod';
import { RewindError } from './errors.js';

/**
 * FR-REPRO-SEC-01: ajanın Playwright biçimindeki beklentisini dar bir dilbilgisiyle IR'ye ayrıştırır.
 * Metin HİÇBİR ZAMAN çalıştırılmaz (eval / new Function / vm yok); kod yalnızca IR'den üretilir.
 *
 *   program   := statement+
 *   statement := ['await'] 'expect' '(' subject ')' ['.' 'not'] '.' MATCHER '(' [arg (',' arg)* [',']] ')' [';']
 *   subject   := 'target' | 'page' | 'page' '.' locator
 *   locator   := 'getByRole' '(' STR [',' '{' 'name' ':' (STR|REGEX) [','] '}'] ')'
 *              | 'getByText' '(' (STR|REGEX) ')' | 'getByTestId' '(' STR ')'
 *              | 'getByLabel' '(' STR ')' | 'locator' '(' STR ')'
 *   arg       := STR | NUMBER | REGEX
 */

type TokType = 'ident' | 'string' | 'number' | 'regex' | 'punct' | 'eof';
interface Token {
  type: TokType;
  value: string;
  flags?: string;
  num?: number;
  line: number;
  col: number;
}

export class AssertionParseError extends RewindError {
  constructor(message: string) {
    super('assertion_rejected', message);
  }
}

const PUNCT = new Set(['(', ')', '.', ',', ';', '{', '}', ':']);
const describe = (t: Token) =>
  t.type === 'eof' ? 'metnin sonu' : t.type === 'string' ? 'metin sabiti' : t.type === 'regex' ? 'regex' : `"${t.value}"`;

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const pos = () => ({ line, col: i - lineStart + 1 });
  const fail = (msg: string): never => {
    throw new AssertionParseError(`Satır ${line}, sütun ${i - lineStart + 1}: ${msg}`);
  };
  const regexAllowed = () => {
    const prev = toks[toks.length - 1];
    return !prev || (prev.type === 'punct' && ['(', ',', ':'].includes(prev.value));
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') {
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Yorumlar atılır.
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) fail('kapanmamış yorum');
      for (let k = i; k < end + 2; k++) if (src[k] === '\n') {
        line++;
        lineStart = k + 1;
      }
      i = end + 2;
      continue;
    }
    const p = pos();
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ type: 'ident', value: src.slice(i, j), ...p });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^-?\d+(\.\d+)?/.exec(src.slice(i))!;
      if (/[A-Za-z_$]/.test(src[i + m[0].length] ?? '')) fail('geçersiz sayı');
      toks.push({ type: 'number', value: m[0], num: Number(m[0]), ...p });
      i += m[0].length;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let out = '';
      for (;;) {
        if (j >= src.length) fail('kapanmamış metin sabiti');
        const c = src[j];
        if (c === quote) break;
        if (quote === '`' && c === '$' && src[j + 1] === '{') fail('şablon ifadesi (${…}) kullanılamaz; düz metin yaz');
        if (c === '\n' && quote !== '`') fail('metin sabiti satır sonu içeremez');
        if (c === '\\') {
          const e = src[j + 1];
          if (e === undefined) fail('yarım kaçış dizisi');
          const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
          if (e in simple) {
            out += simple[e];
            j += 2;
          } else if (e === 'x') {
            const h = src.slice(j + 2, j + 4);
            if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('geçersiz \\x kaçışı');
            out += String.fromCharCode(parseInt(h, 16));
            j += 4;
          } else if (e === 'u') {
            const m = /^u(?:\{([0-9a-fA-F]{1,6})\}|([0-9a-fA-F]{4}))/.exec(src.slice(j + 1));
            if (!m) fail('geçersiz \\u kaçışı');
            const cp = parseInt(m![1] ?? m![2], 16);
            if (cp > 0x10ffff) fail('geçersiz kod noktası');
            out += String.fromCodePoint(cp);
            j += 1 + m![0].length;
          } else if (e === '\n') {
            j += 2; // satır devamı
          } else {
            out += e;
            j += 2;
          }
          continue;
        }
        out += c;
        j++;
      }
      toks.push({ type: 'string', value: out, ...p });
      for (let k = i; k <= j; k++) if (src[k] === '\n') {
        line++;
        lineStart = k + 1;
      }
      i = j + 1;
      continue;
    }
    if (ch === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      for (;;) {
        const c = src[j];
        if (c === undefined || c === '\n') fail('kapanmamış regex');
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        j++;
      }
      const source = src.slice(i + 1, j);
      let k = j + 1;
      while (k < src.length && /[a-z]/.test(src[k])) k++;
      const flags = src.slice(j + 1, k);
      if (!/^[dgimsuyv]*$/.test(flags) || new Set(flags).size !== flags.length) fail(`geçersiz regex bayrağı "${flags}"`);
      try {
        new RegExp(source, flags); // yalnızca derlenebilirlik denetimi; çalıştırılmaz
      } catch (e) {
        fail(`geçersiz regex: ${(e as Error).message}`);
      }
      toks.push({ type: 'regex', value: source, flags, ...p });
      i = k;
      continue;
    }
    if (PUNCT.has(ch)) {
      toks.push({ type: 'punct', value: ch, ...p });
      i++;
      continue;
    }
    fail(`beklenmeyen karakter ${JSON.stringify(ch)}`);
  }
  toks.push({ type: 'eof', value: '', line, col: i - lineStart + 1 });
  return toks;
}

const LOCATOR_METHODS = ['getByRole', 'getByText', 'getByTestId', 'getByLabel', 'locator'] as const;

class Parser {
  private i = 0;
  constructor(private readonly toks: Token[]) {}

  private peek(o = 0): Token {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)];
  }
  private next(): Token {
    return this.toks[this.i++];
  }
  private fail(t: Token, expected: string): never {
    throw new AssertionParseError(`Satır ${t.line}, sütun ${t.col}: ${expected} bekleniyordu, ${describe(t)} bulundu.`);
  }
  private punct(v: string): Token {
    const t = this.next();
    if (t.type !== 'punct' || t.value !== v) this.fail(t, `"${v}"`);
    return t;
  }
  private isPunct(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.type === 'punct' && t.value === v;
  }
  private ident(expected: string, allowed?: readonly string[]): Token {
    const t = this.next();
    if (t.type !== 'ident' || (allowed && !allowed.includes(t.value))) this.fail(t, expected);
    return t;
  }
  private str(what: string): string {
    const t = this.next();
    if (t.type !== 'string') this.fail(t, `${what} için metin sabiti`);
    return t.value;
  }
  private strOrRegex(what: string): string | { regex: string; flags: string } {
    const t = this.next();
    if (t.type === 'string') return t.value;
    if (t.type === 'regex') return { regex: t.value, flags: t.flags ?? '' };
    return this.fail(t, `${what} için metin sabiti ya da regex`);
  }

  program(): Array<{ a: Assertion; tok: Token }> {
    const out: Array<{ a: Assertion; tok: Token }> = [];
    while (this.peek().type !== 'eof') out.push(this.statement());
    if (!out.length) this.fail(this.peek(), 'en az bir expect(...) ifadesi');
    return out;
  }

  private statement(): { a: Assertion; tok: Token } {
    const start = this.peek();
    if (start.type === 'ident' && start.value === 'await') this.next();
    this.ident('"expect"', ['expect']);
    this.punct('(');
    const subject = this.subject();
    this.punct(')');
    this.punct('.');
    let not = false;
    let m = this.ident(`matcher (${ASSERTION_MATCHERS.join(', ')}) ya da "not"`);
    if (m.value === 'not') {
      not = true;
      this.punct('.');
      m = this.ident(`matcher (${ASSERTION_MATCHERS.join(', ')})`);
    }
    if (!(ASSERTION_MATCHERS as readonly string[]).includes(m.value)) {
      this.fail(m, `izinli matcher'lardan biri (${ASSERTION_MATCHERS.join(', ')})`);
    }
    this.punct('(');
    const args: AssertionArg[] = [];
    while (!this.isPunct(')')) {
      const t = this.next();
      if (t.type === 'string') args.push({ type: 'string', value: t.value });
      else if (t.type === 'number') args.push({ type: 'number', value: t.num! });
      else if (t.type === 'regex') args.push({ type: 'regex', source: t.value, flags: t.flags ?? '' });
      else this.fail(t, 'sabit argüman (metin, sayı ya da regex)');
      if (this.isPunct(',')) this.next();
      else if (!this.isPunct(')')) this.fail(this.peek(), '"," ya da ")"');
    }
    this.punct(')');
    if (this.isPunct(';')) this.next();
    return { a: { subject, matcher: m.value as AssertionMatcher, not, args }, tok: m };
  }

  private subject(): AssertionSubject {
    const head = this.ident('"target" ya da "page"', ['target', 'page']);
    if (head.value === 'target') return { kind: 'target' };
    if (!this.isPunct('.')) return { kind: 'page' };
    this.next();
    const method = this.ident(`page yöntemi (${LOCATOR_METHODS.join(', ')})`, LOCATOR_METHODS);
    this.punct('(');
    let s: AssertionSubject;
    switch (method.value as (typeof LOCATOR_METHODS)[number]) {
      case 'getByRole': {
        const role = this.str('rol');
        let name: string | { regex: string; flags: string } | undefined;
        if (this.isPunct(',') && !this.isPunct(')', 1)) {
          this.next();
          this.punct('{');
          this.ident('"name"', ['name']);
          this.punct(':');
          name = this.strOrRegex('name');
          if (this.isPunct(',')) this.next();
          this.punct('}');
        }
        s = name === undefined ? { kind: 'getByRole', role } : { kind: 'getByRole', role, name };
        break;
      }
      case 'getByText':
        s = { kind: 'getByText', text: this.strOrRegex('getByText') };
        break;
      case 'getByTestId':
        s = { kind: 'getByTestId', testId: this.str('getByTestId') };
        break;
      case 'getByLabel':
        s = { kind: 'getByLabel', text: this.str('getByLabel') };
        break;
      case 'locator':
        s = { kind: 'locator', selector: this.str('locator') };
        break;
    }
    if (this.isPunct(',')) this.next();
    this.punct(')');
    return s!;
  }
}

type ArgKind = 'string' | 'number' | 'regex';
const TEXT: ArgKind[] = ['string', 'regex'];
/** Matcher başına argüman şablonu: her konum için izinli türler; `min` zorunlu argüman sayısı. */
const MATCHER_ARGS: Record<AssertionMatcher, { min: number; slots: ArgKind[][]; pageOnly?: boolean }> = {
  toHaveText: { min: 1, slots: [TEXT] },
  toContainText: { min: 1, slots: [TEXT] },
  toHaveValue: { min: 1, slots: [TEXT] },
  toBeVisible: { min: 0, slots: [] },
  toBeHidden: { min: 0, slots: [] },
  toBeEnabled: { min: 0, slots: [] },
  toBeDisabled: { min: 0, slots: [] },
  toBeChecked: { min: 0, slots: [] },
  toHaveAttribute: { min: 1, slots: [['string'], TEXT] },
  toHaveClass: { min: 1, slots: [TEXT] },
  toHaveCount: { min: 1, slots: [['number']] },
  toHaveCSS: { min: 2, slots: [['string'], TEXT] },
  toHaveURL: { min: 1, slots: [TEXT], pageOnly: true },
  toHaveTitle: { min: 1, slots: [TEXT], pageOnly: true },
};

const KIND_TR: Record<ArgKind, string> = { string: 'metin', number: 'sayı', regex: 'regex' };

/** Anlamsal denetim: argüman sayısı/türü, özne uyumu, `target` kullanılabilirliği (FR-REPRO-02). */
function validate(a: Assertion, idx: number, hasTarget: boolean): void {
  const where = `${idx + 1}. beklenti (${a.matcher})`;
  const spec = MATCHER_ARGS[a.matcher];
  if (a.subject.kind === 'target' && !hasTarget) {
    throw new AssertionParseError(`${where}: bu olay sayfa düzeyinde (target = null); \`target\` kullanılamaz. page.getByRole(...) gibi bir \`page\` konumlayıcısı kullan.`);
  }
  if (spec.pageOnly && a.subject.kind !== 'page') {
    throw new AssertionParseError(`${where}: bu matcher yalnızca \`expect(page)\` ile kullanılır.`);
  }
  if (!spec.pageOnly && a.subject.kind === 'page') {
    throw new AssertionParseError(`${where}: \`expect(page)\` yalnızca toHaveURL ve toHaveTitle ile kullanılır; bir konumlayıcı ver (ör. page.getByRole(...)).`);
  }
  if (a.args.length < spec.min || a.args.length > spec.slots.length) {
    const range = spec.min === spec.slots.length ? `${spec.min}` : `${spec.min}–${spec.slots.length}`;
    throw new AssertionParseError(`${where}: ${range} argüman bekleniyordu, ${a.args.length} verildi.`);
  }
  a.args.forEach((arg, i) => {
    if (!spec.slots[i].includes(arg.type)) {
      throw new AssertionParseError(`${where}: ${i + 1}. argüman ${spec.slots[i].map((k) => KIND_TR[k]).join(' ya da ')} olmalı, ${KIND_TR[arg.type]} verildi.`);
    }
    if (arg.type === 'number' && (!Number.isInteger(arg.value) || arg.value < 0) && a.matcher === 'toHaveCount') {
      throw new AssertionParseError(`${where}: toHaveCount negatif olmayan bir tam sayı ister.`);
    }
    if (arg.type === 'number' && !Number.isFinite(arg.value)) throw new AssertionParseError(`${where}: sayı sonlu olmalı.`);
    if (arg.type === 'regex') checkRegex(arg.source, arg.flags ?? '', where);
  });
  const s = a.subject;
  if (s.kind === 'getByRole' && typeof s.name === 'object') checkRegex(s.name.regex, s.name.flags ?? '', where);
  if (s.kind === 'getByText' && typeof s.text === 'object') checkRegex(s.text.regex, s.text.flags ?? '', where);
}

function checkRegex(source: string, flags: string, where: string) {
  if (!/^[dgimsuyv]*$/.test(flags)) throw new AssertionParseError(`${where}: geçersiz regex bayrağı "${flags}".`);
  try {
    new RegExp(source, flags);
  } catch (e) {
    throw new AssertionParseError(`${where}: geçersiz regex: ${(e as Error).message}`);
  }
}

export interface ParsedAssertions {
  ir: AssertionIR;
  /** IR'den üretilmiş kanonik Playwright metni (çalıştırılan kodun aynısı). */
  text: string;
}

/**
 * Metin ya da JSON IR → doğrulanmış IR. Hata durumunda `assertion_rejected` kodlu `AssertionParseError`.
 * @param hasTarget olayın hedef öğesi var mı (yoksa `target` yasaktır)
 */
export function parseAssertions(input: unknown, opts: { hasTarget: boolean }): ParsedAssertions {
  let candidate: unknown;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) throw new AssertionParseError('Boş assertion.');
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        candidate = JSON.parse(trimmed);
      } catch {
        throw new AssertionParseError('Metin "[" ya da "{" ile başlıyor ama geçerli JSON IR değil.');
      }
    } else {
      if (trimmed.length > 10_000) throw new AssertionParseError('Assertion metni çok uzun (en fazla 10.000 karakter).');
      const items = new Parser(tokenize(trimmed)).program();
      if (items.length > 10) throw new AssertionParseError('En fazla 10 beklenti yazılabilir.');
      const ir = items.map((x) => x.a);
      ir.forEach((a, i) => validate(a, i, opts.hasTarget));
      return { ir, text: renderAssertions(ir) };
    }
  } else candidate = input;

  const arr = Array.isArray(candidate) ? candidate : [candidate];
  const parsed = AssertionIRSchema.safeParse(arr);
  if (!parsed.success) throw new AssertionParseError(`IR şemaya uymuyor:\n${z.prettifyError(parsed.error)}`);
  parsed.data.forEach((a, i) => validate(a, i, opts.hasTarget));
  return { ir: parsed.data, text: renderAssertions(parsed.data) };
}
