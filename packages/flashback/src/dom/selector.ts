/**
 * Benzersiz CSS seçici + yedekler (FR-REC-07, FR-MARK-02).
 *
 * Öncelik: [data-testid] → #id → [aria-label] → [name] → rol + metin (Playwright `role=` biçimi, yalnızca yedek)
 * → :nth-of-type ile yapısal CSS yolu. Birincil seçici her zaman CSS'tir ve verilen belgede tek öğe döndürür.
 */

export interface SelectorSet {
  selector: string;
  fallbackSelectors: string[];
}

const MAX_TEXT = 60;

/** CSS.escape yoksa (happy-dom, eski motorlar) için eşdeğer kaçış. */
export function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, (m, lead: string | undefined) =>
    lead ? `\\${lead.charCodeAt(lead.length - 1).toString(16)} ` : `\\${m}`,
  );
}

const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function isUnique(doc: ParentNode, sel: string, el: Element): boolean {
  try {
    const found = doc.querySelectorAll(sel);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

/** React useId (`:r1:`), uzun sayı dizileri gibi kararsız kimlikler seçici olarak kullanılmaz. */
function isStableId(id: string): boolean {
  return !!id && !/[:]/.test(id) && !/\d{4,}/.test(id) && id.length <= 64;
}

function attrSelector(el: Element, attr: string): string | null {
  const v = el.getAttribute(attr);
  if (!v || v.length > 100) return null;
  return `[${attr}=${quote(v)}]`;
}

const IMPLICIT_ROLES: Record<string, string> = {
  button: 'button',
  a: 'link',
  select: 'combobox',
  textarea: 'textbox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
};

function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.split(/\s+/)[0];
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && !el.hasAttribute('href')) return null;
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    if (type === 'checkbox' || type === 'radio') return type;
    return null;
  }
  return IMPLICIT_ROLES[tag] ?? null;
}

function accessibleText(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') return (el.getAttribute('value') ?? '').trim();
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Playwright rol seçicisi (yalnızca yedek olarak). */
function roleSelector(el: Element): string | null {
  const role = roleOf(el);
  if (!role) return null;
  const name = accessibleText(el);
  if (!name || name.length > MAX_TEXT) return null;
  return `role=${role}[name=${quote(name)}]`;
}

function nthOfType(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  // Kardeşleri diziye kopyalamadan say: uzun listelerde her tıklamada çalışır (NFR-PERF-01).
  let index = 1;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === el.tagName) index++;
  if (index > 1) return `${tag}:nth-of-type(${index})`;
  for (let s = el.nextElementSibling; s; s = s.nextElementSibling) if (s.tagName === el.tagName) return `${tag}:nth-of-type(1)`;
  return tag;
}

/** Öğenin kendisi için benzersiz olabilecek "çapa" seçicileri (öncelik sırasıyla). */
function anchorCandidates(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const out: string[] = [];
  const testId = attrSelector(el, 'data-testid');
  if (testId) out.push(testId);
  const id = el.getAttribute('id');
  if (id && isStableId(id)) out.push(`#${cssEscape(id)}`);
  const aria = attrSelector(el, 'aria-label');
  if (aria) out.push(`${tag}${aria}`);
  const name = attrSelector(el, 'name');
  if (name) out.push(`${tag}${name}`);
  return out;
}

/**
 * Yapısal yol: en yakın benzersiz çapalı ataya kadar `> tag:nth-of-type(n)` zinciri.
 * Çapa yoksa `html`'e kadar çıkar; sonuç her zaman tek öğe döndürür.
 */
function structuralPath(el: Element, doc: ParentNode, anchored: boolean): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur) {
    if (anchored && cur !== el) {
      const anchor = anchorCandidates(cur).find((s) => isUnique(doc, s, cur!));
      if (anchor) {
        parts.unshift(anchor);
        break;
      }
    }
    parts.unshift(cur.parentElement ? nthOfType(cur) : cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

export function buildSelectors(el: Element, doc: ParentNode = el.ownerDocument ?? document): SelectorSet {
  const unique: string[] = [];
  for (const c of anchorCandidates(el)) if (isUnique(doc, c, el)) unique.push(c);

  const anchoredPath = structuralPath(el, doc, true);
  const absolutePath = structuralPath(el, doc, false);
  const role = roleSelector(el);

  const ordered = [...unique, anchoredPath, absolutePath].filter((s) => isUnique(doc, s, el));
  const selector = ordered[0] ?? absolutePath;
  const fallbacks: string[] = [];
  for (const s of [...ordered.slice(1), ...(role ? [role] : [])]) {
    if (s !== selector && !fallbacks.includes(s)) fallbacks.push(s);
  }
  // Hiç yedek yoksa her düzeyde :nth-child içeren yol, birincilden farklı en az bir yedek sağlar.
  if (fallbacks.length === 0) fallbacks.push(nthChildPath(el));
  return { selector, fallbackSelectors: fallbacks.slice(0, 4) };
}

function nthChildPath(el: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const tag = cur.tagName.toLowerCase();
    parts.unshift(cur.parentElement ? `${tag}:nth-child(${Array.from(cur.parentElement.children).indexOf(cur) + 1})` : tag);
  }
  return parts.join(' > ');
}
