/**
 * Props/state/store/konsol argümanları için güvenli serileştirme (FR-MARK-05).
 * Derinlik, anahtar, dizi ve metin sınırları uygular; döngüleri, işlevleri, React öğelerini ve DOM düğümlerini
 * JSON'a güvenli yer tutuculara çevirir.
 */

export interface SerializeLimits {
  depth: number;
  keys: number;
  items: number;
  string: number;
}

export const DEFAULT_SERIALIZE_LIMITS: SerializeLimits = { depth: 6, keys: 50, items: 50, string: 2000 };

const REACT_ELEMENT_TYPES = new Set(['react.element', 'react.transitional.element', 'react.portal']);

function isReactElement(v: object): boolean {
  const t = (v as { $$typeof?: unknown }).$$typeof;
  return typeof t === 'symbol' && REACT_ELEMENT_TYPES.has(t.description ?? '');
}

function isDomNode(v: object): v is Node {
  return typeof Node !== 'undefined' && v instanceof Node;
}

export function safeSerialize(value: unknown, limits: SerializeLimits = DEFAULT_SERIALIZE_LIMITS): unknown {
  const seen = new WeakSet<object>();

  const walk = (v: unknown, depth: number): unknown => {
    if (v === null) return null;
    switch (typeof v) {
      case 'string':
        return v.length > limits.string ? `${v.slice(0, limits.string)}…[+${v.length - limits.string}]` : v;
      case 'number':
        return Number.isFinite(v) ? v : String(v);
      case 'boolean':
        return v;
      case 'undefined':
        return '[undefined]';
      case 'bigint':
        return `${v.toString()}n`;
      case 'symbol':
        return v.toString();
      case 'function':
        return `[Function ${v.name || 'anonymous'}]`;
    }
    const obj = v as object;
    if (isReactElement(obj)) return '<Element>';
    if (isDomNode(obj)) return `<Node ${obj.nodeName.toLowerCase()}>`;
    if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString();
    if (obj instanceof RegExp) return obj.toString();
    if (obj instanceof Error) return { name: obj.name, message: walk(obj.message, depth + 1) };
    if (seen.has(obj)) return '[Circular]';
    if (depth >= limits.depth) return Array.isArray(obj) ? `[Array(${obj.length})]` : '[Object]';
    seen.add(obj);
    try {
      if (Array.isArray(obj)) {
        const out = obj.slice(0, limits.items).map((x) => walk(x, depth + 1));
        if (obj.length > limits.items) out.push(`…[+${obj.length - limits.items}]`);
        return out;
      }
      if (obj instanceof Map) {
        return walk(Object.fromEntries(Array.from(obj.entries()).slice(0, limits.items).map(([k, x]) => [String(k), x])), depth);
      }
      if (obj instanceof Set) return walk(Array.from(obj), depth);
      if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) return `[Binary ${(obj as ArrayBuffer).byteLength} B]`;
      const out: Record<string, unknown> = {};
      let n = 0;
      for (const k of Object.keys(obj)) {
        if (n++ >= limits.keys) {
          out['…'] = `+${Object.keys(obj).length - limits.keys} anahtar`;
          break;
        }
        let x: unknown;
        try {
          x = (obj as Record<string, unknown>)[k];
        } catch {
          x = '[Getter hatası]';
        }
        out[k] = walk(x, depth + 1);
      }
      return out;
    } finally {
      seen.delete(obj);
    }
  };

  return walk(value, 0);
}

/** Konsol argümanlarını tek satırlık iletiye çevirir. */
export function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(safeSerialize(a, { depth: 3, keys: 20, items: 20, string: 500 }));
      } catch {
        return String(a);
      }
    })
    .join(' ');
}
