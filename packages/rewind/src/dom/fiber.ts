/**
 * React fiber okuma (FR-MARK-03, FR-MARK-04, FR-MARK-05).
 * React 18.3+ ve 19.x geliştirme derlemelerinin iç alanlarını yalnızca OKUR; hiçbir şeyi değiştirmez.
 */
import { safeSerialize } from '../serialize.js';
import { isDependencyPath, elementFrames, type StackFrame } from '../source/stack.js';

export interface Fiber {
  tag: number;
  type: unknown;
  elementType?: unknown;
  return: Fiber | null;
  alternate?: Fiber | null;
  child?: Fiber | null;
  sibling?: Fiber | null;
  memoizedProps?: unknown;
  memoizedState?: unknown;
  stateNode?: unknown;
  _debugStack?: { stack?: string } | null;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
  /** Öğeyi oluşturan bileşenin fiber'ı; RSC'de sunucu bileşeni bilgisi (fiber değil); modül düzeyinde null. */
  _debugOwner?: unknown;
}

// React iş etiketleri (ReactWorkTags).
const FunctionComponent = 0;
const ClassComponent = 1;
const ForwardRef = 11;
const MemoComponent = 14;
const SimpleMemoComponent = 15;
const HostRoot = 3;

/**
 * DOM düğümündeki güncel fiber. Düğümdeki fiber, öğe oluşturulduğundaki kopyadır: React güncellemelerde yalnızca
 * props anahtarını yeniler, çift tamponlama yüzünden bu kopya eski (alternate) olabilir. Eski kopya eski props/state
 * ve HMR öncesi `_debugStack` / `_debugSource` taşır.
 */
export function getFiber(node: Node | null): Fiber | null {
  if (!node) return null;
  for (const key of Object.keys(node)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      const fiber = (node as unknown as Record<string, Fiber>)[key];
      return fiber ? currentFiber(fiber) : null;
    }
  }
  return null;
}

/**
 * İki kopyadan (fiber / alternate) hangisinin güncel ağaçta olduğunu bulur: React'in
 * `findCurrentFiberUsingSlowPath` algoritması (ReactFiberTreeReflection). Köke kadar iki dal birlikte yürünür;
 * kökün `current`'ı hangi dalı gösteriyorsa o dal güncel. Belirlenemezse verilen fiber döner.
 */
export function currentFiber(fiber: Fiber): Fiber {
  const alternate = fiber.alternate;
  if (!alternate) return fiber;
  let a: Fiber = fiber;
  let b: Fiber = alternate;
  for (;;) {
    const parentA = a.return;
    if (!parentA) break;
    const parentB = parentA.alternate;
    if (!parentB) {
      // Gizli Suspense sınırındaki ek fragment: bir üst ebeveynden devam.
      if (!parentA.return) break;
      a = b = parentA.return;
      continue;
    }
    // İki ebeveyn aynı çocuğu gösteriyorsa (düşük öncelikte bailout) çocuk kümesi güncel.
    if (parentA.child === parentB.child) {
      for (let c = parentA.child; c; c = c.sibling) {
        if (c === a) return fiber;
        if (c === b) return alternate;
      }
      return fiber;
    }
    if (a.return !== b.return) {
      a = parentA;
      b = parentB;
    } else {
      // İki dal aynı ebeveyni gösteriyor: hangi kopyanın hangi ebeveynin çocuk kümesinde olduğuna bak.
      let found = false;
      for (let c = parentA.child; c && !found; c = c.sibling) {
        if (c === a) [found, a, b] = [true, parentA, parentB];
        else if (c === b) [found, b, a] = [true, parentA, parentB];
      }
      for (let c = parentB.child; c && !found; c = c.sibling) {
        if (c === a) [found, a, b] = [true, parentB, parentA];
        else if (c === b) [found, b, a] = [true, parentB, parentA];
      }
      if (!found) return fiber;
    }
  }
  if (a.tag !== HostRoot) return fiber;
  return (a.stateNode as { current?: Fiber } | null)?.current === a ? fiber : alternate;
}

/** Güncel ebeveyn: bailout'ta yeniden kullanılan çocuğun `return`'ü eski ebeveyn kopyasını gösterebilir. */
function parentOf(f: Fiber): Fiber | null {
  return f.return ? currentFiber(f.return) : null;
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
  for (let f = fiber; f; f = parentOf(f)) {
    const name = componentName(f);
    if (name && out[out.length - 1] !== name) out.push(name);
  }
  return out;
}

export function nearestComponent(fiber: Fiber | null): Fiber | null {
  for (let f = fiber; f; f = parentOf(f)) if (componentName(f)) return f;
  return null;
}

/** `stale`: konum bu oturumdaki bir HMR'den önceki koda ait olabilir; satır doğrulanamaz (EK-B3). */
export type SourceHint =
  | { kind: 'stack'; frame: StackFrame; stale?: string; depth?: number }
  | { kind: 'debugSource'; file: string; line: number; column?: number; stale?: string; depth?: number };

const REACT_LAZY = Symbol.for('react.lazy');
const REACT_MEMO = Symbol.for('react.memo');

const isFiber = (x: unknown): x is Fiber => !!x && typeof (x as Fiber).tag === 'number' && 'return' in (x as object);

interface ElementTypeShape {
  $$typeof?: symbol;
  type?: unknown;
  /** React.lazy: `{ _status: 1, _result: modül }`; RSC istemci referansı (Flight): `{ status: 'fulfilled', value }`. */
  _payload?: { _status?: number; _result?: { default?: unknown }; status?: string; value?: unknown };
}

/** Çözülmüş lazy sarmalayıcının içindeki bileşen; henüz çözülmediyse undefined (yükleme tetiklenmez). */
function unwrapLazy(t: ElementTypeShape): unknown {
  const p = t._payload;
  if (p?._status === 1) return p._result?.default ?? p._result;
  if (p?.status === 'fulfilled') return p.value;
  return undefined;
}

/**
 * Fast Refresh bu bileşenin kodunu mount'tan sonra değiştirdi mi? `type` her render'da en güncel uygulamaya
 * çözülür, `elementType` mount anındaki fonksiyonda kalır (lazy ve memo sarmalayıcıları açılır).
 */
export function isHotSwapped(f: Fiber): boolean {
  let original = f.elementType as ElementTypeShape | undefined;
  if (original?.$$typeof === REACT_LAZY) original = unwrapLazy(original) as ElementTypeShape | undefined;
  if (original?.$$typeof === REACT_MEMO && f.tag === SimpleMemoComponent) original = original.type as ElementTypeShape;
  return !!original && typeof original !== 'string' && f.type !== original;
}

const STALE_STACK = 'HMR: öğeyi oluşturan bileşen bu oturumda yeniden yüklendi; React 19 konumu mount anındaki koddan verir, satır kaymış olabilir (doğru satır için sayfayı yenileyip tekrarlayın)';
const STALE_SOURCE = 'HMR: fiber kopyaları farklı konum gösteriyor; satır kaymış olabilir (doğru satır için sayfayı yenileyip tekrarlayın)';

/**
 * React 19 `_debugStack` yalnızca fiber oluşturulurken yazılır, güncellemede yenilenmez. Oluşturan bileşen
 * (`_debugOwner`; modül düzeyindeki öğede en yakın ata bileşen) Fast Refresh ile değiştiyse konum bayat olabilir.
 */
function stackStale(f: Fiber): string | undefined {
  const owner = f._debugOwner === undefined || f._debugOwner === null ? nearestComponent(parentOf(f)) : f._debugOwner;
  if (!isFiber(owner)) return undefined; // RSC: sunucu bileşeni bilgisi; bayatlığı çözümleyici denetler
  return isHotSwapped(owner) || (owner.alternate ? isHotSwapped(owner.alternate) : false) ? STALE_STACK : undefined;
}

/**
 * React 18 `_debugSource` uzlaştırmada yenilenir ama bailout ile kopyalanan fiber'a aktarılmaz. `f` güncel kopya:
 * props nesnesi diğer kopyadan farklıysa son render'da yeni öğeyle uzlaştırılmıştır (konumu taze). Aynıysa son
 * işlem klonlamadır ve iki kopya farklı konum gösteriyorsa hangisinin taze olduğu bilinemez.
 */
function sourceStale(f: Fiber): string | undefined {
  const a = f._debugSource;
  const b = f.alternate?._debugSource;
  if (!a || !b || (a.fileName === b.fileName && a.lineNumber === b.lineNumber && a.columnNumber === b.columnNumber)) return undefined;
  return f.memoizedProps === f.alternate?.memoizedProps ? STALE_SOURCE : undefined;
}

/**
 * JSX'in yazıldığı yer için adaylar, öncelik sırasıyla: React 19 `_debugStack` kullanıcı çerçeveleri ya da React 18
 * `_debugSource`. Öğenin kendi fiber'ı bağımlılık kodunda oluşturulduysa kullanıcı kodundaki atalara çıkılır.
 * Bir çerçevenin bağımlılığa ait olduğu bazen ancak source map çözümlemesinden sonra anlaşılır; bu yüzden
 * çağıran (`locateSource`) sıradaki adaya geçebilsin diye tümü sırayla verilir.
 */
export function* sourceHints(fiber: Fiber | null): Generator<SourceHint> {
  // depth > 0: aday öğenin kendisinden değil bir atasından geliyor (panel ve Kanıt güveni bunu ayrıca belirtir).
  let depth = 0;
  for (let f = fiber; f; f = parentOf(f), depth++) {
    const d = depth ? { depth } : {};
    if (f._debugSource?.fileName && !isDependencyPath(f._debugSource.fileName)) {
      const stale = sourceStale(f);
      yield { kind: 'debugSource', file: f._debugSource.fileName, line: f._debugSource.lineNumber, column: f._debugSource.columnNumber, ...(stale ? { stale } : {}), ...d };
    }
    const frames = elementFrames(f._debugStack?.stack);
    const stale = frames.length ? stackStale(f) : undefined;
    for (const frame of frames) yield { kind: 'stack', frame, ...(stale ? { stale } : {}), ...d };
  }
}

/** İlk aday (panelde ve testlerde kısa yol). */
export function sourceHint(fiber: Fiber | null): SourceHint | null {
  for (const hint of sourceHints(fiber)) return hint;
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
