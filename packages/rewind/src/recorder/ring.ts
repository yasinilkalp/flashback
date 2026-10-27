/**
 * rrweb olayları için dilimli halka tampon (FR-REC-02, NFR-MEM-01).
 *
 * rrweb her `bufferSeconds/2` ms'de tam anlık görüntü (checkout) alır; her checkout yeni bir dilim başlatır.
 * Son 3 dilim tutulur: tamamlanmış iki dilim (≥ bufferSeconds) + sürmekte olan dilim. Yaklaşık bellek
 * `memoryLimit`'i aşarsa en eski dilim atılır ve uyarı bayrağı kalkar.
 */
import { EventType, type eventWithTime } from 'rrweb';

export const MAX_SLICES = 3;

interface Slice {
  start: number;
  events: eventWithTime[];
  bytes: number;
}

export function estimateEventBytes(e: eventWithTime): number {
  try {
    // UTF-16 bellek yaklaşımı: karakter başına 2 bayt.
    return JSON.stringify(e).length * 2;
  } catch {
    return 1024;
  }
}

export class EventRing {
  private slices: Slice[] = [];
  /** NFR-MEM-01 sınırı yüzünden dilim atıldı. */
  memoryWarning = false;
  /** En az bir dilim atıldı mı? (pencere sayfa yüklenişinden sonra başlıyor) */
  evicted = false;

  constructor(
    private readonly memoryLimit: number,
    private readonly onEvict: (windowStart: number) => void = () => {},
    private readonly sizeOf: (e: eventWithTime) => number = estimateEventBytes,
  ) {}

  /** Yeni dilim, checkout'un ilk olayı (Meta) ile başlar. */
  push(e: eventWithTime, isCheckout?: boolean): void {
    const startsSlice = this.slices.length === 0 || (isCheckout === true && e.type === EventType.Meta);
    if (startsSlice) {
      this.slices.push({ start: e.timestamp, events: [], bytes: 0 });
      if (this.slices.length > MAX_SLICES) this.evictOldest();
    }
    const cur = this.slices[this.slices.length - 1];
    cur.events.push(e);
    cur.bytes += this.sizeOf(e);
    while (this.bytes > this.memoryLimit && this.slices.length > 1) {
      this.memoryWarning = true;
      this.evictOldest();
    }
  }

  private evictOldest() {
    this.slices.shift();
    this.evicted = true;
    this.onEvict(this.windowStart);
  }

  get bytes(): number {
    return this.slices.reduce((n, s) => n + s.bytes, 0);
  }

  /** Penceredeki ilk olayın zamanı (yoksa NaN). */
  get windowStart(): number {
    return this.slices[0]?.start ?? Number.NaN;
  }

  /** Tampondaki süre (ms). */
  durationMs(now = Date.now()): number {
    return this.slices.length ? now - this.windowStart : 0;
  }

  events(): eventWithTime[] {
    return this.slices.flatMap((s) => s.events);
  }

  clear(): void {
    this.slices = [];
    this.memoryWarning = false;
    this.evicted = false;
  }
}
