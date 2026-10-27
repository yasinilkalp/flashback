/**
 * rrweb ham olaylarının yük için hazırlanması (FR-REC-10, FR-RED-09):
 * - Rewind arayüz düğümleri çıkarılır.
 * - Meta `href`, anlık görüntü/mutasyon öznitelikleri (URL ve kardeş-anahtar kuralları), metinler ve giriş
 *   değerleri alana uygun yöntemle gizlenir; geri kalan her şey derin `Redactor.value`'dan geçer.
 */
import type { Redactor } from '@rewind/shared';
import { EventType, IncrementalSource, type eventWithTime } from 'rrweb';
import { redactAttributes } from './html.js';

/** Rewind arayüz kökünün etiketi; rrweb'de bloklu yer tutucu olarak görünür. */
const OWN_TAG = 'rewind-devtools';

interface SnNode {
  id: number;
  type?: number;
  tagName?: string;
  attributes?: Record<string, unknown>;
  textContent?: string;
  childNodes?: SnNode[];
}

/** rrweb ham olaylarından Rewind arayüz düğümlerini (yer tutucu ve mutasyonları) çıkarır (FR-REC-10). */
export function withoutOwnUi(events: eventWithTime[]): eventWithTime[] {
  const ids = new Set<number>();
  // Değişmeyen alt ağaçlar kopyalanmaz (5.000 düğümlük tam görüntüde kaydet yolunun belirgin bir payıydı).
  const strip = (node: SnNode): SnNode => {
    if (!node.childNodes) return node;
    let changed = false;
    const childNodes: SnNode[] = [];
    for (const c of node.childNodes) {
      if (c.tagName === OWN_TAG) {
        ids.add(c.id);
        changed = true;
        continue;
      }
      const s = strip(c);
      if (s !== c) changed = true;
      childNodes.push(s);
    }
    return changed ? { ...node, childNodes } : node;
  };
  return events.map((e) => {
    if (e.type === EventType.FullSnapshot) {
      return { ...e, data: { ...e.data, node: strip(e.data.node as SnNode) } } as eventWithTime;
    }
    if (e.type === EventType.IncrementalSnapshot && e.data.source === IncrementalSource.Mutation) {
      const d = e.data;
      const adds = d.adds.filter((a) => ((a.node as SnNode).tagName === OWN_TAG ? (ids.add(a.node.id), false) : true));
      return {
        ...e,
        data: { ...d, adds, removes: d.removes.filter((r) => !ids.has(r.id)), attributes: d.attributes.filter((a) => !ids.has(a.id)) },
      } as eventWithTime;
    }
    return e;
  });
}

function redactNode(node: SnNode, r: Redactor): SnNode {
  return {
    ...node,
    ...(node.attributes ? { attributes: redactAttributes(node.attributes, r) } : {}),
    ...(typeof node.textContent === 'string' ? { textContent: r.text(node.textContent) } : {}),
    ...(node.childNodes ? { childNodes: node.childNodes.map((c) => redactNode(c, r)) } : {}),
  };
}

export function redactEvents(events: eventWithTime[], r: Redactor): eventWithTime[] {
  if (!r.enabled) return events;
  return events.map((e): eventWithTime => {
    switch (e.type) {
      case EventType.Meta:
        return { ...e, data: { ...e.data, href: r.url(e.data.href) } };
      case EventType.FullSnapshot:
        return { ...e, data: { ...e.data, node: redactNode(e.data.node as SnNode, r) as never } };
      case EventType.IncrementalSnapshot: {
        const d = e.data;
        if (d.source === IncrementalSource.Mutation) {
          return {
            ...e,
            data: {
              ...d,
              adds: d.adds.map((a) => ({ ...a, node: redactNode(a.node as SnNode, r) as never })),
              attributes: d.attributes.map((a) => ({ ...a, attributes: redactAttributes(a.attributes, r) })),
              texts: d.texts.map((t) => ({ ...t, value: t.value === null ? null : r.text(t.value) })),
            },
          };
        }
        if (d.source === IncrementalSource.Input) return { ...e, data: { ...d, text: r.text(d.text) } };
        return r.value(e);
      }
      default:
        return r.value(e);
    }
  });
}
