import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { formatConsoleArgs, safeSerialize } from '../src/serialize.js';

describe('safeSerialize (FR-MARK-05)', () => {
  it('converts functions, React elements, dates, maps, sets, errors and bigints', () => {
    function onAdd() {}
    const out = safeSerialize({
      onAdd,
      anon: () => 1,
      el: createElement('div'),
      when: new Date(Date.UTC(2026, 0, 1)),
      map: new Map([['a', 1]]),
      set: new Set([1, 2]),
      err: new Error('boom'),
      big: 10n,
      undef: undefined,
      nan: Number.NaN,
    });
    expect(out).toEqual({
      onAdd: '[Function onAdd]',
      anon: '[Function anon]',
      el: '<Element>',
      when: '2026-01-01T00:00:00.000Z',
      map: { a: 1 },
      set: [1, 2],
      err: { name: 'Error', message: 'boom' },
      big: '10n',
      undef: '[undefined]',
      nan: 'NaN',
    });
  });

  it('is circular-safe and applies depth, key, item and string limits', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    const shared = { x: 1 };
    expect(safeSerialize({ a, s1: shared, s2: shared })).toEqual({ a: { name: 'a', self: '[Circular]' }, s1: { x: 1 }, s2: { x: 1 } });
    const deep = { l1: { l2: { l3: { l4: 1 } } } };
    expect(safeSerialize(deep, { depth: 2, keys: 50, items: 50, string: 100 })).toEqual({ l1: { l2: '[Object]' } });
    const arr = safeSerialize(Array.from({ length: 60 }, (_, i) => i)) as unknown[];
    expect(arr).toHaveLength(51);
    expect(arr[50]).toBe('…[+10]');
    expect(safeSerialize('x'.repeat(2100))).toMatch(/…\[\+100\]$/);
    const many = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(safeSerialize(many) as object)).toHaveLength(51);
  });

  it('formats console arguments', () => {
    expect(formatConsoleArgs(['Kupon isteği başarısız:', new Error('HTTP 500'), { a: 1 }])).toBe('Kupon isteği başarısız: Error: HTTP 500 {"a":1}');
  });
});
