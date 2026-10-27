/**
 * Tarayıcıdan olay girdilerini toplar: seçilen öğenin canlı karşılığı (FR-MARK-01/10), fiber bilgisi
 * (FR-MARK-03/05), kaynak konumu (FR-MARK-04/11/12) ve başlangıç bağlamı (FR-PKG-07).
 */
import { record } from 'rrweb';
import { componentStack, getFiber, nearestComponent, propsAndState, sourceHint } from '../dom/fiber.js';
import { buildSelectors } from '../dom/selector.js';
import type { ConsoleRecord } from '../recorder/console.js';
import type { ResolvedLocation, SourceResolver } from '../source/sourcemap.js';
import { parseStack } from '../source/stack.js';
import type { DraftEnv, TargetCapture } from './build.js';

const STYLE_PROPS = [
  'display', 'visibility', 'opacity', 'position', 'z-index', 'width', 'height', 'overflow', 'color', 'background-color',
  'font-size', 'font-weight', 'text-decoration', 'pointer-events', 'cursor',
];
const MAX_CONSOLE_RESOLVE = 30;
/** rrweb Replayer'ın tekrar oynatma DOM'una eklediği sınıflar (uygulamaya ait değil). */
const REPLAYER_CLASSES = new Set([':hover', 'rrweb-paused']);

/**
 * Tekrar oynatma DOM'unun işaretlenen andaki kopyası; Replayer yapıtları (`:hover`/`rrweb-paused` sınıfları,
 * boş kural stili) çıkarılır. Sonradan zaman çizelgesinde gezinmek kopyayı değiştirmez.
 */
export function cloneReplayDom(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  for (const node of [clone, ...Array.from(clone.querySelectorAll('[class]'))]) {
    const cls = node.getAttribute('class');
    if (cls === null) continue;
    const kept = cls.split(/\s+/).filter((c) => c && !REPLAYER_CLASSES.has(c));
    if (kept.length) node.setAttribute('class', kept.join(' '));
    else node.removeAttribute('class');
  }
  for (const child of Array.from(clone.children)) {
    if (child.tagName === 'STYLE' && child.attributes.length === 0 && !child.textContent) child.remove();
  }
  return clone;
}

export interface ReplayMirror {
  getId(n: Node): number;
}

/** Tekrar oynatmadaki düğümü rrweb kimliğiyle canlı sayfadaki düğüme eşler. */
export function liveNodeFor(replayNode: Node, replayMirror: ReplayMirror): Element | null {
  const id = replayMirror.getId(replayNode);
  if (id < 0) return null;
  const live = record.mirror.getNode(id) as Node | null;
  if (!live || !live.isConnected || live.nodeType !== 1 || live.nodeName !== replayNode.nodeName) return null;
  return live as Element;
}

function computedStyle(el: Element): Record<string, string> | undefined {
  const view = el.ownerDocument.defaultView;
  if (!view) return undefined;
  const cs = view.getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) out[p] = v;
  }
  return out;
}

async function locate(fiberNode: Element, resolver: SourceResolver): Promise<ResolvedLocation | undefined> {
  const hint = sourceHint(getFiber(fiberNode));
  if (!hint) return undefined;
  if (hint.kind === 'debugSource') return { file: hint.file, line: hint.line, column: hint.column ?? 1, resolved: true };
  return resolver.resolve(hint.frame);
}

export async function captureTarget(replayNode: Element, replayMirror: ReplayMirror, resolver: SourceResolver): Promise<TargetCapture> {
  const live = liveNodeFor(replayNode, replayMirror);
  let fiberNode: Element | null = live;
  let resolution: TargetCapture['resolution'] = 'exact';
  let resolutionReason: string | undefined;
  if (!live) {
    for (let p = replayNode.parentElement; p && !fiberNode; p = p.parentElement) fiberNode = liveNodeFor(p, replayMirror);
    resolution = fiberNode ? 'ancestor' : 'unresolved';
    resolutionReason = fiberNode
      ? 'öğe canlı sayfada yok (unmount ya da sayfa geçişi); bileşen ve kaynak en yakın canlı atadan'
      : 'öğenin ve atalarının canlı karşılığı yok; yalnızca anlık görüntü';
  }
  const selectors = live ? buildSelectors(live, live.ownerDocument) : buildSelectors(replayNode, replayNode.ownerDocument);
  const fiber = fiberNode ? getFiber(fiberNode) : null;
  const component = nearestComponent(fiber);
  const { props, state } = propsAndState(component);
  return {
    ...selectors,
    resolution,
    ...(resolutionReason ? { resolutionReason } : {}),
    location: fiberNode ? await locate(fiberNode, resolver) : undefined,
    componentStack: componentStack(fiber),
    props,
    state,
    computedStyle: computedStyle(replayNode) ?? (live ? computedStyle(live) : undefined),
    element: cloneReplayDom(replayNode),
  };
}

/** Konsol kayıtlarının derlenmiş konumlarını orijinal dosyaya çözer (çözülemeyen olduğu gibi kalır). */
export async function resolveConsoleSources(entries: ConsoleRecord[], resolver: SourceResolver): Promise<ConsoleRecord[]> {
  return Promise.all(
    entries.map(async (c, i) => {
      if (!c.source || i < entries.length - MAX_CONSOLE_RESOLVE) return c;
      const frame = parseStack(`    at ${c.source}`)[0];
      if (!frame) return c;
      const loc = await resolver.resolve(frame);
      return loc.resolved ? { ...c, source: `${loc.file}:${loc.line}:${loc.column}` } : c;
    }),
  );
}

function storageKeys(): string[] {
  const out: string[] = [];
  for (const [label, get] of [['localStorage', () => localStorage], ['sessionStorage', () => sessionStorage]] as const) {
    try {
      const s = get();
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && !k.startsWith('rewind:')) out.push(`${label}:${k}`);
      }
    } catch {
      /* depolama erişilemez */
    }
  }
  return out;
}

export function cookieNames(cookie = document.cookie): string[] {
  return cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter(Boolean);
}

export function collectEnv(tabId: string): DraftEnv {
  return {
    origin: location.origin,
    userAgent: navigator.userAgent,
    tabId,
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    storageKeys: storageKeys(),
    cookieNames: cookieNames(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

/** Sekme kimliği; sessionStorage sekmeye özeldir (FR-REC-14). */
export function getTabId(): string {
  const key = 'rewind:tabId';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = `tab-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2, 10)}`;
  }
}
