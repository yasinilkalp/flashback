import { describe, expect, it } from 'vitest';
import { withoutOwnUi } from '../src/draft/events.js';

const full = () => ({
  type: 2,
  timestamp: 1,
  data: {
    initialOffset: { left: 0, top: 0 },
    node: {
      id: 1,
      type: 0,
      childNodes: [
        {
          id: 2,
          type: 2,
          tagName: 'html',
          childNodes: [
            { id: 3, type: 2, tagName: 'head', childNodes: [{ id: 4, type: 2, tagName: 'title', childNodes: [] }] },
            {
              id: 5,
              type: 2,
              tagName: 'body',
              childNodes: [
                { id: 6, type: 2, tagName: 'ul', childNodes: [{ id: 7, type: 2, tagName: 'li', childNodes: [] }] },
                { id: 8, type: 2, tagName: 'flashback-devtools', childNodes: [] },
              ],
            },
          ],
        },
      ],
    },
  },
});

describe('withoutOwnUi (FR-REC-10)', () => {
  it('Flashback kökünü ve mutasyonlarını çıkarır, girdiyi değiştirmez, değişmeyen alt ağaçları kopyalamaz', () => {
    const snap = full();
    const before = JSON.stringify(snap);
    const mutation = {
      type: 3,
      timestamp: 2,
      data: {
        source: 0,
        texts: [],
        adds: [{ parentId: 5, nextId: null, node: { id: 9, type: 2, tagName: 'flashback-devtools', childNodes: [] } }],
        removes: [{ parentId: 5, id: 8 }, { parentId: 6, id: 7 }],
        attributes: [{ id: 8, attributes: { open: '' } }, { id: 6, attributes: { class: 'x' } }],
      },
    };
    const [s, m] = withoutOwnUi([snap, mutation] as never) as unknown as [ReturnType<typeof full>, typeof mutation];
    expect(JSON.stringify(snap)).toBe(before);
    expect(JSON.stringify(s)).not.toContain('flashback-devtools');
    const html = s.data.node.childNodes[0];
    // head ve ul değişmedi → aynı nesne; body ve üstü yeni nesne.
    expect(html.childNodes[0]).toBe(snap.data.node.childNodes[0].childNodes[0]);
    expect(html.childNodes[1].childNodes[0]).toBe(snap.data.node.childNodes[0].childNodes[1].childNodes[0]);
    expect(html).not.toBe(snap.data.node.childNodes[0]);
    expect(m.data.adds).toEqual([]);
    expect(m.data.removes).toEqual([{ parentId: 6, id: 7 }]);
    expect(m.data.attributes).toEqual([{ id: 6, attributes: { class: 'x' } }]);
  });

  it('Flashback kökü yoksa tam görüntü ağacı olduğu gibi kalır', () => {
    const snap = full();
    snap.data.node.childNodes[0].childNodes[1].childNodes.pop();
    const [s] = withoutOwnUi([snap] as never) as unknown as [ReturnType<typeof full>];
    expect(s.data.node).toBe(snap.data.node);
  });
});

describe('withoutOwnUi: data-flashback-source (R13)', () => {
  it('özniteliği tam görüntüden, eklenen düğümlerden ve öznitelik mutasyonlarından çıkarır; öznitelikli olmayan alt ağaçlar aynı nesne', () => {
    const snap = full();
    const body = snap.data.node.childNodes[0].childNodes[1];
    Object.assign(body.childNodes[0], { attributes: { class: 'list', 'data-flashback-source': 'src/A.tsx:3:5' } });
    Object.assign(body.childNodes[0].childNodes[0], { attributes: { 'data-flashback-source': 'C:/Users/u/lib/B.tsx:1:1' } });
    const before = JSON.stringify(snap);
    const mutation = {
      type: 3,
      timestamp: 2,
      data: {
        source: 0,
        texts: [],
        adds: [{ parentId: 6, nextId: null, node: { id: 10, type: 2, tagName: 'li', attributes: { 'data-flashback-source': 'src/A.tsx:4:7' }, childNodes: [] } }],
        removes: [],
        attributes: [{ id: 7, attributes: { 'data-flashback-source': 'src/A.tsx:5:7' } }, { id: 6, attributes: { class: 'y', 'data-flashback-source': 'src/A.tsx:3:5' } }],
      },
    };
    const [s, m] = withoutOwnUi([snap, mutation] as never) as unknown as [ReturnType<typeof full>, typeof mutation];
    expect(JSON.stringify(snap)).toBe(before);
    expect(JSON.stringify([s, m])).not.toContain('data-flashback-source');
    const ul = s.data.node.childNodes[0].childNodes[1].childNodes[0] as { attributes?: object; childNodes: Array<{ attributes?: object }> };
    expect(ul.attributes).toEqual({ class: 'list' });
    expect(ul.childNodes[0].attributes).toEqual({});
    expect(s.data.node.childNodes[0].childNodes[0]).toBe(snap.data.node.childNodes[0].childNodes[0]);
    expect(m.data.adds[0].node).toEqual({ id: 10, type: 2, tagName: 'li', attributes: {}, childNodes: [] });
    expect(m.data.attributes).toEqual([{ id: 6, attributes: { class: 'y' } }]);
  });
});
