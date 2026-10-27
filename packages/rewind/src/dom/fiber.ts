/**
 * React fiber okuma (FR-MARK-03, FR-MARK-04, FR-MARK-05).
 * React 18.3+ ve 19.x geliştirme derlemelerinin iç alanlarını yalnızca OKUR; hiçbir şeyi değiştirmez.
 */
import { safeSerialize } from '../serialize.js';
import { firstUserFrame, type StackFrame } from '../source/stack.js';

export interface Fiber {
  tag: number;
  type: unknown;
  elementType?: unknown;
  return: Fiber | null;
  memoizedProps?: unknown;
  memoizedState?: unknown;
  stateNode?: unknown;
  _debugStack?: { stack?: string } | null;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
}

// React iş etiketleri (ReactWorkTags).
const FunctionComponent = 0;
const ClassComponent = 1;
const ForwardRef = 11;
const MemoComponent = 14;
const SimpleMemoComponent = 15;

export function getFiber(node: Node | null): Fiber | null {
  if (!node) return null;
  for (const key of Object.keys(node)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      return (node as unknown as Record<string, Fiber>)[key] ?? null;
    }
  }
  return null;
}

function typeName(type: unknown): string | null {
  if (!type) return null;
  if (typeof type === 'function') {
    const t = type as { displayName?: string; name?: string };
    return t.displayName || t.name || null;
  }
  if (typeof type === 'object') {
    const t = type as { displayName?: string; render?: unknown; type?: unknown };
    if (t.displayName) return t.displayName;
    if (t.render) return typeName(t.render);
    if (t.type) return typeName(t.type);
  }
  return null;
}

function isComponentFiber(f: Fiber): boolean {
  return [FunctionComponent, ClassComponent, ForwardRef, MemoComponent, SimpleMemoComponent].includes(f.tag);
}

export function componentName(f: Fiber): string | null {
  return isComponentFiber(f) ? typeName(f.type) ?? typeName(f.elementType) : null;
}

/** En yakından köke bileşen yığını. Portallar fiber hiyerarşisinde doğru üst bileşene bağlıdır. */
export function componentStack(fiber: Fiber | null): string[] {
  const out: string[] = [];
  for (let f = fiber; f; f = f.return) {
    const name = componentName(f);
    if (name && out[out.length - 1] !== name) out.push(name);
  }
  return out;
}

export function nearestComponent(fiber: Fiber | null): Fiber | null {
  for (let f = fiber; f; f = f.return) if (componentName(f)) return f;
  return null;
}

export type SourceHint =
  | { kind: 'stack'; frame: StackFrame }
  | { kind: 'debugSource'; file: string; line: number; column?: number };

/**
 * JSX'in yazıldığı yer: React 19 `_debugStack` (ilk kullanıcı çerçevesi) ya da React 18 `_debugSource`.
 * Öğenin kendi fiber'ı bağımlılık kodunda oluşturulduysa, kullanıcı kodundaki ilk ataya çıkılır.
 */
export function sourceHint(fiber: Fiber | null): SourceHint | null {
  for (let f = fiber; f; f = f.return) {
    if (f._debugSource?.fileName && !/\/node_modules\//.test(f._debugSource.fileName)) {
      return { kind: 'debugSource', file: f._debugSource.fileName, line: f._debugSource.lineNumber, column: f._debugSource.columnNumber };
    }
    const stack = f._debugStack?.stack;
    const frame = stack ? firstUserFrame(stack) : null;
    if (frame) return { kind: 'stack', frame };
  }
  return null;
}

interface HookNode {
  memoizedState: unknown;
  queue: unknown;
  next: HookNode | null;
}

/** Bileşenin props ve state'i (fonksiyon bileşeninde useState/useReducer değerleri). */
export function propsAndState(component: Fiber | null): { props?: unknown; state?: unknown } {
  if (!component) return {};
  const props = component.memoizedProps && typeof component.memoizedProps === 'object' ? withoutChildren(component.memoizedProps) : component.memoizedProps;
  let state: unknown;
  if (component.tag === ClassComponent) state = component.memoizedState;
  else {
    const hooks: unknown[] = [];
    for (let h = component.memoizedState as HookNode | null; h && typeof h === 'object' && 'next' in h; h = h.next) {
      if (h.queue) hooks.push(h.memoizedState);
    }
    if (hooks.length) state = hooks;
  }
  return { props: safeSerialize(props), state: state === undefined ? undefined : safeSerialize(state) };
}

function withoutChildren(p: object): Record<string, unknown> {
  const { children, ...rest } = p as Record<string, unknown>;
  return children === undefined ? rest : { ...rest, children: typeof children === 'string' ? children : '<children>' };
}
