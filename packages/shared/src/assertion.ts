import type { Assertion, AssertionArg, AssertionIR, AssertionSubject } from './schema.js';

/**
 * Assertion IR → Playwright kodu (FR-REPRO-SEC-01, FR-REPRO-SEC-05).
 *
 * Kod YALNIZCA doğrulanmış IR'den üretilir. Her sabit `JSON.stringify` ile serileştirilir;
 * hiçbir kullanıcı/olay verisi kod metnine ham olarak girmez.
 */

const FLAGS_RE = /^[dgimsuyv]*$/;

function lit(v: string): string {
  // U+2028/2029 JSON'da geçerli ama eski JS motorlarında satır sonu sayılır; kaçışla.
  return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function regexLit(source: string, flags: string): string {
  if (!FLAGS_RE.test(flags)) throw new Error(`geçersiz regex bayrağı: ${flags}`);
  new RegExp(source, flags); // derlenebilirlik denetimi
  return `new RegExp(${lit(source)}, ${lit(flags)})`;
}

function textOrRegex(v: string | { regex: string; flags?: string }): string {
  return typeof v === 'string' ? lit(v) : regexLit(v.regex, v.flags ?? '');
}

export function renderSubject(s: AssertionSubject): string {
  switch (s.kind) {
    case 'target':
      return 'target';
    case 'page':
      return 'page';
    case 'getByRole':
      return s.name === undefined
        ? `page.getByRole(${lit(s.role)})`
        : `page.getByRole(${lit(s.role)}, { name: ${textOrRegex(s.name)} })`;
    case 'getByText':
      return `page.getByText(${textOrRegex(s.text)})`;
    case 'getByTestId':
      return `page.getByTestId(${lit(s.testId)})`;
    case 'getByLabel':
      return `page.getByLabel(${lit(s.text)})`;
    case 'locator':
      return `page.locator(${lit(s.selector)})`;
  }
}

export function renderArg(a: AssertionArg): string {
  switch (a.type) {
    case 'string':
      return lit(a.value);
    case 'number':
      if (!Number.isFinite(a.value)) throw new Error('sayı sonlu olmalı');
      return String(a.value);
    case 'regex':
      return regexLit(a.source, a.flags ?? '');
  }
}

export function renderAssertion(a: Assertion): string {
  const args = a.args.map(renderArg).join(', ');
  return `await expect(${renderSubject(a.subject)})${a.not ? '.not' : ''}.${a.matcher}(${args});`;
}

export function renderAssertions(ir: AssertionIR): string {
  return ir.map(renderAssertion).join('\n');
}
