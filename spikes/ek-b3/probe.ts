/**
 * Sayfaya enjekte edilen ölçüm betiği. Panelin kullandığı kodu (fiber okuma + `locateSource` + `SourceResolver`)
 * aynen çalıştırır ve her etiketli öğe için sonucu döndürür. `measure.mjs` bunu esbuild ile IIFE olarak paketler.
 */
import { getFiber, sourceHint, type Fiber } from '../../packages/flashback/src/dom/fiber.js';
import { pageResolverOptions } from '../../packages/flashback/src/source/environment.js';
import { locateSource } from '../../packages/flashback/src/source/locate.js';
import { isLocalSource, SourceResolver } from '../../packages/flashback/src/source/sourcemap.js';

const resolver = new SourceResolver(
  async (url) => {
    const res = await fetch(url);
    return res.ok ? res.text() : null;
  },
  (url) => isLocalSource(url, location.origin),
  pageResolverOptions(),
);

/** Hata ayıklama için: ataları da dahil ilk yığın/debugSource. */
function rawStack(fiber: Fiber | null): string | undefined {
  for (let f = fiber; f; f = f.return) {
    if (f._debugStack?.stack) return f._debugStack.stack.slice(0, 1500);
    if (f._debugSource) return JSON.stringify(f._debugSource);
  }
  return undefined;
}

const texts = new Map<string, Promise<string | null>>();

/** Teşhis: çerçeve konumundaki derlenmiş kod (yalnızca getirilebilen http betikleri). */
async function compiledAt(url: string, line: number, column: number): Promise<string | undefined> {
  if (!/^https?:/.test(url)) return undefined;
  let p = texts.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.text() : null));
    texts.set(url, p);
  }
  const code = await p;
  return code?.split('\n')[line - 1]?.slice(Math.max(0, column - 1), column + 39);
}

async function run() {
  const out = [];
  for (const el of Array.from(document.querySelectorAll('[data-ekb3],[data-ekb3-rsc]'))) {
    const rsc = el.hasAttribute('data-ekb3-rsc');
    const fiber = getFiber(el);
    const hint = sourceHint(fiber);
    let loc;
    let error: string | undefined;
    try {
      loc = await locateSource(el, resolver);
    } catch (e) {
      error = String(e);
    }
    const mapped = loc?.snippet?.lines[loc.line - loc.snippet.startLine];
    out.push({
      expected: el.getAttribute(rsc ? 'data-ekb3-rsc' : 'data-ekb3'),
      kind: rsc ? 'rsc' : 'client',
      tag: el.tagName.toLowerCase(),
      hasFiber: !!fiber,
      hint: hint && (hint.kind === 'stack' ? { kind: 'stack', ...hint.frame } : hint),
      compiled: hint?.kind === 'stack' ? await compiledAt(hint.frame.url, hint.frame.line, hint.frame.column) : undefined,
      loc: loc && { file: loc.file, line: loc.line, column: loc.column, resolved: loc.resolved, reason: loc.reason, mapped: mapped?.slice(Math.max(0, loc.column - 1), loc.column + 30) },
      error,
      rawStack: rawStack(fiber),
    });
  }
  return out;
}

(window as unknown as { __ekb3: unknown }).__ekb3 = { run };
