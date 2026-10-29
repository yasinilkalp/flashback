/**
 * rrweb ham olaylarının yük için hazırlanması (FR-REC-10, FR-RED-09):
 * - Flashback arayüz düğümleri ve derleme eklentisinin `data-flashback-source` öznitelikleri çıkarılır.
 * - Meta `href`, anlık görüntü/mutasyon öznitelikleri (URL ve kardeş-anahtar kuralları), metinler ve giriş
 *   değerleri alana uygun yöntemle gizlenir; geri kalan her şey derin `Redactor.value`'dan geçer.
 */
import type { Redactor } from '@flashback/shared';
import { EventType, IncrementalSource, type eventWithTime } from 'rrweb';
import { SOURCE_ATTR } from '../source/attr.js';
import { redactAttributes } from './html.js';

/** Flashback arayüz kökünün etiketi; rrweb'de bloklu yer tutucu olarak görünür. */
const OWN_TAG = 'flashback-devtools';

interface SnNode {
  id: number;
  type?: number;
  tagName?: string;
  attributes?: Record<string, unknown>;
  textContent?: string;
  childNodes?: SnNode[];
}

/** `data-flashback-source` olmadan öznitelikler; öznitelik yoksa aynı nesne. */
function withoutSourceAttr<T extends Record<string, unknown> | undefined>(attrs: T): T {
  if (!attrs || !(SOURCE_ATTR in attrs)) return attrs;
  const { [SOURCE_ATTR]: _dropped, ...rest } = attrs;
  return rest as T;
}

/**
 * rrweb ham olaylarından Flashback'in kendi izlerini çıkarır: arayüz düğümleri (yer tutucu ve mutasyonları, FR-REC-10)
 * ve `data-flashback-source` öznitelikleri (R13). Öznitelik paneldeki tekrar oynatmada kalır (kayıttan konum);
 * yükte gereksizdir, konum hedefte ayrıca gider ve kök dışı dosyalarda mutlak yol (kullanıcı adı) taşır.
 */
export function withoutOwnUi(events: eventWithTime[]): eventWithTime[] {
  const ids = new Set<number>();
  // Değişmeyen alt ağaçlar kopyalanmaz (5.000 düğümlük tam görüntüde kaydet yolunun belirgin bir payıydı).
  const strip = (node: SnNode): SnNode => {
    const attributes = withoutSourceAttr(node.attributes);
    let changed = attributes !== node.attributes;
    const childNodes: SnNode[] = [];
    for (const c of node.childNodes ?? []) {
      if (c.tagName === OWN_TAG) {
        ids.add(c.id);
        changed = true;
        continue;
      }
      const s = strip(c);
      if (s !== c) changed = true;
      childNodes.push(s);
    }
    if (!changed) return node;
    return { ...node, ...(node.attributes ? { attributes } : {}), ...(node.childNodes ? { childNodes } : {}) };
  };
  return events.map((e) => {
    if (e.type === EventType.FullSnapshot) {
      return { ...e, data: { ...e.data, node: strip(e.data.node as SnNode) } } as eventWithTime;
    }
    if (e.type === EventType.IncrementalSnapshot && e.data.source === IncrementalSource.Mutation) {
      const d = e.data;
      const adds = d.adds
        .filter((a) => ((a.node as SnNode).tagName === OWN_TAG ? (ids.add(a.node.id), false) : true))
        .map((a) => {
          const node = strip(a.node as SnNode);
          return node === a.node ? a : { ...a, node: node as never };
        });
      const attributes = d.attributes
        .filter((a) => !ids.has(a.id))
        .map((a) => ({ ...a, attributes: withoutSourceAttr(a.attributes) }))
        .filter((a) => Object.keys(a.attributes).length > 0);
      return { ...e, data: { ...d, adds, removes: d.removes.filter((r) => !ids.has(r.id)), attributes } } as eventWithTime;
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
