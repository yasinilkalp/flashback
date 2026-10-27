/**
 * Kullanıcı adımları: tıklama, giriş, tuş, sayfa geçişi (FR-REC-07).
 * Her adım zaman damgası, birincil seçici ve en az bir yedek seçici taşır. Giriş değerleri kayıt anında
 * maskelenir (FR-REC-08); maskelenen adım `valueRedactedAs` alanını taşır.
 */
import type { Step } from '@flashback/shared';
import { buildSelectors } from '../dom/selector.js';
import type { InputMasker } from './mask.js';

export interface StepRecord extends Omit<Step, 't' | 'fallbackSelectors'> {
  fallbackSelectors: string[];
  /** Adımın atıldığı sayfanın URL'si (yalnızca Kanıt güveni hesabı için; yüke girmez). */
  pageUrl: string;
  time: number;
}

const KEYS = new Set(['Enter', 'Escape', 'Tab']);
const MAX_ENTRIES = 2000;
const ACTIONABLE =
  'button, a[href], input, select, textarea, label, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"], [role="option"], [data-testid]';

const TEXT_INPUT_EXCLUDED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color']);

function isValueField(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  return tag === 'input' && !TEXT_INPUT_EXCLUDED.has((el as HTMLInputElement).type);
}

/**
 * Kapsayıcı tıklamasının öğe kutusundaki göreli konumu. Klavyeyle tetiklenen tıklamalarda (`detail === 0`)
 * ya da kutusu olmayan öğede `null`.
 */
function clickOffset(el: Element, e: MouseEvent): { x: number; y: number } | null {
  if (e.detail === 0) return null;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const ratio = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  return { x: ratio((e.clientX - r.left) / r.width), y: ratio((e.clientY - r.top) / r.height) };
}

export class StepCapture {
  private entries: StepRecord[] = [];
  private pending = new Map<Element, { value: string; time: number }>();
  private lastValue = new WeakMap<Element, string>();
  private restore: Array<() => void> = [];

  constructor(
    private readonly mask: InputMasker,
    /** Flashback arayüzünden gelen olaylar mı? (kayda girmez) */
    private readonly isOwnEvent: (e: Event) => boolean,
  ) {}

  private push(step: Omit<StepRecord, 'pageUrl' | 'fallbackSelectors'> & { fallbackSelectors?: string[] }) {
    this.entries.push({ fallbackSelectors: [], ...step, pageUrl: location.href });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  private target(e: Event): Element | null {
    const t = (e.composedPath?.()[0] ?? e.target) as Node | null;
    if (!t) return null;
    return t.nodeType === 1 ? (t as Element) : t.parentElement;
  }

  private selectorsFor(el: Element) {
    const s = buildSelectors(el, el.ownerDocument);
    return { selector: s.selector, fallbackSelectors: s.fallbackSelectors };
  }

  /** Bekleyen giriş değerlerini adım olarak yazar (change, odak kaybı, tuş, tıklama, panel açılışı). */
  flush(only?: Element): void {
    for (const [el, p] of Array.from(this.pending)) {
      if (only && el !== only) continue;
      this.pending.delete(el);
      if (this.lastValue.get(el) === p.value) continue;
      this.lastValue.set(el, p.value);
      const masked = this.mask(p.value, el);
      this.push({
        time: p.time,
        type: 'input',
        ...this.selectorsFor(el),
        value: masked.value,
        ...(masked.as ? { valueRedactedAs: masked.as } : {}),
      });
    }
  }

  install(win: Window & typeof globalThis = window): void {
    if (this.restore.length) return;
    const doc = win.document;
    const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) => {
      const h = (e: DocumentEventMap[K]) => {
        if (!this.isOwnEvent(e)) fn(e);
      };
      doc.addEventListener(type, h, true);
      this.restore.push(() => doc.removeEventListener(type, h, true));
    };

    on('input', (e) => {
      const el = this.target(e);
      if (el && isValueField(el)) this.pending.set(el, { value: el.value, time: Date.now() });
    });
    on('change', (e) => {
      const el = this.target(e);
      if (!el || !isValueField(el)) return;
      this.pending.set(el, { value: el.value, time: this.pending.get(el)?.time ?? Date.now() });
      this.flush(el);
    });
    on('focusout', (e) => {
      const el = this.target(e);
      if (el) this.flush(el);
    });
    on('keydown', (e) => {
      if (!KEYS.has(e.key) || e.isComposing) return;
      const el = this.target(e);
      this.flush();
      if (!el) return;
      this.push({ time: Date.now(), type: 'key', key: e.key, ...this.selectorsFor(el) });
    });
    let labelClick: { control: Element; time: number } | null = null;
    on('click', (e) => {
      const raw = this.target(e);
      if (!raw) return;
      this.flush();
      const el = raw.closest(ACTIONABLE) ?? raw;
      // <label> tıklaması kontrolüne ikinci bir tıklama gönderir; tekrar oynatmada çift tıklama olmasın.
      const now = Date.now();
      if (labelClick && labelClick.control === el && now - labelClick.time < 100) return;
      const control = el.tagName === 'LABEL' ? (el as HTMLLabelElement).control : null;
      labelClick = control ? { control, time: now } : null;
      const at = raw.closest(ACTIONABLE) ? null : clickOffset(el, e);
      this.push({ time: now, type: 'click', ...this.selectorsFor(el), ...(at ? { at } : {}) });
    });

    const navigate = () => this.push({ time: Date.now(), type: 'navigate', url: win.location.href });
    const history = win.history;
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method];
      const patched = function (this: History, ...args: Parameters<History['pushState']>) {
        const before = win.location.href;
        const result = original.apply(this, args);
        if (win.location.href !== before || method === 'pushState') navigate();
        return result;
      };
      history[method] = patched;
      this.restore.push(() => {
        if (history[method] === patched) history[method] = original;
      });
    }
    win.addEventListener('popstate', navigate);
    this.restore.push(() => win.removeEventListener('popstate', navigate));
  }

  uninstall(): void {
    for (const r of this.restore.splice(0)) r();
  }

  prune(before: number): void {
    if (this.entries.length && this.entries[0].time < before) this.entries = this.entries.filter((e) => e.time >= before);
  }

  snapshot(): StepRecord[] {
    this.flush();
    return [...this.entries].sort((a, b) => a.time - b.time);
  }

  clear(): void {
    this.entries = [];
    this.pending.clear();
  }
}
