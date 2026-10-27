import { SourceMapGenerator } from 'source-map-js';
import { describe, expect, it } from 'vitest';
import { isLocalSource, SourceResolver, toProjectPath } from '../src/source/sourcemap.js';
import { firstUserFrame, parseStack } from '../src/source/stack.js';

const REACT19_STACK = `Error: react-stack-top-frame
    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=3b0df4d9:197:25)
    at Cart (http://localhost:5173/src/Cart.tsx?t=1761526800000:108:21)
    at Object.react_stack_bottom_frame (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=3b0df4d9:14140:12)
    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=3b0df4d9:4404:17)`;

const GECKO_STACK = `jsxDEV@http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:197:25
Cart@http://localhost:5173/src/Cart.tsx:108:21
react_stack_bottom_frame@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=1:14140:12`;

describe('stack parsing', () => {
  it('parses V8 and Gecko frames and skips React/dependency frames', () => {
    expect(parseStack(REACT19_STACK)).toHaveLength(4);
    expect(firstUserFrame(REACT19_STACK)).toEqual({ fn: 'Cart', url: 'http://localhost:5173/src/Cart.tsx?t=1761526800000', line: 108, column: 21 });
    expect(firstUserFrame(GECKO_STACK)).toEqual({ fn: 'Cart', url: 'http://localhost:5173/src/Cart.tsx', line: 108, column: 21 });
    expect(firstUserFrame('Error\n    at http://localhost:5173/src/a.ts:1:2')).toMatchObject({ url: 'http://localhost:5173/src/a.ts', line: 1, column: 2 });
    expect(firstUserFrame(undefined)).toBeNull();
  });
});

describe('toProjectPath', () => {
  const script = 'http://localhost:5173/src/Cart.tsx?t=1';
  it.each([
    ['Cart.tsx', 'src/Cart.tsx'],
    ['/src/Cart.tsx', 'src/Cart.tsx'],
    ['/home/u/app/src/Cart.tsx', 'src/Cart.tsx'],
    ['http://localhost:5173/src/Cart.tsx', 'src/Cart.tsx'],
    ['webpack://my-app/./src/components/Cart.tsx', 'src/components/Cart.tsx'],
    ['webpack-internal:///(app-pages-browser)/./src/app/page.tsx', 'src/app/page.tsx'],
    ['file:///home/u/app/src/page.tsx', '/home/u/app/src/page.tsx'],
  ])('%s → %s', (source, expected) => expect(toProjectPath(source, script)).toBe(expected));

  it('keeps /@fs/ files as absolute paths', () => {
    expect(toProjectPath('../../x.ts', 'http://localhost:5173/@fs/home/u/lib/sub/dir/y.ts')).toBe('/home/u/lib/x.ts');
  });
});

/** Derlenmiş satır 3, sütun 4 → Cart.tsx satır 10, sütun 8 eşlemesi olan küçük bir harita. */
function fixtureMap(withContent: boolean) {
  const gen = new SourceMapGenerator({ file: 'Cart.js' });
  gen.addMapping({ generated: { line: 3, column: 4 }, original: { line: 10, column: 8 }, source: 'Cart.tsx', name: 'jsxDEV' });
  if (withContent) gen.setSourceContent('Cart.tsx', Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n'));
  return gen.toString();
}

function resolverFor(files: Record<string, string>, pageOrigin = 'http://localhost:5173') {
  const fetched: string[] = [];
  const resolver = new SourceResolver(
    async (url) => {
      fetched.push(url);
      return files[url] ?? null;
    },
    (url) => isLocalSource(url, pageOrigin),
  );
  return { resolver, fetched };
}

describe('SourceResolver (FR-MARK-04/11/12)', () => {
  const frame = { url: 'http://localhost:5173/src/Cart.tsx?t=1', line: 3, column: 5 };

  it('resolves through an inline data: source map, with ±3 line snippet and file hash', async () => {
    const inline = `a\nb\n    jsxDEV("dd")\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(fixtureMap(true)).toString('base64')}`;
    const { resolver, fetched } = resolverFor({ [frame.url]: inline });
    const loc = await resolver.resolve(frame);
    expect(loc).toMatchObject({ file: 'src/Cart.tsx', line: 10, column: 9, resolved: true });
    expect(loc.snippet).toMatchObject({ startLine: 7, lines: ['line 7', 'line 8', 'line 9', 'line 10', 'line 11', 'line 12', 'line 13'] });
    expect(loc.snippet!.fileHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    await resolver.resolve(frame);
    expect(fetched).toHaveLength(1); // tüketici önbellekte
  });

  it('resolves through an external .map URL; no sourcesContent → no snippet', async () => {
    const script = 'http://localhost:3000/_next/static/chunks/app.js';
    const { resolver } = resolverFor({ [script]: 'x\n//# sourceMappingURL=app.js.map', 'http://localhost:3000/_next/static/chunks/app.js.map': fixtureMap(false) }, 'http://localhost:3000');
    const loc = await resolver.resolve({ url: script, line: 3, column: 5 });
    expect(loc).toMatchObject({ file: '_next/static/chunks/Cart.tsx', line: 10, resolved: true });
    expect(loc.snippet).toBeUndefined();
  });

  it('never guesses: missing map or unmapped position → compiled location with resolved:false', async () => {
    const { resolver } = resolverFor({ [frame.url]: 'no map here' });
    expect(await resolver.resolve(frame)).toEqual({ file: frame.url, line: 3, column: 5, resolved: false, reason: 'source map bulunamadı' });
    const inline = `//# sourceMappingURL=data:application/json;base64,${Buffer.from(fixtureMap(true)).toString('base64')}`;
    const r2 = resolverFor({ [frame.url]: inline }).resolver;
    expect(await r2.resolve({ ...frame, line: 1, column: 1 })).toMatchObject({ resolved: false, line: 1, reason: 'source map bu konumu eşlemiyor' });
    const r3 = resolverFor({}).resolver;
    expect((await r3.resolve(frame)).resolved).toBe(false);
  });
});

describe('NFR-PRIV-01: no requests outside the page origin / loopback', () => {
  it('classifies URLs', () => {
    const page = 'http://localhost:5173';
    expect(isLocalSource('http://localhost:5173/src/a.tsx', page)).toBe(true);
    expect(isLocalSource('http://127.0.0.1:3000/a.js', page)).toBe(true);
    expect(isLocalSource('http://[::1]:8080/a.js', page)).toBe(true);
    expect(isLocalSource('http://app.localhost:5173/a.js', page)).toBe(true);
    expect(isLocalSource('https://dev.example.com/a.js', 'https://dev.example.com')).toBe(true);
    expect(isLocalSource('https://js.stripe.com/v3', page)).toBe(false);
    expect(isLocalSource('https://localhost.evil.com/a.js', page)).toBe(false);
    expect(isLocalSource('chrome-extension://abc/a.js', page)).toBe(false);
  });

  it('never fetches third-party scripts or third-party source maps', async () => {
    const thirdParty = { url: 'https://js.stripe.com/v3', line: 1, column: 1 };
    const local = { url: 'http://localhost:5173/src/Cart.tsx', line: 3, column: 5 };
    const { resolver, fetched } = resolverFor({ [local.url]: 'x\n//# sourceMappingURL=https://maps.tracker.example/v3.js.map' });
    expect(await resolver.resolve(thirdParty)).toMatchObject({ resolved: false, file: thirdParty.url, reason: 'yerel olmayan kaynak çözülmez (NFR-PRIV-01)' });
    expect(await resolver.resolve(local)).toMatchObject({ resolved: false, reason: 'yerel olmayan kaynak çözülmez (NFR-PRIV-01)' });
    expect(fetched).toEqual([local.url]);
  });
});
