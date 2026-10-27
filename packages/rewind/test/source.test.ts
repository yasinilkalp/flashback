import { SourceMapGenerator } from 'source-map-js';
import { describe, expect, it } from 'vitest';
import { isLocalSource, SourceResolver, toProjectPath, type ResolverOptions } from '../src/source/sourcemap.js';
import { firstUserFrame, isDependencyPath, parseStack, serverComponentFile, userFrames } from '../src/source/stack.js';

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

  // EK-B3: Next.js webpack (eval-source-map) çerçeveleri parantezli URL taşır.
  const NEXT_WEBPACK_STACK = `Error: react-stack-top-frame
    at exports.jsxDEV (webpack-internal:///(app-pages-browser)/./node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js:333:29)
    at ClientRoot (webpack-internal:///(app-pages-browser)/./src/fixture/ClientRoot.tsx:31:87)
    at Object.react_stack_bottom_frame (webpack-internal:///(app-pages-browser)/./node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:28588:20)`;

  // EK-B3: Turbopack bağımlılık chunk'ları ve RSC'nin sahte sunucu çerçeveleri.
  const NEXT_TURBOPACK_RSC_STACK = `Error: react-stack-top-frame
    at fakeJSXCallSite (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-67asdr9._.js:2093:21)
    at ServerPart (about://React/Server/C:%5Capp%5C.next%5Cdev%5Cserver%5Cchunks%5Cssr%5C%5Broot-of-the-server%5D__0t._.js?5:88:263)
    at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-67asdr9._.js:2859:93)`;

  it('parses parenthesised webpack-internal URLs and skips Next/Turbopack internals', () => {
    expect(userFrames(NEXT_WEBPACK_STACK)).toEqual([
      { fn: 'ClientRoot', url: 'webpack-internal:///(app-pages-browser)/./src/fixture/ClientRoot.tsx', line: 31, column: 87 },
    ]);
    expect(userFrames(NEXT_TURBOPACK_RSC_STACK)).toMatchObject([{ fn: 'ServerPart', line: 88, column: 263 }]);
    const jsx = 'Error\n    at exports.jsx (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_1amofcmz--cdp._.js:966:33)\n    at LibBox (http://localhost:3000/_next/static/chunks/_12ie3ib4yzj7d._.js:13:190)';
    expect(userFrames(jsx)).toMatchObject([{ fn: 'LibBox' }]);
    expect(userFrames('ClientRoot@webpack-internal:///(app-pages-browser)/./src/a.tsx:31:87')).toMatchObject([{ url: 'webpack-internal:///(app-pages-browser)/./src/a.tsx', line: 31 }]);
  });

  it('decodes RSC server frames and recognises dependency paths', () => {
    expect(serverComponentFile('about://React/Server/C:%5Capp%5Cchunk.js?5')).toBe('C:\\app\\chunk.js');
    expect(serverComponentFile('rsc://React/Server/webpack-internal:///(rsc)/./src/a.tsx?12')).toBe('webpack-internal:///(rsc)/./src/a.tsx');
    expect(serverComponentFile('http://localhost:3000/a.js')).toBeNull();
    expect(isDependencyPath('node_modules/lib/index.js')).toBe(true);
    expect(isDependencyPath('C:\\app\\node_modules\\lib\\index.js')).toBe(true);
    expect(isDependencyPath('/app/node_modules/next/dist/x.js')).toBe(true);
    expect(isDependencyPath('src/node_modules_list.tsx')).toBe(false);
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
    ['file:///C:/Users/u/app/src/page.tsx', 'C:/Users/u/app/src/page.tsx'],
    ['turbopack:///[project]/src/app/page.tsx', 'src/app/page.tsx'],
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

function resolverFor(files: Record<string, string>, pageOrigin = 'http://localhost:5173', opts?: ResolverOptions) {
  const fetched: string[] = [];
  const resolver = new SourceResolver(
    async (url) => {
      fetched.push(url);
      return files[url] ?? null;
    },
    (url) => isLocalSource(url, pageOrigin),
    opts,
  );
  return { resolver, fetched };
}

/** Derlenmiş satır 3, sütun 4 → `source` içinde `line`. */
function mapTo(source: string, line: number) {
  const gen = new SourceMapGenerator({ file: 'x.js' });
  gen.addMapping({ generated: { line: 3, column: 4 }, original: { line, column: 4 }, source });
  return gen.toString();
}

/** webpack eval-source-map chunk'ındaki bir modül (chunk metninde satır sonu `\n` kaçışlıdır). */
function evalModule(moduleUrl: string, map: string) {
  const b64 = Buffer.from(map).toString('base64');
  return `eval(__webpack_require__.ts("a\\nb\\n    jsxDEV()\\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}\\n//# sourceURL=${moduleUrl}\\n"));\n`;
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

describe('SourceResolver: Next.js and webpack special cases (EK-B3)', () => {
  const origin = 'http://localhost:3000';
  const moduleUrl = 'webpack-internal:///(app-pages-browser)/./src/Cart.tsx';
  const frame = { url: moduleUrl, line: 3, column: 5 };

  it('finds a webpack eval module map in the newest loaded chunk (HMR update wins)', async () => {
    const base = `${origin}/_next/static/chunks/app/page.js`;
    const hot = `${origin}/_next/static/webpack/app/page.abc.hot-update.js`;
    const { resolver } = resolverFor(
      {
        [base]: evalModule('webpack-internal:///(app-pages-browser)/./node_modules/lib/x.js', mapTo('webpack://_N_E/./node_modules/lib/x.js', 1)) + evalModule(moduleUrl, mapTo('webpack://_N_E/./src/Cart.tsx?a1', 10)),
        [hot]: evalModule(moduleUrl, mapTo('webpack://_N_E/./src/Cart.tsx?b2', 13)),
      },
      origin,
      { listScripts: () => [hot, base] },
    );
    expect(await resolver.resolve(frame)).toMatchObject({ file: 'src/Cart.tsx', line: 13, resolved: true });
    const older = resolverFor({ [base]: evalModule(moduleUrl, mapTo('webpack://_N_E/./src/Cart.tsx', 10)) }, origin, { listScripts: () => [base] }).resolver;
    expect(await older.resolve(frame)).toMatchObject({ line: 10, resolved: true });
  });

  it('never fetches the webpack-internal URL itself; unknown module → resolved:false', async () => {
    const thirdParty = 'https://cdn.example/x.js';
    const { resolver, fetched } = resolverFor({}, origin, { listScripts: () => [thirdParty, `${origin}/a.js`] });
    expect(await resolver.resolve(frame)).toMatchObject({ resolved: false, file: moduleUrl, reason: 'webpack modülü yüklü betiklerde bulunamadı' });
    expect(fetched).toEqual([`${origin}/a.js`]);
  });

  it('resolves RSC frames through the framework source map endpoint, unless the RSC payload was refetched', async () => {
    const rsc = { url: 'about://React/Server/webpack-internal:///(rsc)/./src/server/A.tsx?3', line: 3, column: 5 };
    const endpoint = (file: string) => `${origin}/__nextjs_source-map?filename=${encodeURIComponent(file)}`;
    const files = { [endpoint('webpack-internal:///(rsc)/./src/server/A.tsx')]: mapTo('file:///home/u/app/src/server/A.tsx', 10) };
    const ok = resolverFor(files, origin, { serverSourceMapUrl: endpoint });
    expect(await ok.resolver.resolve(rsc)).toMatchObject({ file: '/home/u/app/src/server/A.tsx', line: 10, resolved: true });
    const refetched = resolverFor(files, origin, { serverSourceMapUrl: endpoint, serverRefetched: () => true });
    expect(await refetched.resolver.resolve(rsc)).toMatchObject({ resolved: false, file: 'webpack-internal:///(rsc)/./src/server/A.tsx', line: 3 });
    expect(refetched.fetched).toEqual([]);
    expect(await resolverFor(files, origin).resolver.resolve(rsc)).toMatchObject({ resolved: false, reason: 'sunucu bileşeni (RSC): source map konumu bilinmiyor' });
  });

  it('does not map Turbopack HMR modules (`chunk.js?id=`) against the whole chunk', async () => {
    const url = `${origin}/_next/static/chunks/_12ie._.js?id=%255Bproject%255D/src/a.tsx+%255Bapp-client%255D+(ecmascript)`;
    const { resolver, fetched } = resolverFor({}, origin);
    expect(await resolver.resolve({ url, line: 68, column: 218 })).toMatchObject({ resolved: false, line: 68 });
    expect(fetched).toEqual([]);
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
