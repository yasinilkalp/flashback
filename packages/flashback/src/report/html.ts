/**
 * DOM öznitelikleri ve HTML için gizleme (Ek C: öznitelik anahtarı + desen + sağlama). Aynı kurallar DOM anlık
 * görüntüsüne, `target.html`'e ve rrweb anlık görüntü düğümlerine uygulanır.
 */
import type { Redactor } from '../redact.js';

const OWN_UI = 'flashback-devtools, [data-flashback-ui]';

/** Değeri URL olan öznitelikler: sorgu/fragment parametreleri anahtar adına göre gizlenir. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href', 'background', 'ping']);
/** Değeri, kardeş `name`/`id`/`property` özniteliğinin anlattığı veri olan öznitelikler. */
const VALUE_ATTRS = new Set(['content', 'value']);
const NAME_ATTRS = ['name', 'id', 'property', 'itemprop', 'http-equiv'];

/**
 * Bir öğenin öznitelik haritasını gizler. `<meta name="csrf-token" content>` ve
 * `<input type="hidden" name="authenticity_token" value>` gibi durumlarda anahtar kardeş öznitelikten okunur.
 * Dize olmayan değerler (rrweb'in stil nesneleri, `null` silmeleri) dokunulmadan geçer.
 */
export function redactAttributes<T extends Record<string, unknown>>(attrs: T, r: Redactor): T {
  if (!r.enabled) return attrs;
  const sensitiveName = NAME_ATTRS.map((n) => attrs[n]).find((v): v is string => typeof v === 'string' && !!r.keyType(v));
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    const lower = name.toLowerCase();
    if (typeof value !== 'string' || !value) out[name] = value;
    else if (URL_ATTRS.has(lower)) out[name] = r.url(value);
    // Anahtar kardeş öznitelikten gelir; Redactor onu sayar ve türüyle işaretler.
    else if (VALUE_ATTRS.has(lower) && sensitiveName) out[name] = r.value({ [sensitiveName]: value })[sensitiveName];
    else out[name] = r.value({ [name]: value })[name];
  }
  return out as T;
}

export function redactElementHtml(el: Element, r: Redactor): string {
  const clone = el.cloneNode(true) as Element;
  for (const own of Array.from(clone.querySelectorAll(OWN_UI))) own.remove();
  for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    const attrs = Object.fromEntries(Array.from(node.attributes, (a) => [a.name, a.value]));
    const redacted = redactAttributes(attrs, r);
    for (const [name, value] of Object.entries(redacted)) if (value !== attrs[name]) node.setAttribute(name, value);
  }
  // NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
  const walker = clone.ownerDocument.createTreeWalker(clone, 0x4 | 0x80);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const data = (n as CharacterData).data;
    const red = r.text(data);
    if (red !== data) (n as CharacterData).data = red;
  }
  return clone.outerHTML;
}
