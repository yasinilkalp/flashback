import type { eventWithTime } from 'rrweb';
import { describe, expect, it } from 'vitest';
import { EventRing, MAX_SLICES } from '../src/recorder/ring.js';

const ev = (type: number, timestamp: number) => ({ type, timestamp, data: {} }) as unknown as eventWithTime;

/** rrweb'in davranışını taklit eder: her `bufferSeconds/2`'de checkout (Meta + FullSnapshot). */
function simulate(ring: EventRing, bufferSeconds: number, totalMs: number, stepMs = 250) {
  const checkoutMs = (bufferSeconds * 1000) / 2;
  let lastCheckout = 0;
  ring.push(ev(4, 0));
  ring.push(ev(2, 0));
  for (let t = stepMs; t <= totalMs; t += stepMs) {
    if (t - lastCheckout > checkoutMs) {
      lastCheckout = t;
      ring.push(ev(4, t), true);
      ring.push(ev(2, t), true);
    } else ring.push(ev(3, t));
  }
}

describe('EventRing (FR-REC-02, NFR-MEM-01)', () => {
  it('always holds at least bufferSeconds of history once that much was recorded', () => {
    for (const openAt of [61_000, 75_000, 90_250, 133_000, 300_000, 600_500]) {
      const evicted: number[] = [];
      const ring = new EventRing(50 * 1024 * 1024, (s) => evicted.push(s), () => 100);
      simulate(ring, 60, openAt);
      expect(ring.durationMs(openAt), `t=${openAt}`).toBeGreaterThanOrEqual(60_000);
      const events = ring.events();
      expect(events[0].type).toBe(4); // pencere her zaman bir Meta + tam anlık görüntü ile başlar
      expect(events.filter((e) => e.type === 4).length).toBeLessThanOrEqual(MAX_SLICES);
      if (openAt > 120_000) expect(ring.evicted).toBe(true);
    }
  });

  it('drops the oldest slice and raises the warning when over the memory limit', () => {
    const ring = new EventRing(1000, () => {}, () => 300);
    ring.push(ev(4, 0));
    ring.push(ev(2, 0));
    ring.push(ev(4, 10), true);
    ring.push(ev(2, 10), true);
    expect(ring.memoryWarning).toBe(true);
    expect(ring.events()[0].timestamp).toBe(10);
    expect(ring.windowStart).toBe(10);
  });
});
