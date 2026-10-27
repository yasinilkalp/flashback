import { SourceMapGenerator } from 'source-map-js';
import { describe, expect, it } from 'vitest';
import type { Fiber } from '../src/dom/fiber.js';
import { locateSource } from '../src/source/locate.js';
import { isLocalSource, nextDevSourceMapUrl, SourceResolver } from '../src/source/sourcemap.js';

const PAGE = 'http://127.0.0.1:3000';
const fiber = (over: Partial<Fiber>, parent: Fiber | null = null): Fiber => ({ tag: 5, type: 'div', return: parent, ...over });
const stack = (...frames: string[]) => ({ stack: ['Error: react-stack-top-frame', ...frames.map((f) => `    at ${f}`)].join('\n') });

/** Derlenmiş (satır 1, sütun 0) → `source`:`line` eşleyen satır içi haritalı betik. */
function script(source: string, line: number): string {
  const gen = new SourceMapGenerator({ file: 'x.js' });
  gen.addMapping({ generated: { line: 1, column: 0 }, original: { line, column: 4 }, source });
  gen.setSourceContent(source, Array.from({ length: line + 5 }, (_, i) => `l${i + 1}`).join('\n'));
  return `x\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(gen.toString()).toString('base64')}`;
}

function resolverFor(files: Record<string, string>, next = true) {
  const fetched: string[] = [];
  const resolver = new SourceResolver(
    async (u) => (fetched.push(u), files[u] ?? null),
    (u) => isLocalSource(u, PAGE),
    { mapUrlFor: (u) => (next ? nextDevSourceMapUrl(u, PAGE) : null) },
  );
  return { resolver, fetched };
}

const chunk = (name: string) => `${PAGE}/_next/static/chunks/${name}`;

describe('locateSource (FR-MARK-04/11, EK-B3)', () => {
  it('skips frames that resolve into dependency code (hashed Turbopack chunk) and uses the next user frame', async () => {
    const { resolver } = resolverFor({
      [chunk('_0pfk._.js')]: script('file:///home/u/app/node_modules/some-lib/dist/index.js', 40),
      [chunk('app_components._.js')]: script('file:///home/u/app/app/components/Cart.tsx', 27),
    });
    const host = fiber({ _debugStack: stack(`wrap (${chunk('_0pfk._.js')}:1:1)`, `Cart (${chunk('app_components._.js')}:1:1)`) });
    const { location, note } = await locateSource(host, resolver);
    expect(location).toMatchObject({ file: '/home/u/app/app/components/Cart.tsx', line: 27, resolved: true });
    expect(location!.snippet?.lines).toContain('l27');
    expect(note).toBeUndefined();
  });

  it('resolves an RSC element through the Next dev source-map endpoint and says it is a server component', async () => {
    const filename = 'file:///home/u/app/.next/server/chunks/ssr/page._.js';
    const map = JSON.parse(Buffer.from(script('file:///home/u/app/app/page.tsx', 13).split('base64,')[1], 'base64').toString());
    const { resolver } = resolverFor({ [nextDevSourceMapUrl(`about://React/Server/${filename}?5`, PAGE)!]: JSON.stringify(map) });
    const h1 = fiber({
      _debugOwner: { name: 'Page', env: 'Server' },
      _debugStack: stack(`fakeJSXCallSite (${chunk('node_modules_next_dist_compiled_react-server-dom-turbopack_x._.js')}:1:1)`, `Page (about://React/Server/${filename}?5:1:1)`),
    });
    const { location, note } = await locateSource(h1, resolver);
    expect(location).toMatchObject({ file: '/home/u/app/app/page.tsx', line: 13, resolved: true });
    expect(note).toContain('React Server Component');
  });

  it('never walks from an unresolvable RSC element to a client ancestor (would be a wrong line)', async () => {
    const { resolver } = resolverFor({ [chunk('providers._.js')]: script('file:///home/u/app/app/providers.tsx', 5) }, false);
    const providers = fiber({ tag: 0, type: function Providers() {}, _debugStack: stack(`Providers (${chunk('providers._.js')}:1:1)`) });
    const h1 = fiber({ _debugOwner: { name: 'Page', env: 'Server' }, _debugStack: stack('Page (about://React/Server/file:///srv/page.js?1:3:4)') }, providers);
    const { location, note } = await locateSource(h1, resolver);
    expect(location).toMatchObject({ resolved: false, file: 'about://React/Server/file:///srv/page.js?1', line: 3 });
    expect(note).toContain('React Server Component');
    // Yığını hiç olmayan RSC öğesi: konum yok, açıklama var.
    const bare = fiber({ _debugOwner: { name: 'Page', env: 'Server' } }, providers);
    expect(await locateSource(bare, resolver)).toEqual({ note: expect.stringContaining('React Server Component') });
  });

  it('does not guess: the first possibly-user frame that cannot be resolved returns resolved:false', async () => {
    const { resolver } = resolverFor({ [chunk('b.js')]: script('file:///home/u/app/app/B.tsx', 9) });
    const el = fiber({ _debugStack: stack(`A (${chunk('a.js')}:1:1)`, `B (${chunk('b.js')}:1:1)`) });
    expect((await locateSource(el, resolver)).location).toMatchObject({ resolved: false, file: chunk('a.js'), reason: 'betik getirilemedi' });
  });

  it('falls back to the nearest ancestor for elements created inside dependencies, and says so', async () => {
    const { resolver } = resolverFor({
      [chunk('lib.js')]: script('webpack://_N_E/node_modules/ui-lib/Dialog.js', 3),
      [chunk('page.js')]: script('webpack://_N_E/./app/Page.tsx', 12),
    });
    const dialog = fiber({ tag: 0, type: function Dialog() {}, _debugStack: stack(`Page (${chunk('page.js')}:1:1)`) });
    const inner = fiber({ _debugStack: stack(`Dialog (${chunk('lib.js')}:1:1)`) }, dialog);
    const { location, note } = await locateSource(inner, resolver);
    expect(location).toMatchObject({ file: 'app/Page.tsx', line: 12, resolved: true });
    expect(note).toContain('ata');
  });

  it('React 18: uses _debugSource, skipping node_modules sources', async () => {
    const { resolver } = resolverFor({});
    const user = fiber({ tag: 0, type: function Cart() {}, _debugSource: { fileName: '/home/u/app/src/Cart.tsx', lineNumber: 27, columnNumber: 9 } });
    const lib = fiber({ _debugSource: { fileName: '/home/u/app/node_modules/lib/x.js', lineNumber: 1 } }, user);
    expect(await locateSource(user, resolver)).toEqual({ location: { file: '/home/u/app/src/Cart.tsx', line: 27, column: 9, resolved: true }, note: undefined });
    expect((await locateSource(lib, resolver)).location).toMatchObject({ file: '/home/u/app/src/Cart.tsx', line: 27 });
    expect(await locateSource(null, resolver)).toEqual({});
  });
});

describe('resolveConsoleSources (EK-B3)', () => {
  it('moves past a console frame that resolves into dependency code to the next user frame', async () => {
    const { resolveConsoleSources } = await import('../src/draft/collect.js');
    const { resolver } = resolverFor({
      [chunk('_hash._.js')]: script('file:///home/u/app/node_modules/next/dist/client/patch-console.js', 50),
      [chunk('cart._.js')]: script('file:///home/u/app/app/Cart.tsx', 31),
    });
    const stackText = [`    at error (${chunk('_hash._.js')}:1:1)`, `    at applyCoupon (${chunk('cart._.js')}:1:1)`].join('\n');
    const [out] = await resolveConsoleSources([{ seq: 1, time: 0, level: 'error', message: 'x', stack: stackText, source: `${chunk('_hash._.js')}:1:1` }], resolver);
    expect(out.source).toBe('/home/u/app/app/Cart.tsx:31:5');
    const [plain] = await resolveConsoleSources([{ seq: 2, time: 0, level: 'error', message: 'y', source: `${chunk('_hash._.js')}:1:1` }], resolver);
    expect(plain.source).toBe('/home/u/app/node_modules/next/dist/client/patch-console.js:50:5');
  });
});
