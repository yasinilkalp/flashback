/**
 * Flashback denetleyicisi: seçim kipi → not kutusu → rapor → pano.
 *
 * Seçim kipinde sayfanın fare olayları pencere düzeyinde (yakalama evresinde) durdurulur: öğeye tıklamak uygulamada
 * hiçbir şeyi tetiklemez ve adım kaydına girmez. Flashback arayüzünün kendi olayları (gölge kök) dokunulmadan geçer.
 */
import { isEditableTarget, matchesShortcut, parseShortcut, type ResolvedConfig } from './config.js';
import { clipboardText, copyText, saveReport } from './deliver.js';
import { Capture, type Snapshot } from './recorder/capture.js';
import type { ConsoleRecord } from './recorder/console.js';
import { network } from './recorder/early.js';
import { buildReport, captureTarget, pickRequests, quickLabel, resolveConsoleSources, type TargetCapture } from './report/build.js';
import { pageResolverOptions } from './source/environment.js';
import { isLocalSource, SourceResolver } from './source/sourcemap.js';

export type Mode = 'idle' | 'picking' | 'composing' | 'sending';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Selection {
  /** `null`: sayfa geneli. */
  el: Element | null;
  label: string;
  box: Box | null;
  counts: { requests: number; steps: number; errors: number };
}

export type Toast = { kind: 'copied'; path?: string } | { kind: 'manual'; text: string };

export interface ControllerState {
  mode: Mode;
  hover: { box: Box; label: string } | null;
  selection: Selection | null;
  toast: Toast | null;
}

const TOAST_MS = 5000;
/** Seçim kipinde durdurulan fare olayları. */
const BLOCKED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'] as const;
const CURSOR_CSS = '*, *::before, *::after { cursor: crosshair !important; }';

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export class FlashbackController {
  readonly resolver: SourceResolver;
  private readonly capture: Capture;
  private readonly shortcut;
  private state: ControllerState = { mode: 'idle', hover: null, selection: null, toast: null };
  private listeners = new Set<() => void>();
  private hoverEl: Element | null = null;
  private frame = 0;
  private cursorStyle: HTMLStyleElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: Snapshot | null = null;
  private target: Promise<TargetCapture | undefined> = Promise.resolve(undefined);
  private consoleEntries: Promise<ConsoleRecord[]> = Promise.resolve([]);

  constructor(
    readonly cfg: ResolvedConfig,
    /** Flashback arayüz kökü; olayları kayda girmez, seçim kipinde durdurulmaz. */
    readonly host: HTMLElement,
  ) {
    this.shortcut = parseShortcut(cfg.shortcut);
    this.capture = new Capture(cfg, (e) => this.isOwn(e));
    const fetchFn = network().nativeFetch;
    this.resolver = new SourceResolver(
      async (url) => {
        const res = await fetchFn(url);
        return res.ok ? res.text() : null;
      },
      (url) => isLocalSource(url, location.origin),
      pageResolverOptions(),
    );
  }

  start(): void {
    this.capture.start();
    window.addEventListener('keydown', this.onShortcut, true);
  }

  stop(): void {
    this.stopPicking();
    this.stopTracking();
    window.removeEventListener('keydown', this.onShortcut, true);
    clearTimeout(this.toastTimer);
    this.capture.stop();
    this.listeners.clear();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): ControllerState => this.state;

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private isOwn(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  private onShortcut = (e: KeyboardEvent): void => {
    if (!matchesShortcut(e, this.shortcut) || isEditableTarget(e.composedPath()[0] ?? null)) return;
    e.preventDefault();
    e.stopPropagation();
    this.toggle();
  };

  /** Köşedeki düğme ve kısayol: boştayken seçim kipini açar, aksi hâlde vazgeçer. */
  toggle(): void {
    if (this.state.mode === 'idle') this.startPicking();
    else if (this.state.mode !== 'sending') this.cancel();
  }

  startPicking(): void {
    if (this.state.mode !== 'idle') return;
    this.set({ mode: 'picking', hover: null, toast: null });
    for (const type of BLOCKED) window.addEventListener(type, this.onBlocked, true);
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('keydown', this.onPickKey, true);
    window.addEventListener('scroll', this.onScroll, true);
    this.cursorStyle = document.createElement('style');
    this.cursorStyle.setAttribute('data-flashback-ui', '');
    this.cursorStyle.textContent = CURSOR_CSS;
    document.head.appendChild(this.cursorStyle);
  }

  private stopPicking(): void {
    for (const type of BLOCKED) window.removeEventListener(type, this.onBlocked, true);
    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('keydown', this.onPickKey, true);
    window.removeEventListener('scroll', this.onScroll, true);
    cancelAnimationFrame(this.frame);
    this.cursorStyle?.remove();
    this.cursorStyle = null;
    this.hoverEl = null;
  }

  cancel(): void {
    this.stopPicking();
    this.stopTracking();
    this.set({ mode: 'idle', hover: null, selection: null });
  }

  private elementAt(e: Event): Element | null {
    const t = e.composedPath()[0];
    return t instanceof Element && t.isConnected ? t : null;
  }

  private onMove = (e: PointerEvent): void => {
    if (this.isOwn(e)) return;
    this.hoverEl = this.elementAt(e);
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.updateHover());
  };

  private onScroll = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.updateHover());
  };

  private updateHover(): void {
    const el = this.hoverEl;
    this.set({ hover: el && el !== document.documentElement && el !== document.body ? { box: boxOf(el), label: quickLabel(el) } : null });
  }

  private onBlocked = (e: Event): void => {
    if (this.isOwn(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') this.pick(this.elementAt(e));
  };

  private onPickKey = (e: KeyboardEvent): void => {
    if (this.isOwn(e) || matchesShortcut(e, this.shortcut)) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') this.cancel();
      else this.pick(null);
    }
  };

  /** Öğe seçildi (`null`: sayfa geneli): tampon dondurulur, konum arka planda çözülür, not kutusu açılır. */
  pick(el: Element | null): void {
    if (this.state.mode !== 'picking') return;
    this.stopPicking();
    const target = el === document.documentElement || el === document.body ? null : el;
    const snapshot = this.capture.snapshot();
    this.snapshot = snapshot;
    this.target = target ? captureTarget(target, this.resolver).catch(() => undefined) : Promise.resolve(undefined);
    this.consoleEntries = resolveConsoleSources(snapshot.console, this.resolver).catch(() => snapshot.console);
    const selection: Selection = {
      el: target,
      label: target ? quickLabel(target) : '',
      box: target ? boxOf(target) : null,
      counts: {
        requests: pickRequests(snapshot.network).length,
        steps: snapshot.steps.length,
        errors: snapshot.console.filter((c) => c.level !== 'warn').length,
      },
    };
    this.set({ mode: 'composing', hover: null, selection });
    if (target) this.startTracking();
    void this.target.then((t) => {
      const loc = t?.location;
      if (!loc || this.state.selection !== selection) return;
      const file = `${loc.file.split(/[\\/]/).pop()}:${loc.line}`;
      const comp = t.components[0] ? `<${t.components[0]}>` : null;
      this.set({ selection: { ...selection, label: [file, comp, target?.localName].filter(Boolean).join(' · ') } });
    });
  }

  /** Not kutusu açıkken sayfa kayarsa ya da boyut değişirse çerçeve öğeyi izler. */
  private onReflow = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const s = this.state.selection;
      if (s?.el) this.set({ selection: { ...s, box: boxOf(s.el) } });
    });
  };

  private startTracking(): void {
    window.addEventListener('scroll', this.onReflow, true);
    window.addEventListener('resize', this.onReflow);
  }

  private stopTracking(): void {
    window.removeEventListener('scroll', this.onReflow, true);
    window.removeEventListener('resize', this.onReflow);
  }

  /** Raporu kurar, dev sunucusuna yazdırır (varsa) ve panoya kopyalar. */
  async submit(note: string): Promise<void> {
    if (this.state.mode !== 'composing' || !note.trim() || !this.snapshot) return;
    this.set({ mode: 'sending' });
    this.stopTracking();
    const [target, consoleEntries] = await Promise.all([this.target, this.consoleEntries]);
    const report = buildReport({ note, lang: this.cfg.locale, redact: this.cfg.redact, snapshot: this.snapshot, target, console: consoleEntries });
    const saved = await saveReport(report, network().nativeFetch);
    const text = clipboardText(report, saved, this.cfg.locale);
    const copied = await copyText(text);
    this.snapshot = null;
    this.set({ mode: 'idle', selection: null, toast: copied ? { kind: 'copied', path: saved?.path } : { kind: 'manual', text } });
    clearTimeout(this.toastTimer);
    if (copied) this.toastTimer = setTimeout(() => this.dismissToast(), TOAST_MS);
  }

  dismissToast = (): void => {
    clearTimeout(this.toastTimer);
    this.set({ toast: null });
  };
}
