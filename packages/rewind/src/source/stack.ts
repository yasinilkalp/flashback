/** Yığın izi ayrıştırma (V8/Chromium ve SpiderMonkey/JavaScriptCore biçimleri). */

export interface StackFrame {
  fn?: string;
  url: string;
  line: number;
  column: number;
}

// "    at Cart (http://localhost:5173/src/Cart.tsx?t=1:52:7)"  |  "    at http://x/a.js:1:2"
// URL parantez içerebilir: "at Shop (webpack-internal:///(app-pages-browser)/./app/Shop.tsx:54:87)" (Next webpack).
const V8_RE = /^\s*at\s+(?:(.*?)\s+\()?(\S+?):(\d+):(\d+)\)?\s*$/;
// "Cart@http://localhost:5173/src/Cart.tsx:52:7"  |  "@http://x/a.js:1:2"  |  "Cart/<@http://x/a.js:1:2"  |  "async*f@…"
const GECKO_RE = /^\s*(.*?)@(\S+?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const m = V8_RE.exec(line) ?? (line.includes('@') && !/^\s*at\s/.test(line) ? GECKO_RE.exec(line) : null);
    if (!m) continue;
    const url = m[2];
    // eval çerçeveleri ("eval at f (…)", Firefox "a.js line 2 > eval") ve yerel kod çözülmez.
    if (!url || url === '<anonymous>' || url.startsWith('native') || url.startsWith('[native')) continue;
    const fn = (m[1] ?? '').replace(/^async\*/, '').trim();
    frames.push({ fn: fn || undefined, url, line: Number(m[3]), column: Number(m[4]) });
  }
  return frames;
}

/**
 * React, react-dom, React Flight (RSC istemcisi), bağımlılık önbelleği ve Rewind'in kendi çerçeveleri.
 * Yalnızca URL'den anlaşılabilenler; Turbopack gibi karma adlı parçalar çözümlemeden sonra
 * {@link isInternalSource} ile elenir.
 */
const INTERNAL_URL_RE =
  /\/node_modules\/|\/\.vite\/deps\/|\/@react-refresh|react-dom|react-server-dom|react_jsx|jsx-dev-runtime|jsx-runtime|\/rewind-devtools\/|\/packages\/rewind\/(?:dist|src)\/|webpack-internal:\/\/\/.*node_modules|\/_next\/static\/chunks\/(?:framework|main|webpack|polyfills)|\/_next\/static\/chunks\/[^/]*node_modules_/;
const INTERNAL_FN_RE =
  /^(?:Object\.)?(?:react[-_]stack[-_](?:top|bottom)[-_]frame|exports\.jsxDEV|jsxDEV|jsxs?|createElement|fakeJSXCallSite)$/;

export function isInternalFrame(f: StackFrame): boolean {
  return INTERNAL_URL_RE.test(f.url) || (!!f.fn && INTERNAL_FN_RE.test(f.fn));
}

/** Çözülmüş orijinal kaynak yolu bağımlılık / çerçeve kodu mu (node_modules, Rewind, paketleyici çalışma zamanı)? */
const INTERNAL_SOURCE_RE =
  /(?:^|[\\/])node_modules[\\/]|(?:^|\/)packages\/rewind\/(?:dist|src)\/|(?:^|\/)rewind-devtools\/|^webpack\/(?:bootstrap|runtime)|^\[turbopack\]|turbopack:\/\/\/\[turbopack\]|\/\.vite\/deps\//;

export function isInternalSource(file: string): boolean {
  return INTERNAL_SOURCE_RE.test(file.replace(/\\/g, '/'));
}

/**
 * Bir öğenin `_debugStack`'inden JSX'in yazıldığı yere ait olabilecek çerçeveler.
 * - `react_stack_bottom_frame` sonrasındaki çerçeveler React'in iş döngüsüne ya da modül yükleme zincirine aittir
 *   (webpack/Turbopack'te içe aktaran kullanıcı modülleri bile görünebilir); atılır.
 * - React 19, saniyede 10 000'den fazla öğe oluşturulduğunda gerçek yığın yerine paylaşılan `UnknownOwner`
 *   yığınını verir; bu yığın öğe hakkında bilgi taşımaz → çerçeve yok (yanlış satır vermemek için).
 */
export function elementFrames(stack: string | undefined): StackFrame[] {
  const frames = parseStack(stack);
  if (frames.some((f) => !!f.fn && /(?:^|\.)UnknownOwner$/.test(f.fn))) return [];
  const bottom = frames.findIndex((f) => !!f.fn && /(?:^|\.)react[-_]stack[-_]bottom[-_]frame$/.test(f.fn));
  return (bottom === -1 ? frames : frames.slice(0, bottom)).filter((f) => !isInternalFrame(f));
}

/** Kullanıcı çerçevesi olabilecek tüm çerçeveler, sırasıyla (React/bağımlılık çerçeveleri atlanır). */
export function userFrames(stack: string | undefined): StackFrame[] {
  return parseStack(stack).filter((f) => !isInternalFrame(f));
}

/** İlk kullanıcı çerçevesi (React/bağımlılık çerçeveleri atlanır). */
export function firstUserFrame(stack: string | undefined): StackFrame | null {
  return userFrames(stack)[0] ?? null;
}
