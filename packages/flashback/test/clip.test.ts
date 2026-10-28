import type { eventWithTime } from 'rrweb';
import { describe, expect, it } from 'vitest';
import { ClipBuffer } from '../src/recorder/clip.js';

const ev = (type: number, timestamp: number) => ({ type, timestamp, data: {} }) as unknown as eventWithTime;

describe('ClipBuffer (FR-REC-02, NFR-MEM-01)', () => {
  it('keeps the whole clip from its first event; nothing is evicted', () => {
    const clip = new ClipBuffer(50 * 1024 * 1024, () => {}, () => 100);
    for (let t = 0; t <= 600_000; t += 250) clip.push(ev(t === 0 ? 4 : 3, t));
    expect(clip.startedAt).toBe(0);
    expect(clip.events()).toHaveLength(2401);
    expect(clip.full).toBe(false);
  });

  it('stops taking events and calls onFull once when over the memory limit', () => {
    let calls = 0;
    const clip = new ClipBuffer(1000, () => calls++, () => 300);
    for (let t = 0; t < 10; t++) clip.push(ev(3, t));
    expect(calls).toBe(1);
    expect(clip.full).toBe(true);
    expect(clip.events()).toHaveLength(4);
    clip.clear();
    expect([clip.full, clip.bytes, clip.events().length, Number.isNaN(clip.startedAt)]).toEqual([false, 0, 0, true]);
  });
});

describe('estimateEventBytes', () => {
  it('tam anlık görüntüyü serileştirmeden JSON boyutuna yakın tahmin eder', async () => {
    const { estimateEventBytes } = await import('../src/recorder/clip.js');
    const rows = Array.from({ length: 500 }, (_, i) => ({
      type: 2,
      tagName: 'li',
      id: i + 10,
      attributes: { class: 'row', 'data-id': String(i) },
      childNodes: [{ type: 3, textContent: `Satır ${i} — ürün açıklaması`, id: i + 10_000 }],
    }));
    const full = { type: 2, timestamp: 1, data: { node: { type: 0, id: 1, childNodes: [{ type: 2, tagName: 'ul', id: 2, attributes: {}, childNodes: rows }] }, initialOffset: { top: 0, left: 0 } } } as unknown as eventWithTime;
    const exact = JSON.stringify(full).length * 2;
    const est = estimateEventBytes(full);
    expect(est / exact).toBeGreaterThan(0.6);
    expect(est / exact).toBeLessThan(1.6);
  });
});
