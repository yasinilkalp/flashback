/**
 * Seçilen öğeden ve tampondan raporu kurar. Her değer burada, rapor tarayıcıdan çıkmadan önce gizlenir.
 */
import { buildSelectors } from '../dom/selector.js';
import { componentName, componentStack, getFiber, nearestComponent, propsAndState } from '../dom/fiber.js';
import type { ConsoleRecord } from '../recorder/console.js';
import type { Snapshot } from '../recorder/capture.js';
import type { NetworkRecord } from '../recorder/network.js';
import { marker, Redactor, type RedactOptions } from '../redact.js';
import { SOURCE_ATTR, parseSourceAttr } from '../source/attr.js';
import { locateFromAttribute, locateSource } from '../source/locate.js';
import type { ResolvedLocation, SourceResolver } from '../source/sourcemap.js';
import { isDependencyPath, parseStack, userFrames } from '../source/stack.js';
import type { FlashbackLocale } from '../types.js';
import { redactElementHtml } from './html.js';
import { REPORT_VERSION, type Report, type ReportTarget } from './types.js';

/** Rapordaki üst sınırlar: rapor ajanın bağlamına girer, kısa kalmalı. */
const MAX_REQUESTS = 15;
const MAX_CONSOLE = 15;
const MAX_STEPS = 25;
const MAX_STORE = 15;
const RES_BODY_CHARS = 600;
const REQ_BODY_CHARS = 300;
const VALUE_CHARS = 600;
const HTML_CHARS = 800;
const MESSAGE_CHARS = 500;

function clip(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const isEmptyObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;

/** Uzun değerler kısaltılmış JSON metnine çevrilir. */
function clipValue(v: unknown): unknown {
  if (v === undefined) return undefined;
  const s = JSON.stringify(v);
  return s !== undefined && s.length > VALUE_CHARS ? `${s.slice(0, VALUE_CHARS - 1)}…` : v;
}

const basename = (file: string) => file.split(/[\\/]/).pop() ?? file;

/** Seçim kipinde öğenin yanında gösterilen kısa etiket; senkron ve ucuz (her fare hareketinde çağrılır). */
export function quickLabel(el: Element): string {
  const attrNode = el.closest(`[${SOURCE_ATTR}]`);
  const attr = attrNode ? parseSourceAttr(attrNode.getAttribute(SOURCE_ATTR)) : null;
  const comp = nearestComponent(getFiber(el));
  const name = comp ? componentName(comp) : null;
  return [attr ? `${basename(attr.file)}:${attr.line}` : null, name ? `<${name}>` : null, el.localName].filter(Boolean).join(' · ');
}

export interface TargetCapture {
  selector: string;
  location?: ResolvedLocation;
  components: string[];
  props?: unknown;
  state?: unknown;
  element: Element;
}

/** Canlı öğenin seçicisi, bileşen yığını, props/state ve JSX konumu. */
export async function captureTarget(el: Element, resolver: SourceResolver): Promise<TargetCapture> {
  const fiber = getFiber(el);
  const { props, state } = propsAndState(nearestComponent(fiber));
  // Derleme eklentisinin özniteliği (güncel koddan) önce; yoksa fiber ve source map.
  const location = (el.hasAttribute(SOURCE_ATTR) ? await locateFromAttribute(el, resolver, true) : undefined) ?? (await locateSource(el, resolver));
  return { selector: buildSelectors(el, el.ownerDocument).selector, location, components: componentStack(fiber), props, state, element: el };
}

/** Konsol kayıtlarının derlenmiş konumlarını kaynak dosyaya çözer (çözülemeyen olduğu gibi kalır). */
export async function resolveConsoleSources(entries: ConsoleRecord[], resolver: SourceResolver): Promise<ConsoleRecord[]> {
  return Promise.all(
    entries.map(async (c) => {
      if (!c.source) return c;
      const frame = parseStack(`    at ${c.source}`)[0];
      if (!frame) return c;
      const loc = await resolver.resolve(frame);
      if (!loc.resolved) return c;
      // Konsolu saran çerçeve kodu bağımlılığa çözülebilir; yığındaki sonraki kullanıcı çerçevesi denenir.
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

/** Başarısız istekler her zaman girer; kalan yer en yeni başarılı isteklerle dolar. Sıra zamana göredir. */
export function pickRequests(all: NetworkRecord[], max = MAX_REQUESTS): NetworkRecord[] {
  const failed = (n: NetworkRecord) => !!n.error || n.status >= 400 || n.status === 0;
  const keep = new Set(all.filter(failed).slice(-max));
  for (let i = all.length - 1; i >= 0 && keep.size < max; i--) keep.add(all[i]);
  return all.filter((n) => keep.has(n));
}

export interface ReportInput {
  note: string;
  lang: FlashbackLocale;
  redact: RedactOptions;
  snapshot: Snapshot;
  target?: TargetCapture;
  console: ConsoleRecord[];
}

export function buildReport(input: ReportInput): Report {
  const r = new Redactor(input.redact);
  const at = input.snapshot.at;
  const t = input.target;
  let target: ReportTarget | undefined;
  if (t) {
    const loc = t.location;
    const html = redactElementHtml(t.element, r).replace(new RegExp(` ${SOURCE_ATTR}="[^"]*"`, 'g'), '');
    target = {
      selector: t.selector,
      ...(loc ? { file: loc.file, line: loc.line, column: loc.column, resolved: loc.resolved } : {}),
      ...(loc?.reason ? { reason: loc.reason } : {}),
      ...(loc?.snippet ? { snippet: { startLine: loc.snippet.startLine, lines: loc.snippet.lines } } : {}),
      ...(loc?.fromAncestor ? { fromAncestor: true } : {}),
      components: t.components,
      ...(t.props !== undefined && !isEmptyObject(t.props) ? { props: clipValue(r.value(t.props)) } : {}),
      ...(t.state !== undefined ? { state: clipValue(r.value(t.state)) } : {}),
      html: clip(html, HTML_CHARS),
    };
  }
  const report: Report = {
    v: REPORT_VERSION,
    lang: input.lang,
    createdAt: new Date(at).toISOString(),
    note: input.note.trim(),
    page: { url: r.url(location.href), title: r.text(document.title), viewport: `${window.innerWidth}×${window.innerHeight}` },
    ...(target ? { target } : {}),
    network: pickRequests(input.snapshot.network).map((n) => ({
      ago: at - n.time,
      method: n.method,
      url: r.url(n.url),
      status: n.status,
      durationMs: n.durationMs,
      ...(n.error ? { error: r.text(n.error) } : {}),
      ...(n.reqBody ? { reqBody: clip(r.body(n.reqBody), REQ_BODY_CHARS) } : {}),
      ...(n.resBody ? { resBody: clip(r.body(n.resBody, n.contentType), RES_BODY_CHARS) } : {}),
    })),
    console: input.console.slice(-MAX_CONSOLE).map((c) => ({
      ago: at - c.time,
      level: c.level,
      message: clip(r.text(c.message), MESSAGE_CHARS) ?? '',
      ...(c.source ? { source: c.source } : {}),
    })),
    steps: input.snapshot.steps.slice(-MAX_STEPS).map((s) => ({
      ago: at - s.time,
      type: s.type,
      ...(s.selector ? { selector: s.selector } : {}),
      ...(s.label ? { label: r.text(s.label) } : {}),
      ...(s.value !== undefined ? { value: r.text(s.value) } : {}),
      ...(s.key ? { key: s.key } : {}),
      ...(s.url ? { url: r.url(s.url) } : {}),
    })),
    store: input.snapshot.store.slice(-MAX_STORE).map((s) => {
      const type = r.pathType(s.path);
      const hide = (v: unknown) => (type && v !== undefined && v !== null && v !== '' ? marker(type) : clipValue(r.value(v)));
      return { ago: at - s.time, name: s.name, path: s.path, before: hide(s.before), after: hide(s.after) };
    }),
    redacted: null,
  };
  report.redacted = r.enabled ? r.stats.count : null;
  return report;
}
