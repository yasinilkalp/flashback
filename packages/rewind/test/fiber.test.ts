import { describe, expect, it } from 'vitest';
import { componentStack, getFiber, isHotSwapped, nearestComponent, propsAndState, sourceHint, type Fiber } from '../src/dom/fiber.js';
import { locateSource } from '../src/source/locate.js';
import type { ResolvedLocation, SourceResolver } from '../src/source/sourcemap.js';
import type { StackFrame } from '../src/source/stack.js';

const fiber = (over: Partial<Fiber>, parent: Fiber | null = null): Fiber => ({ tag: 5, type: 'div', return: parent, ...over });

function Cart() {}
function App() {}
const Memo = { $$typeof: Symbol.for('react.memo'), type: function Price() {} };
const Forward = { $$typeof: Symbol.for('react.forward_ref'), render: function Input() {} };

describe('fiber reading (FR-MARK-03/04/05)', () => {
  const root = fiber({ tag: 3, type: null });
  const app = fiber({ tag: 0, type: App }, root);
  const portal = fiber({ tag: 4, type: null }, app);
  const cart = fiber({ tag: 0, type: Cart, memoizedProps: { currency: 'TRY', children: 'x' } }, portal);
  const memo = fiber({ tag: 14, type: Memo }, cart);
  const fwd = fiber({ tag: 11, type: Forward }, memo);
  const host = fiber({ tag: 5, type: 'dd' }, fwd);

  it('builds the component stack nearest → root through portals, memo and forwardRef', () => {
    expect(componentStack(host)).toEqual(['Input', 'Price', 'Cart', 'App']);
    expect(nearestComponent(host)).toBe(fwd);
  });

  it('finds the fiber on a DOM node', () => {
    const node = {} as Record<string, unknown>;
    node['__reactFiber$abc123'] = host;
    expect(getFiber(node as unknown as Node)).toBe(host);
    expect(getFiber({} as Node)).toBeNull();
  });

  it('reads JSX source from React 19 _debugStack and React 18 _debugSource', () => {
    const r19 = fiber({
      _debugStack: { stack: 'Error: react-stack-top-frame\n    at jsxDEV (http://x/node_modules/.vite/deps/react_jsx-dev-runtime.js:1:1)\n    at Cart (http://x/src/Cart.tsx:108:21)' },
    });
    expect(sourceHint(r19)).toEqual({ kind: 'stack', frame: { fn: 'Cart', url: 'http://x/src/Cart.tsx', line: 108, column: 21 } });
    const r18 = fiber({ _debugSource: { fileName: '/app/src/Cart.tsx', lineNumber: 40, columnNumber: 7 } });
    expect(sourceHint(r18)).toEqual({ kind: 'debugSource', file: '/app/src/Cart.tsx', line: 40, column: 7 });
    // Kütüphane içinde oluşturulan öğe → kullanıcı kodundaki ataya çıkılır.
    const lib = fiber({ _debugStack: { stack: 'Error\n    at Lib (http://x/node_modules/lib/index.js:1:1)' } }, r19);
    expect(sourceHint(lib)).toMatchObject({ kind: 'stack', frame: { url: 'http://x/src/Cart.tsx' } });
    expect(sourceHint(fiber({}))).toBeNull();
  });

  it('reads props (without children elements) and useState/useReducer hook state', () => {
    const hooks = { memoizedState: 3, queue: {}, next: { memoizedState: { current: 1 }, queue: null, next: { memoizedState: 'YAZ10', queue: {}, next: null } } };
    const comp = fiber({ tag: 0, type: Cart, memoizedProps: { currency: 'TRY', onPay: function onPay() {} }, memoizedState: hooks });
    expect(propsAndState(comp)).toEqual({ props: { currency: 'TRY', onPay: '[Function onPay]' }, state: [3, 'YAZ10'] });
    expect(propsAndState(cart).props).toEqual({ currency: 'TRY', children: 'x' });
    expect(propsAndState(null)).toEqual({});
  });
});

/** Kök → bileşen → host, her biri iki kopyalı (çift tampon). `current`: kökün güncel kopyası hangisi. */
function doubleBuffered(current: 'a' | 'b') {
  const root = { current: null as Fiber | null };
  const rA = fiber({ tag: 3, type: null, stateNode: root });
  const rB = fiber({ tag: 3, type: null, stateNode: root, alternate: rA });
  rA.alternate = rB;
  const cA = fiber({ tag: 0, type: Cart, memoizedProps: { v: 'A' } }, rA);
  const cB = fiber({ tag: 0, type: Cart, memoizedProps: { v: 'B' }, alternate: cA }, rB);
  cA.alternate = cB;
  const hA = fiber({ tag: 5, type: 'b', memoizedProps: { id: 'A' } }, cA);
  const hB = fiber({ tag: 5, type: 'b', memoizedProps: { id: 'B' }, alternate: hA }, cB);
  hA.alternate = hB;
  rA.child = cA;
  rB.child = cB;
  cA.child = hA;
  cB.child = hB;
  root.current = current === 'a' ? rA : rB;
  return { hA, hB, cA, cB };
}

const nodeWith = (f: Fiber) => ({ ['__reactFiber$x']: f }) as unknown as Element;

describe('current fiber (double buffering)', () => {
  it('returns the copy in the committed tree even when the DOM node points at the stale one', () => {
    const t = doubleBuffered('b');
    expect(getFiber(nodeWith(t.hA))).toBe(t.hB);
    expect(getFiber(nodeWith(t.hB))).toBe(t.hB);
    expect(getFiber(nodeWith(doubleBuffered('a').hB))?.memoizedProps).toEqual({ id: 'A' });
  });

  it('walks to the current parent when a reused child still points at the old parent copy', () => {
    const t = doubleBuffered('b');
    t.hB.return = t.cA; // bailout: çocuk yeniden kullanıldı, return eski ebeveyni gösteriyor
    expect(nearestComponent(t.hB)).toBe(t.cB);
    expect(propsAndState(nearestComponent(t.hB)).props).toEqual({ v: 'B' });
  });
});

function Old() {}
function New() {}

describe('HMR staleness (EK-B3)', () => {
  it('detects Fast Refresh swaps through lazy (React.lazy and RSC client references) and memo wrappers', () => {
    expect(isHotSwapped(fiber({ tag: 0, type: New, elementType: Old }))).toBe(true);
    expect(isHotSwapped(fiber({ tag: 0, type: Old, elementType: Old }))).toBe(false);
    const lazy = (payload: object) => ({ $$typeof: Symbol.for('react.lazy'), _payload: payload });
    expect(isHotSwapped(fiber({ tag: 0, type: New, elementType: lazy({ _status: 1, _result: { default: Old } }) }))).toBe(true);
    expect(isHotSwapped(fiber({ tag: 0, type: Old, elementType: lazy({ _status: 1, _result: { default: Old } }) }))).toBe(false);
    expect(isHotSwapped(fiber({ tag: 0, type: New, elementType: lazy({ _status: 0, _result: () => {} }) }))).toBe(false);
    expect(isHotSwapped(fiber({ tag: 0, type: New, elementType: lazy({ status: 'fulfilled', value: Old }) }))).toBe(true);
    const memo = { $$typeof: Symbol.for('react.memo'), type: Old };
    expect(isHotSwapped(fiber({ tag: 15, type: New, elementType: memo }))).toBe(true);
    expect(isHotSwapped(fiber({ tag: 15, type: Old, elementType: memo }))).toBe(false);
  });

  const stack = 'Error: react-stack-top-frame\n    at jsxDEV (http://x/node_modules/.vite/deps/react_jsx-dev-runtime.js:1:1)\n    at Cart (http://x/src/Cart.tsx?t=1:108:21)';

  it('marks React 19 stacks stale when the owner (or, for module-level elements, the nearest component) was hot-swapped', () => {
    const swapped = fiber({ tag: 0, type: New, elementType: Old });
    expect(sourceHint(fiber({ _debugStack: { stack }, _debugOwner: swapped }))?.stale).toMatch(/^HMR/);
    expect(sourceHint(fiber({ _debugStack: { stack }, _debugOwner: fiber({ tag: 0, type: Old, elementType: Old }) }))?.stale).toBeUndefined();
    expect(sourceHint(fiber({ _debugStack: { stack }, _debugOwner: null }, swapped))?.stale).toMatch(/^HMR/);
    // RSC: sahip bir fiber değil, sunucu bileşeni bilgisi → bayatlığı çözümleyici denetler.
    expect(sourceHint(fiber({ _debugStack: { stack }, _debugOwner: { name: 'ServerPart', env: 'Server' } }))?.stale).toBeUndefined();
  });

  it('marks React 18 _debugSource stale only when the copies disagree and the current one was cloned (same props)', () => {
    const props = { id: 'x' };
    const at = (lineNumber: number) => ({ fileName: '/app/src/Cart.tsx', lineNumber, columnNumber: 7 });
    const cloned = fiber({ _debugSource: at(40), memoizedProps: props });
    cloned.alternate = fiber({ _debugSource: at(43), memoizedProps: props });
    expect(sourceHint(cloned)).toMatchObject({ kind: 'debugSource', line: 40, stale: expect.stringMatching(/^HMR/) });
    const reconciled = fiber({ _debugSource: at(43), memoizedProps: { id: 'x' } });
    reconciled.alternate = fiber({ _debugSource: at(40), memoizedProps: props });
    expect(sourceHint(reconciled)?.stale).toBeUndefined();
  });
});

describe('locateSource', () => {
  const resolverOf = (fn: (f: StackFrame) => ResolvedLocation) => ({ resolve: async (f: StackFrame) => fn(f) }) as unknown as SourceResolver;

  it('skips candidates that the source map resolves into node_modules (shared Turbopack chunks)', async () => {
    const parent = fiber({ tag: 0, type: Cart, _debugStack: { stack: 'Error\n    at App (http://x/_next/static/chunks/app._.js:9:9)' } });
    const host = fiber({ _debugStack: { stack: 'Error\n    at LibBox (http://x/_next/static/chunks/app._.js:1:1)' } }, parent);
    const loc = await locateSource(
      nodeWith(host),
      resolverOf((f) => (f.line === 1 ? { file: '/app/node_modules/lib/index.js', line: 3, column: 1, resolved: true } : { file: 'src/App.tsx', line: 26, column: 7, resolved: true })),
    );
    expect(loc).toEqual({ file: 'src/App.tsx', line: 26, column: 7, resolved: true });
  });

  it('returns stale candidates as resolved:false with the file but without a snippet', async () => {
    const host = fiber({ _debugStack: { stack: 'Error\n    at Cart (http://x/src/Cart.tsx:3:5)' }, _debugOwner: fiber({ tag: 0, type: New, elementType: Old }) });
    const loc = await locateSource(
      nodeWith(host),
      resolverOf(() => ({ file: 'src/Cart.tsx', line: 10, column: 5, resolved: true, snippet: { startLine: 7, lines: ['x'], fileHash: 'h' } })),
    );
    expect(loc).toMatchObject({ file: 'src/Cart.tsx', line: 10, resolved: false, reason: expect.stringMatching(/^HMR/) });
    expect(loc?.snippet).toBeUndefined();
  });
});
