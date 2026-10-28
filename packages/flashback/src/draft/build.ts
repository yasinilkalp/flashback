/**
 * Olay taslağını kurar (FR-PKG-01/06/07/08, FR-MARK-07/08, FR-RED-01/09).
 *
 * TEK bir `Redactor` örneği yükün tüm metin alanlarından geçer; böylece `redaction.count/byType` tam olarak bu
 * yükü yansıtır. Yük `LIMITS.incidentBytes` altında tutulur; şema doğrulamasını alıcı yapar (birim testleri
 * yükü `IncidentDraftSchema` ile doğrular).
 */
import {
  LIMITS,
  Redactor,
  truncateText,
  type IncidentDraftInput,
  type RedactOptions,
  type Target,
} from '@flashback/shared';
import { EventType, type eventWithTime } from 'rrweb';
import { PAYLOAD_SCHEMA_VERSION, FLASHBACK_VERSION } from '../config.js';
import type { FrozenSnapshot } from '../recorder/recorder.js';
import type { ResolvedLocation } from '../source/sourcemap.js';
import { confidenceItems } from './confidence.js';
import { redactEvents, withoutOwnUi } from './events.js';
import { redactElementHtml } from './html.js';

export interface TargetCapture {
  selector: string;
  fallbackSelectors: string[];
  resolution: 'exact' | 'ancestor' | 'unresolved';
  resolutionReason?: string;
  /** Öğeyi render eden çerçeve (FR-MARK-06): `react`, `vue`, `svelte`, `unknown`. */
  framework?: string;
  /** Kaynak konumu; React/fiber bulunamadıysa yok. */
  location?: ResolvedLocation;
  componentStack: string[];
  props?: unknown;
  state?: unknown;
  computedStyle?: Record<string, string>;
  /** İşaretlenen andaki öğenin kopyası (tekrar oynatmadan); HTML ve metin buradan, gizlenerek alınır. */
  element: Element | null;
}

export interface Exclusions {
  network?: boolean;
  dom?: boolean;
  store?: boolean;
}

export interface DraftEnv {
  origin: string;
  userAgent: string;
  tabId: string;
  locale: string;
  timezone: string;
  storageKeys: string[];
  cookieNames: string[];
  /** Meta olayı yoksa kullanılacak görüntü alanı. */
  viewport: { width: number; height: number };
  /** Sayfanın çerçevesi (hedef yoksa); varsayılan `react`. */
  framework?: string;
}

export interface DraftInput {
  snapshot: FrozenSnapshot;
  /** İşaretlenen an (epoch ms). */
  markedAt: number;
  note: { what?: string; expected: string };
  target: TargetCapture | null;
  /** FR-MARK-09: geliştiricinin elle seçtiği birincil kanıt (kayıt sıra numarası). */
  primaryOverride?: { kind: 'network' | 'console'; seq: number };
  exclude?: Exclusions;
  /** İşaretlenen andaki belge kökü (tekrar oynatma iframe'i). */
  domRoot?: Element | null;
  env: DraftEnv;
  redact: RedactOptions;
  /**
   * Pakete girecek rrweb geçmişi (ms). Verilmezse klibin tamamı girer; verilirse fazlası gizlenmeden önce atılır
   * (NFR-LAT-01: gizleme maliyeti olay sayısıyla orantılı).
   */
  historyMs?: number;
}

const ERROR_LEVELS = new Set(['error', 'uncaught', 'unhandledrejection']);
/** Bir ağ hatasından hemen sonra gelen konsol hatası onun sonucudur; kök neden ağ hatasıdır. */
const CONSEQUENCE_WINDOW_MS = 2000;
const TARGET_HTML_BYTES = 16 * 1024;
const TARGET_TEXT_CHARS = 1000;

type Meta = { href: string; width: number; height: number };

function metaEvents(events: eventWithTime[]): Array<{ time: number } & Meta> {
  return events.filter((e) => e.type === EventType.Meta).map((e) => ({ time: e.timestamp, ...(e.data as Meta) }));
}

/** İşaretlenen andaki URL: o ana kadarki son Meta olayı ya da sayfa geçişi adımı. */
function urlAt(snapshot: FrozenSnapshot, at: number, fallback: string): string {
  let best = { time: -Infinity, url: fallback };
  for (const m of metaEvents(snapshot.events)) if (m.time <= at && m.time >= best.time) best = { time: m.time, url: m.href };
  for (const s of snapshot.steps) if (s.type === 'navigate' && s.url && s.time <= at && s.time >= best.time) best = { time: s.time, url: s.url };
  return best.url;
}

/**
 * Store farkı yol bazındadır (`auth.token`): anahtar yolda kaldığı için değer tek başına anahtar gizlemesinden
 * geçemez. Yolun herhangi bir parçası hassassa önceki/sonraki değer bütünüyle türüyle işaretlenir (FR-RED-02).
 */
function redactStoreValues(path: string, before: unknown, after: unknown, r: Redactor): { before: unknown; after: unknown } {
  const type = r.enabled ? r.pathType(path) : null;
  // Türün kendisi hassas bir anahtardır: Redactor değeri işaretler ve sayar (boş değerler olduğu gibi kalır).
  if (type) return { before: r.value({ [type]: before })[type], after: r.value({ [type]: after })[type] };
  return { before: r.value(before), after: r.value(after) };
}

/**
 * En az `historyMs` geçmişi ve işaretlenen anı kapsayan en geç tam anlık görüntüden (Meta) başlar; daha eskisini atar.
 * Tekrar oynatma her zaman bir Meta + tam görüntüyle başlamalıdır.
 */
export function trimToHistory(events: eventWithTime[], markedAt: number, frozenAt: number, historyMs: number | undefined): eventWithTime[] {
  if (!historyMs || !events.length) return events;
  const cutoff = Math.min(markedAt, frozenAt - historyMs);
  let start = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type !== EventType.Meta) continue;
    if (events[i].timestamp <= cutoff) start = i;
    else break;
  }
  return start > 0 ? events.slice(start) : events;
}

/** UTF-8 bayt uzunluğu; çok MB'lık metinler için TextEncoder ile yeni dizi ayırmaz (NFR-LAT-01). */
const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** UTF-8 bayt uzunluğu. Uzun metinlerde yerel kodlayıcı (JS döngüsü 4x CPU kısmada yüzlerce ms tutuyordu). */
export function byteLength(s: string): number {
  if (encoder && s.length > 512) return encoder.encode(s).length;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

/**
 * rrweb olaylarını kalan bütçeye sığdırır: önce en eski dilimler (checkout sınırından), gerekirse tamamı.
 * Gizlemeden ÖNCE çalışır; böylece gizleme sayacı yalnızca yüke giren olayları sayar.
 * Her olay bir kez serileştirilir; dilim atıldıkça toplam boyuttan düşülür (eskiden her adımda tüm dizi yeniden
 * serileştiriliyordu).
 */
function fitEvents(events: eventWithTime[], budget: number, truncated: string[]): { kept: eventWithTime[]; bytes: number } {
  const sizes = events.map((e) => byteLength(JSON.stringify(e)) + 1);
  let total = sizes.reduce((a, b) => a + b, 2);
  let start = 0;
  while (start < events.length && total > budget) {
    let end = events.length;
    for (let i = start + 1; i < events.length; i++) {
      if (events[i].type === EventType.Meta) {
        end = i;
        break;
      }
    }
    for (let i = start; i < end; i++) total -= sizes[i];
    start = end;
  }
  const kept = start === 0 ? events : events.slice(start);
  const dropped = events.length - kept.length;
  if (dropped) truncated.push(`en eski ${dropped} rrweb olayı (5 MB sınırı)`);
  return { kept, bytes: total };
}

/** Gizleme işaretinin bir değere ekleyebileceği en fazla bayt (`""` → `"[REDACTED:client_secret]"` vb.). */
const MARKER_SLACK = 40;

/**
 * Son güvenlik: yük hâlâ büyükse en eski ağ gövdeleri atılır (NFR-SIZE-01).
 * `eventsUpper`: olay dizisinin bayt üst sınırı (gizleme öncesi boyut + gizleme payı). Toplam güvenle sınırın
 * altındaysa olaylar yeniden serileştirilmez; değilse kesin boyut hesaplanır.
 */
function fitBodies(draft: IncidentDraftInput, truncated: string[], eventsUpper: number): void {
  const rest = byteLength(JSON.stringify({ ...draft, events: [] }));
  if (rest + eventsUpper <= LIMITS.incidentBytes) return;
  let size = byteLength(JSON.stringify(draft));
  let bodies = 0;
  for (const n of draft.network ?? []) {
    if (size <= LIMITS.incidentBytes) break;
    if (n.resBody === undefined && n.reqBody === undefined) continue;
    size -= byteLength(JSON.stringify([n.reqBody ?? '', n.resBody ?? '']));
    n.resBody = undefined;
    n.reqBody = undefined;
    n.truncated = true;
    bodies++;
  }
  if (bodies) truncated.push(`${bodies} ağ girdisinin gövdesi (5 MB sınırı)`);
  // Gizleme işaretleri olayları büyüttüyse (ör. çok sayıda kısa e-posta): gizlenmiş olaylar kesin boyutla yeniden sığdırılır.
  if (size > LIMITS.incidentBytes && draft.events?.length) {
    const rest = byteLength(JSON.stringify({ ...draft, events: [] }));
    draft.events = fitEvents(draft.events as eventWithTime[], LIMITS.incidentBytes * 0.97 - rest, truncated).kept;
  }
}

function pickPrimary(
  draft: IncidentDraftInput,
  markedAtMs: number,
  override: DraftInput['primaryOverride'],
  seqs: { network: number[]; console: number[] },
): IncidentDraftInput['primaryEvidence'] {
  if (override) {
    const ref = seqs[override.kind].indexOf(override.seq);
    if (ref !== -1) return { kind: override.kind, ref };
  }
  if (draft.target) return { kind: 'target' };
  const net = (draft.network ?? []).map((n, ref) => ({ kind: 'network' as const, ref, t: n.t, err: n.status >= 400 || !!n.error || n.status === 0 }));
  const con = (draft.console ?? []).map((c, ref) => ({ kind: 'console' as const, ref, t: c.t, err: ERROR_LEVELS.has(c.level) }));
  const candidates = [...net, ...con].filter((c) => c.err);
  if (!candidates.length) return { kind: 'target' };
  candidates.sort((a, b) => Math.abs(a.t - markedAtMs) - Math.abs(b.t - markedAtMs) || (a.kind === 'network' ? -1 : 1));
  const nearest = candidates[0];
  if (nearest.kind === 'console') {
    const cause = net.filter((n) => n.err && n.t <= nearest.t && nearest.t - n.t <= CONSEQUENCE_WINDOW_MS).pop();
    if (cause) return { kind: 'network', ref: cause.ref };
  }
  return { kind: nearest.kind, ref: nearest.ref };
}

function computedTarget(t: TargetCapture, r: Redactor): Target {
  const loc = t.location;
  let html: string | undefined;
  let text: string | undefined;
  if (t.element) {
    html = truncateText(redactElementHtml(t.element, r), TARGET_HTML_BYTES).text;
    const raw = (t.element.textContent ?? '').replace(/\s+/g, ' ').trim();
    text = r.text(raw.slice(0, TARGET_TEXT_CHARS));
  }
  return {
    selector: r.text(t.selector),
    fallbackSelectors: t.fallbackSelectors.map((s) => r.text(s)),
    ...(loc ? { file: loc.file, line: loc.line, column: loc.column } : {}),
    resolved: loc?.resolved ?? false,
    resolution: t.resolution,
    ...(t.resolutionReason || (loc && !loc.resolved && loc.reason)
      ? { resolutionReason: [t.resolutionReason, loc && !loc.resolved ? loc.reason : undefined].filter(Boolean).join('; ') }
      : {}),
    ...(loc?.snippet ? { snippet: { ...loc.snippet, lines: loc.snippet.lines.map((l) => r.text(l)) } } : {}),
    componentStack: t.componentStack,
    ...(t.props !== undefined ? { props: r.value(t.props) } : {}),
    ...(t.state !== undefined ? { state: r.value(t.state) } : {}),
    ...(t.computedStyle ? { computedStyle: t.computedStyle } : {}),
    ...(html !== undefined ? { html } : {}),
    ...(text !== undefined ? { text } : {}),
  };
}

export function buildDraft(input: DraftInput): IncidentDraftInput {
  const { snapshot, env, exclude = {} } = input;
  const r = new Redactor(input.redact);
  const truncated: string[] = [];
  const excluded: string[] = [];

  const network = exclude.network ? [] : snapshot.network;
  const store = exclude.store ? [] : snapshot.store;
  if (exclude.network) excluded.push('ağ girdileri');
  if (exclude.store) excluded.push('store değişiklikleri');
  if (exclude.dom) excluded.push('DOM anlık görüntüsü');

  const times = [snapshot.windowStart, ...network.map((n) => n.time), ...snapshot.console.map((c) => c.time), ...snapshot.steps.map((s) => s.time), ...store.map((s) => s.time)].filter(Number.isFinite);
  const base = Math.min(...times, input.markedAt);
  const rel = (t: number) => Math.max(0, Math.round(t - base));

  const metas = metaEvents(snapshot.events);
  const first = metas[0];
  const startUrlRaw = first?.href ?? snapshot.steps[0]?.pageUrl ?? env.origin;
  const viewport = first ? { width: first.width, height: first.height } : env.viewport;

  // Kayıt anında (rrweb maskInputFn) gizlenen giriş değerleri de sayaca girer.
  const recordTime: Record<string, number> = {};
  for (const s of snapshot.steps) if (s.valueRedactedAs) recordTime[s.valueRedactedAs] = (recordTime[s.valueRedactedAs] ?? 0) + 1;

  const draft: IncidentDraftInput = {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    source: { origin: env.origin, flashbackVersion: FLASHBACK_VERSION, framework: input.target?.framework ?? env.framework ?? 'react', userAgent: env.userAgent, tabId: env.tabId },
    recordingStartedAt: new Date(base).toISOString(),
    markedAtMs: rel(input.markedAt),
    context: {
      url: r.url(urlAt(snapshot, input.markedAt, startUrlRaw)),
      startUrl: r.url(startUrlRaw),
      viewport,
      locale: env.locale,
      timezone: env.timezone,
      storageKeys: env.storageKeys,
      cookieNames: env.cookieNames,
    },
    note: {
      ...(input.note.what?.trim() ? { what: r.text(input.note.what.trim()) } : {}),
      expected: r.text(input.note.expected.trim()),
    },
    target: input.target ? computedTarget(input.target, r) : null,
    primaryEvidence: { kind: 'target' },
    steps: snapshot.steps.map((s) => ({
      t: rel(s.time),
      type: s.type,
      ...(s.selector ? { selector: r.text(s.selector) } : {}),
      fallbackSelectors: s.fallbackSelectors.map((f) => r.text(f)),
      ...(s.value !== undefined ? { value: r.text(s.value) } : {}),
      ...(s.valueRedactedAs ? { valueRedactedAs: s.valueRedactedAs } : {}),
      ...(s.key ? { key: s.key } : {}),
      ...(s.url ? { url: r.url(s.url) } : {}),
      ...(s.at ? { at: s.at } : {}),
    })),
    network: network.map((n) => ({
      t: rel(n.time),
      method: n.method,
      url: r.url(n.url),
      status: n.status,
      durationMs: n.durationMs,
      reqHeaders: r.headers(n.reqHeaders),
      resHeaders: r.headers(n.resHeaders),
      ...(n.reqBody !== undefined ? { reqBody: r.body(n.reqBody, n.reqHeaders['content-type'] ?? '') } : {}),
      ...(n.resBody !== undefined ? { resBody: r.body(n.resBody, n.contentType ?? '') } : {}),
      ...(n.contentType ? { contentType: n.contentType } : {}),
      ...(n.bodySize !== undefined ? { bodySize: n.bodySize } : {}),
      truncated: n.truncated,
      ...(n.error ? { error: r.text(n.error) } : {}),
    })),
    console: snapshot.console.map((c) => ({
      t: rel(c.time),
      level: c.level,
      message: r.text(c.message),
      ...(c.stack ? { stack: r.text(c.stack) } : {}),
      ...(c.source ? { source: r.text(c.source) } : {}),
    })),
    store: store.map((s) => ({ t: rel(s.time), name: s.name, path: r.text(s.path), ...redactStoreValues(s.path, s.before, s.after, r) })),
    domSnapshot: '',
    events: [],
    redaction: { enabled: r.enabled, count: 0, byType: {} },
    confidence: [],
  };

  const bodiesTruncated = (draft.network ?? []).filter((n) => n.truncated).length;
  if (bodiesTruncated) truncated.push(`${bodiesTruncated} ağ gövdesi (${LIMITS.bodyBytes / 1024} KB sınırı)`);

  if (!exclude.dom && input.domRoot) {
    const dom = truncateText(redactElementHtml(input.domRoot, r), LIMITS.domBytes);
    draft.domSnapshot = dom.text;
    if (dom.truncated) truncated.push(`DOM anlık görüntüsü (${Math.round(dom.size / 1024)} KB → 1 MB)`);
  }

  // Olaylar dışındaki her şey + Kanıt güveni payı çıkarıldıktan sonra kalan bütçe rrweb olaylarına kalır.
  const budget = LIMITS.incidentBytes * 0.97 - byteLength(JSON.stringify(draft));
  const history = trimToHistory(snapshot.events, input.markedAt, snapshot.frozenAt, input.historyMs);
  const fitted = fitEvents(withoutOwnUi(history), budget, truncated);
  const before = r.stats.count;
  draft.events = redactEvents(fitted.kept, r);
  fitBodies(draft, truncated, fitted.bytes + (r.stats.count - before) * MARKER_SLACK);

  draft.primaryEvidence = pickPrimary(draft, draft.markedAtMs, input.primaryOverride, {
    network: network.map((n) => n.seq),
    console: snapshot.console.map((c) => c.seq),
  });

  const byType = { ...r.stats.byType };
  let count = r.stats.count;
  for (const [type, n] of Object.entries(recordTime)) {
    byType[type] = (byType[type] ?? 0) + n;
    count += n;
  }
  draft.redaction = { enabled: r.enabled, count, byType };
  draft.confidence = confidenceItems({ draft, snapshot, truncated, excluded, sessionHint: env, sourceFromAncestor: !!input.target?.location?.fromAncestor });
  return draft;
}
