import { describe, expect, it } from 'vitest';
import { componentStack, getFiber, nearestComponent, propsAndState, sourceHint, type Fiber } from '../src/dom/fiber.js';

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
