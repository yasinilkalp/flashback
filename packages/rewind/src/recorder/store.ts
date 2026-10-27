/**
 * `trackStore(ad, subscribe, getState)` (FR-REC-09). Zustand, Redux ve özel store'lar.
 * Değişiklikler yol bazında önceki/sonraki değerleriyle kaydedilir. Bileşen monte edilmeden de çalışır;
 * Rewind devre dışıysa takip bırakılır ve tampon silinir.
 */
import { safeSerialize } from '../serialize.js';
import type { Unsubscribe } from '../types.js';

export interface StoreRecord {
  time: number;
  name: string;
  path: string;
  before: unknown;
  after: unknown;
}

interface Tracked {
  name: string;
  subscribe: (listener: () => void) => unknown;
  getState: () => unknown;
  unsubscribe?: () => void;
  last: unknown;
}

const MAX_ENTRIES = 2000;
const MAX_DIFF_DEPTH = 2;
const EARLY_MAX_AGE_MS = 120_000;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Düz nesnelerde `MAX_DIFF_DEPTH` düzeyine kadar inen yol farkı (değerler önceden serileştirilmiştir). */
export function diffState(before: unknown, after: unknown, path = '', depth = 0): Array<{ path: string; before: unknown; after: unknown }> {
  if (same(before, after)) return [];
  if (depth < MAX_DIFF_DEPTH && isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys).flatMap((k) => diffState(before[k], after[k], path ? `${path}.${k}` : k, depth + 1));
  }
  return [{ path: path || '(kök)', before, after }];
}

export class StoreRegistry {
  private stores: Tracked[] = [];
  private entries: StoreRecord[] = [];
  private disabled = false;
  attached = false;

  track(name: string, subscribe: Tracked['subscribe'], getState: Tracked['getState']): Unsubscribe {
    if (this.disabled) return () => {};
    const tracked: Tracked = { name, subscribe, getState, last: safeSerialize(getState()) };
    const listener = () => {
      const next = safeSerialize(tracked.getState());
      const time = Date.now();
      for (const d of diffState(tracked.last, next)) this.entries.push({ time, name, ...d });
      tracked.last = next;
      if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
      if (!this.attached) this.prune(time - EARLY_MAX_AGE_MS);
    };
    const unsub = subscribe(listener);
    tracked.unsubscribe = typeof unsub === 'function' ? (unsub as () => void) : undefined;
    this.stores.push(tracked);
    return () => {
      tracked.unsubscribe?.();
      this.stores = this.stores.filter((s) => s !== tracked);
    };
  }

  /** Rewind devre dışı: tüm takipler bırakılır, veri silinir, yeni takip yapılmaz. */
  disable(): void {
    this.disabled = true;
    for (const s of this.stores) s.unsubscribe?.();
    this.stores = [];
    this.entries = [];
  }

  prune(before: number): void {
    if (this.entries.length && this.entries[0].time < before) this.entries = this.entries.filter((e) => e.time >= before);
  }

  snapshot(): StoreRecord[] {
    return [...this.entries];
  }
}
