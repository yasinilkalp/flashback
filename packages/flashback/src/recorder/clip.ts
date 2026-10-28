/**
 * Bir kaydın (klibin) rrweb olayları (FR-REC-02, NFR-MEM-01).
 *
 * Kayıt elle başlatılıp durdurulur; klip baştan sona tutulur, eski olay atılmaz. Yaklaşık bellek `memoryLimit`'i
 * aşınca yeni olay alınmaz ve `onFull` çağrılır: denetleyici klibi orada durdurup sepete ekler.
 */
import { EventType, type eventWithTime } from 'rrweb';

interface SnapshotNode {
  textContent?: string;
  attributes?: Record<string, unknown>;
  childNodes?: SnapshotNode[];
  tagName?: string;
}

/** Tam anlık görüntü ağacını metin üretmeden tarar: düğüm başına sabit + metin ve öznitelik uzunlukları. */
function snapshotChars(node: SnapshotNode): number {
  let n = 0;
  const stack: SnapshotNode[] = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    n += 48 + (cur.tagName?.length ?? 0) + (cur.textContent?.length ?? 0);
    if (cur.attributes) {
      for (const k in cur.attributes) {
        const v = cur.attributes[k];
        n += k.length + 6 + (typeof v === 'string' ? v.length : 8);
      }
    }
    if (cur.childNodes) for (const c of cur.childNodes) stack.push(c);
  }
  return n;
}

/**
 * Olayın bellekteki yaklaşık boyutu (UTF-16: karakter başına 2 bayt). Tam anlık görüntüler `JSON.stringify` ile
 * ölçülmez: 5.000 düğümde ~1,4 MB'lık bir metin üretip checkout süresine ~%15 ekliyordu (NFR-PERF-01).
 */
export function estimateEventBytes(e: eventWithTime): number {
  try {
    if (e.type === EventType.FullSnapshot) {
      const data = e.data as { node?: SnapshotNode };
      if (data.node) return snapshotChars(data.node) * 2;
    }
    return JSON.stringify(e).length * 2;
  } catch {
    return 1024;
  }
}

export class ClipBuffer {
  private list: eventWithTime[] = [];
  /** Yaklaşık bellek (bayt). */
  bytes = 0;
  /** NFR-MEM-01 sınırına ulaşıldı: klip burada kesildi. */
  full = false;

  constructor(
    private readonly memoryLimit: number,
    private readonly onFull: () => void = () => {},
    private readonly sizeOf: (e: eventWithTime) => number = estimateEventBytes,
  ) {}

  push(e: eventWithTime): void {
    if (this.full) return;
    this.list.push(e);
    this.bytes += this.sizeOf(e);
    if (this.bytes > this.memoryLimit) {
      this.full = true;
      this.onFull();
    }
  }

  /** Klipteki ilk olayın zamanı (yoksa NaN). */
  get startedAt(): number {
    return this.list[0]?.timestamp ?? Number.NaN;
  }

  events(): eventWithTime[] {
    return [...this.list];
  }

  clear(): void {
    this.list = [];
    this.bytes = 0;
    this.full = false;
  }
}
