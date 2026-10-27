import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { diffState, StoreRegistry } from '../src/recorder/store.js';

describe('trackStore (FR-REC-09)', () => {
  it('records path-level before/after for a Zustand store', () => {
    const useCart = create<{ items: number[]; discount: number; meta: { code: string | null }; add: (n: number) => void }>((set) => ({
      items: [],
      discount: 0,
      meta: { code: null },
      add: (n) => set((s) => ({ items: [...s.items, n] })),
    }));
    const registry = new StoreRegistry();
    registry.attached = true;
    const stop = registry.track('cart', useCart.subscribe, useCart.getState);
    useCart.getState().add(250);
    useCart.setState({ discount: 0.1, meta: { code: 'YAZ10' } });
    const changes = registry.snapshot().map(({ name, path, before, after }) => ({ name, path, before, after }));
    expect(changes).toEqual([
      { name: 'cart', path: 'items', before: [], after: [250] },
      { name: 'cart', path: 'discount', before: 0, after: 0.1 },
      { name: 'cart', path: 'meta.code', before: null, after: 'YAZ10' },
    ]);
    stop();
    useCart.getState().add(1);
    expect(registry.snapshot()).toHaveLength(3);
  });

  it('works with a Redux-style store and stops everything when disabled', () => {
    let state = { count: 0 };
    const listeners = new Set<() => void>();
    const store = {
      getState: () => state,
      subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
      dispatch: () => {
        state = { count: state.count + 1 };
        listeners.forEach((l) => l());
      },
    };
    const registry = new StoreRegistry();
    registry.track('redux', store.subscribe, store.getState);
    store.dispatch();
    expect(registry.snapshot()[0]).toMatchObject({ path: 'count', before: 0, after: 1 });
    registry.disable();
    expect(listeners.size).toBe(0);
    expect(registry.snapshot()).toEqual([]);
    expect(registry.track('late', store.subscribe, store.getState)).toBeTypeOf('function');
    expect(listeners.size).toBe(0);
  });

  it('diffs nested plain objects up to two levels', () => {
    expect(diffState({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toEqual([{ path: 'a.b', before: { c: 1 }, after: { c: 2 } }]);
    expect(diffState(1, 1)).toEqual([]);
  });
});
