/**
 * Tarayıcıdan olay girdilerini toplar: seçilen öğenin canlı karşılığı (FR-MARK-01/10), fiber bilgisi
 * (FR-MARK-03/05), kaynak konumu (FR-MARK-04/11/12) ve başlangıç bağlamı (FR-PKG-07).
 */
import { record } from 'rrweb';
import { componentStack, getFiber, nearestComponent, propsAndState } from '../dom/fiber.js';
import { buildSelectors } from '../dom/selector.js';
import type { ConsoleRecord } from '../recorder/console.js';
import { SOURCE_ATTR } from '../source/attr.js';
import { locateFromAttribute, locateSource } from '../source/locate.js';
import type { SourceResolver } from '../source/sourcemap.js';
import { isDependencyPath, parseStack, userFrames } from '../source/stack.js';
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
 * boş kural stili) ve derleme eklentisinin `data-flashback-source` öznitelikleri (konum hedefte ayrıca gider; kök
 * dışı dosyalarda mutlak yol taşır) çıkarılır. Sonradan zaman çizelgesinde gezinmek kopyayı değiştirmez.
 */
export function cloneReplayDom(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  for (const node of [clone, ...Array.from(clone.querySelectorAll(`[${SOURCE_ATTR}]`))]) node.removeAttribute(SOURCE_ATTR);
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

export type Framework = 'react' | 'vue' | 'svelte' | 'unknown';

function hasKey(node: object, prefixes: string[]): boolean {
  for (const key of Object.keys(node)) if (prefixes.some((p) => key.startsWith(p))) return true;
  return false;
}

/** Öğeyi render eden çerçeve: React fiber'ı, Vue 3 (`__vnode`/`__vueParentComponent`), Svelte (`__svelte_meta`). */
export function detectFramework(el: Element | null): Framework | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (getFiber(n)) return 'react';
    if (hasKey(n, ['__vnode', '__vueParentComponent', '__vue_app__'])) return 'vue';
    if (hasKey(n, ['__svelte_meta'])) return 'svelte';
  }
  return null;
}

/**
 * Sayfanın çerçevesi (hedefsiz olaylar için). Flashback'in kendi React kökü gölge DOM'dadır ve sayfa ağacında fiber'lı
 * öğe bırakmaz; bu yüzden React dışı bir uygulamaya eklenmiş `<Flashback/>` sayfayı "react" yapmaz.
 */
export function detectPageFramework(doc: Document = document): Framework {
  const all = doc.body ? doc.body.getElementsByTagName('*') : [];
  let vue = !!doc.querySelector('[data-v-app]');
  for (let i = 0; i < all.length && i < 3000; i++) {
    const el = all[i];
    if (getFiber(el)) return 'react';
    if (!vue && hasKey(el, ['__vnode', '__vue_app__'])) vue = true;
  }
  return vue ? 'vue' : 'unknown';
}

export async function captureTarget(replayNode: Element, replayMirror: ReplayMirror, resolver: SourceResolver): Promise<TargetCapture> {
  const live = liveNodeFor(replayNode, replayMirror);
  let fiberNode: Element | null = live;
  let resolution: TargetCapture['resolution'] = 'exact';
  if (!live) {
    for (let p = replayNode.parentElement; p && !fiberNode; p = p.parentElement) fiberNode = liveNodeFor(p, replayMirror);
    resolution = fiberNode ? 'ancestor' : 'unresolved';
  }
  const selectors = live ? buildSelectors(live, live.ownerDocument) : buildSelectors(replayNode, replayNode.ownerDocument);
  const fiber = fiberNode ? getFiber(fiberNode) : null;
  const component = nearestComponent(fiber);
  const { props, state } = propsAndState(component);
  const framework = fiber ? 'react' : (detectFramework(fiberNode) ?? (fiberNode ? detectPageFramework(fiberNode.ownerDocument) : undefined));
  // Derleme eklentisinin özniteliği (R13) önce: canlı öğede güncel koddan, canlı karşılığı yoksa kayıttan.
  const attrNode = live?.hasAttribute(SOURCE_ATTR) ? live : replayNode.hasAttribute(SOURCE_ATTR) ? replayNode : null;
  const location =
    (attrNode ? await locateFromAttribute(attrNode, resolver, attrNode === live) : undefined) ??
    (fiberNode ? await locateSource(fiberNode, resolver) : undefined);
  const fromRecording = !live && location?.fromAttribute ? '; kaynak satırı öğenin kayıttaki data-flashback-source özniteliğinden' : '';
  const resolutionReason = live
    ? undefined
    : fiberNode
      ? `öğe canlı sayfada yok (unmount ya da sayfa geçişi); bileşen${fromRecording ? '' : ' ve kaynak'} en yakın canlı atadan${fromRecording}`
      : `öğenin ve atalarının canlı karşılığı yok; yalnızca anlık görüntü${fromRecording}`;
  const notes = [resolutionReason];
  if (location?.fromAncestor) {
    notes.push("öğenin kendi JSX konumu yok (bağımlılık kodunda ya da React'in sahip yığını sınırı aşılınca oluşturulmuş); kaynak satırı en yakın atanın JSX'i");
  }
  if (location?.serverComponent) {
    notes.push('React Server Component öğesi (sunucuda oluşturuldu); bileşen yığını yalnızca istemci bileşenlerini içerir');
  }
  // FR-MARK-06: React dışı öğe — bileşen yığını boş, kaynak satırı yok; diğer veriler eksiksiz.
  if (fiberNode && !fiber) {
    notes.push(
      framework === 'react'
        ? "öğenin React fiber'ı yok (React dışında, ör. bir DOM kütüphanesiyle oluşturulmuş); bileşen yığını ve kaynak satırı çıkarılmaz"
        : `React fiber yok: öğe React dışı bir çerçeveden (${framework ?? 'unknown'}); bileşen yığını ve kaynak satırı çıkarılmaz`,
    );
  }
  const reason = notes.filter(Boolean).join('; ');
  return {
    ...selectors,
    resolution,
    ...(reason ? { resolutionReason: reason } : {}),
    ...(framework ? { framework } : {}),
    location,
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
      if (!loc.resolved) return c;
      // Karma adlı paket parçaları (Turbopack) ya da konsolu saran çerçeve kodu bağımlılığa çözülebilir; yığındaki
      // sonraki kullanıcı çerçevesi denenir. Hiçbiri kullanıcı koduna çözülmezse ilk çözüm kalır.
      let best = loc;
      if (isDependencyPath(loc.file)) {
        for (const next of userFrames(c.stack).filter((f) => f.url !== frame.url || f.line !== frame.line).slice(0, 8)) {
          const l = await resolver.resolve(next);
          if (!l.resolved) break;
          if (!isDependencyPath(l.file)) {
            best = l;
            break;
          }
        }
      }
      return { ...c, source: `${best.file}:${best.line}:${best.column}` };
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
        if (k && !k.startsWith('flashback:')) out.push(`${label}:${k}`);
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
    framework: detectPageFramework(),
  };
}

/** Sekme kimliği; sessionStorage sekmeye özeldir (FR-REC-14). */
export function getTabId(): string {
  const key = 'flashback:tabId';
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
