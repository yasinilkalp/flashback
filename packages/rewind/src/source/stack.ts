/** Yığın izi ayrıştırma (V8/Chromium ve SpiderMonkey/JavaScriptCore biçimleri). */

export interface StackFrame {
  fn?: string;
  url: string;
  line: number;
  column: number;
}

// "    at Cart (http://localhost:5173/src/Cart.tsx?t=1:52:7)"  |  "    at http://x/a.js:1:2"
// URL parantez içerebilir: "webpack-internal:///(app-pages-browser)/./src/a.tsx", boşluk içeremez.
const V8_RE = /^\s*at\s+(?:(.*?)\s+\()?((?:[a-z][a-z0-9+.-]*:)?\/{0,3}[^\s]*?):(\d+):(\d+)\)?\s*$/i;
// "Cart@http://localhost:5173/src/Cart.tsx:52:7"
const GECKO_RE = /^\s*(.*?)@(.*?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const m = V8_RE.exec(line) ?? (line.includes('@') ? GECKO_RE.exec(line) : null);
    if (!m) continue;
    const url = m[2];
    if (!url || url === '<anonymous>' || url.startsWith('native')) continue;
    frames.push({ fn: m[1] || undefined, url, line: Number(m[3]), column: Number(m[4]) });
  }
  return frames;
}

/**
 * React, react-dom, bağımlılık önbelleği ve Rewind'in kendi çerçeveleri. Turbopack bağımlılık chunk'larını
 * `node_modules_…` / `…_next_dist_…` adıyla verir; kullanıcı koduyla aynı chunk'a düşen bağımlılıklar ise ancak
 * source map çözümlemesinden sonra ayırt edilir (`isDependencyPath`).
 */
const INTERNAL_URL_RE =
  /\/node_modules\/|\/\.vite\/deps\/|\/@react-refresh|react-dom|react_jsx|jsx-dev-runtime|jsx-runtime|\/rewind-devtools\/|\/packages\/rewind\/(?:dist|src)\/|webpack-internal:\/\/\/.*node_modules|\/_next\/static\/chunks\/(?:framework|main|webpack)|\/_next\/static\/chunks\/[^?#]*(?:node_modules_|next_dist_)/;
const INTERNAL_FN_RE = /^(?:Object\.)?(?:react[-_]stack[-_](?:top|bottom)[-_]frame|exports\.jsx(?:s|DEV)?|jsxDEV|jsxs?|createElement|fakeJSXCallSite)$/;

export function isInternalFrame(f: StackFrame): boolean {
  return INTERNAL_URL_RE.test(f.url) || (!!f.fn && INTERNAL_FN_RE.test(f.fn));
}

/** Kullanıcı çerçeveleri, yığındaki sırayla (React/bağımlılık çerçeveleri atlanır). */
export function userFrames(stack: string | undefined): StackFrame[] {
  return parseStack(stack).filter((f) => !isInternalFrame(f));
}

/** İlk kullanıcı çerçevesi. */
export function firstUserFrame(stack: string | undefined): StackFrame | null {
  return userFrames(stack)[0] ?? null;
}

/** Çözülmüş kaynak yolu bir bağımlılığa mı ait? (source map'ten sonra; örn. Turbopack'te ortak chunk) */
export function isDependencyPath(file: string): boolean {
  return /(?:^|[\\/])node_modules[\\/]/.test(file);
}

/**
 * React Server Components çerçevesi: Flight istemcisi sunucu yığınını
 * `about://React/Server/<dosya>?<n>` (eski sürümlerde `rsc://React/Server/…`) adlı sahte fonksiyonlarla yeniden kurar.
 * Dönüş: sunucudaki derlenmiş dosyanın adı (URL kodlaması çözülmüş), değilse null.
 */
export function serverComponentFile(url: string): string | null {
  const m = /^(?:about|rsc):\/\/React\/[^/]+\/(.*?)(?:\?\d+)?$/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
