/** Yığın izi ayrıştırma (V8/Chromium ve SpiderMonkey/JavaScriptCore biçimleri). */

export interface StackFrame {
  fn?: string;
  url: string;
  line: number;
  column: number;
}

// "    at Cart (http://localhost:5173/src/Cart.tsx?t=1:52:7)"  |  "    at http://x/a.js:1:2"
const V8_RE = /^\s*at\s+(?:(.*?)\s+\()?((?:[a-z][a-z0-9+.-]*:)?\/{0,3}[^\s()]*?):(\d+):(\d+)\)?\s*$/i;
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

/** React, react-dom, bağımlılık önbelleği ve Rewind'in kendi çerçeveleri. */
const INTERNAL_URL_RE =
  /\/node_modules\/|\/\.vite\/deps\/|\/@react-refresh|react-dom|react_jsx|jsx-dev-runtime|jsx-runtime|\/rewind-devtools\/|\/packages\/rewind\/(?:dist|src)\/|webpack-internal:\/\/\/.*node_modules|\/_next\/static\/chunks\/(?:framework|main|webpack)/;
const INTERNAL_FN_RE = /^(?:Object\.)?(?:react[-_]stack[-_](?:top|bottom)[-_]frame|exports\.jsxDEV|jsxDEV|jsxs?|createElement)$/;

export function isInternalFrame(f: StackFrame): boolean {
  return INTERNAL_URL_RE.test(f.url) || (!!f.fn && INTERNAL_FN_RE.test(f.fn));
}

/** İlk kullanıcı çerçevesi (React/bağımlılık çerçeveleri atlanır). */
export function firstUserFrame(stack: string | undefined): StackFrame | null {
  return parseStack(stack).find((f) => !isInternalFrame(f)) ?? null;
}
