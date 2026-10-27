// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSelectors, cssEscape } from '../src/dom/selector.js';

const only = (sel: string) => document.querySelectorAll(sel);

describe('buildSelectors (FR-REC-07, FR-MARK-02)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <dl><dt>Toplam</dt><dd data-testid="total">135030 ₺</dd><dd>x</dd></dl>
        <form><input id="coupon" name="coupon"><button type="submit">Uygula</button></form>
        <ul><li><button aria-label="Sil">x</button></li><li><button>Ekle</button></li><li><button>Ekle</button></li></ul>
        <input name="q"><span id=":r1:">react id</span>
        <section data-testid="dup"></section><section data-testid="dup"><p>a</p><p>b</p></section>
      </main>`;
  });

  it('prefers data-testid, then #id, aria-label, name', () => {
    expect(buildSelectors(document.querySelector('[data-testid="total"]')!).selector).toBe('[data-testid="total"]');
    expect(buildSelectors(document.querySelector('#coupon')!).selector).toBe('#coupon');
    expect(buildSelectors(document.querySelector('[aria-label="Sil"]')!).selector).toBe('button[aria-label="Sil"]');
    expect(buildSelectors(document.querySelector('[name="q"]')!).selector).toBe('input[name="q"]');
  });

  it('every primary selector is unique and there is at least one fallback', () => {
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const { selector, fallbackSelectors } = buildSelectors(el);
      expect(only(selector), selector).toHaveLength(1);
      expect(only(selector)[0]).toBe(el);
      expect(fallbackSelectors.length, selector).toBeGreaterThanOrEqual(1);
      expect(fallbackSelectors).not.toContain(selector);
      for (const f of fallbackSelectors.filter((s) => !s.startsWith('role='))) expect(only(f)[0], f).toBe(el);
    }
  });

  it('falls back to a structural :nth-of-type path for duplicates and skips unstable React ids', () => {
    const second = document.querySelectorAll('li')[2].querySelector('button')!;
    const { selector, fallbackSelectors } = buildSelectors(second);
    expect(selector).toContain(':nth-of-type(3)');
    expect(fallbackSelectors).toContain('role=button[name="Ekle"]');
    expect(buildSelectors(document.getElementById(':r1:')!).selector).not.toContain(':r1:');
    const p = document.querySelectorAll('[data-testid="dup"]')[1].querySelectorAll('p')[1];
    expect(only(buildSelectors(p).selector)[0]).toBe(p);
  });

  it('escapes identifiers and attribute values', () => {
    expect(cssEscape('a.b')).toBe('a\\.b');
    document.body.innerHTML = '<div data-testid="say &quot;hi&quot;"></div><i id="x.y"></i>';
    expect(only(buildSelectors(document.querySelector('div')!).selector)).toHaveLength(1);
    expect(buildSelectors(document.querySelector('i')!).selector).toBe('#x\\.y');
  });
});
