import { SourceMapGenerator } from 'source-map-js';
import { describe, expect, it } from 'vitest';
import { isLocalSource, matchModuleUrl, nextDevSourceMapUrl, serverFrameFilename, SourceResolver, toProjectPath } from '../src/source/sourcemap.js';
import { elementFrames, firstUserFrame, isInternalSource, parseStack, userFrames } from '../src/source/stack.js';

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

  // EK-B3: Next.js webpack geliştirme sunucusu — URL'de parantez var: "(app-pages-browser)".
  const NEXT_WEBPACK_STACK = `Error: react-stack-top-frame
    at exports.jsxDEV (webpack-internal:///(app-pages-browser)/../../node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js:333:29)
    at Shop (webpack-internal:///(app-pages-browser)/./app/components/Shop.tsx:54:87)
    at Object.react_stack_bottom_frame (webpack-internal:///(app-pages-browser)/../../node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:28588:20)`;

  it('parses V8 frames whose URL contains parentheses (Next webpack-internal)', () => {
    expect(parseStack(NEXT_WEBPACK_STACK)).toHaveLength(3);
    expect(firstUserFrame(NEXT_WEBPACK_STACK)).toEqual({ fn: 'Shop', url: 'webpack-internal:///(app-pages-browser)/./app/components/Shop.tsx', line: 54, column: 87 });
    expect(parseStack('    at webpack-internal:///(app-pages-browser)/./app/x.tsx:3:4')).toEqual([{ url: 'webpack-internal:///(app-pages-browser)/./app/x.tsx', line: 3, column: 4 }]);
  });

  // EK-B3: React Flight (RSC) sunucu çerçeveleri, Turbopack karma adlı parçalar.
  const NEXT_TURBOPACK_RSC_STACK = `Error: react-stack-top-frame
    at fakeJSXCallSite (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-67asdr9._.js:2093:21)
    at Page (about://React/Server/file:///home/u/app/.next/dev/server/chunks/ssr/%5Broot-of-the-server%5D__0lfhyhrgtz8p7._.js?5:56:264)
    at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-67asdr9._.js:2859:93)
    at initializeElement (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_164kp-67asdr9._.js:1216:154)`;

  it('skips the React Flight client and keeps the RSC server frame', () => {
    const frames = userFrames(NEXT_TURBOPACK_RSC_STACK);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ fn: 'Page', line: 56, column: 264 });
    expect(frames[0].url).toMatch(/^about:\/\/React\/Server\/file:\/\/\/home\/u\/app\/.*\?5$/);
  });

  // Firefox (SpiderMonkey) ve Safari (JavaScriptCore): "fn@url:satır:sütun". EK-B3'te Firefox ölçülemedi
  // (tarayıcı kurulamadı); biçim burada gerçek Firefox çıktısı örnekleriyle sabitlenir.
  const FIREFOX_STACK = [
    'jsxDEV@http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=3b0df4d9:250:30',
    'ProductList/<@http://localhost:5173/src/ProductList.tsx:20:11',
    'ProductList@http://localhost:5173/src/ProductList.tsx:19:18',
    'react_stack_bottom_frame@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=3b0df4d9:17424:20',
    'async*Cart@http://localhost:5173/@fs/home/u/app/src/Cart.tsx:3:4',
    '@http://localhost:5173/src/main.tsx:9:7',
    'evalFn@http://localhost:5173/src/a.js line 2 > eval:3:4',
    'map@[native code]',
    '',
  ].join('\n');

  it('parses Firefox/Safari frames: anonymous, nested closures (`f/<`), async*, @ in the URL; skips eval and native frames', () => {
    const frames = parseStack(FIREFOX_STACK);
    expect(frames.map((f) => f.fn)).toEqual(['jsxDEV', 'ProductList/<', 'ProductList', 'react_stack_bottom_frame', 'Cart', undefined]);
    expect(firstUserFrame(FIREFOX_STACK)).toEqual({ fn: 'ProductList/<', url: 'http://localhost:5173/src/ProductList.tsx', line: 20, column: 11 });
    expect(frames[4]).toEqual({ fn: 'Cart', url: 'http://localhost:5173/@fs/home/u/app/src/Cart.tsx', line: 3, column: 4 });
    expect(frames[5]).toEqual({ url: 'http://localhost:5173/src/main.tsx', line: 9, column: 7 });
    expect(firstUserFrame('global code@http://localhost:5173/src/x.js:1:2')).toMatchObject({ fn: 'global code', line: 1 });
  });

  it('element frames stop at react_stack_bottom_frame and ignore the shared UnknownOwner stack (>10 000 elements/s)', () => {
    // Bundler modül zinciri: alt çerçeveden sonra içe aktaran kullanıcı modülü görünebilir — JSX'in yeri değildir.
    const component = `Error: react-stack-top-frame
    at exports.jsxDEV (webpack-internal:///(app-pages-browser)/../../node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js:333:29)
    at Cart (webpack-internal:///(app-pages-browser)/./app/Cart.tsx:20:5)
    at Object.react_stack_bottom_frame (webpack-internal:///(app-pages-browser)/../../node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:28588:20)
    at eval (webpack-internal:///(app-pages-browser)/./app/layout-client.tsx:3:1)`;
    expect(elementFrames(component).map((f) => f.fn)).toEqual(['Cart']);
    const unknownOwner = `Error: react-stack-top-frame
    at UnknownOwner (http://localhost:3000/_next/static/chunks/_0pfk._.js:120:14)
    at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/_0pfk._.js:500:12)
    at module evaluation (http://localhost:3000/_next/static/chunks/app_providers._.js:4:1)`;
    expect(elementFrames(unknownOwner)).toEqual([]);
    expect(elementFrames('UnknownOwner@http://localhost:5173/x.js:1:1\nmodule code@http://localhost:5173/src/main.tsx:2:3')).toEqual([]);
    // Modül düzeyi öğe: alt çerçeve yok, ilk kullanıcı çerçevesi modül kodudur.
    expect(elementFrames('Error\n    at http://localhost:5173/src/App.tsx:16:16')).toMatchObject([{ line: 16 }]);
  });

  it('classifies resolved original sources from dependencies / bundler runtimes as internal', () => {
    for (const f of [
      '/home/u/rewind/node_modules/next/dist/compiled/react-server-dom-turbopack/cjs/client.js',
      'C:\\u\\app\\node_modules\\next\\dist\\client\\index.js',
      'node_modules/react-dom/cjs/react-dom.development.js',
      'webpack/bootstrap',
      '[turbopack]/browser/runtime/base/runtime-base.ts',
      '/home/u/rewind/packages/rewind/dist/index.js',
    ]) {
      expect(isInternalSource(f), f).toBe(true);
    }
    for (const f of ['app/components/Cart.tsx', '/home/u/app/src/node_modules_like/Cart.tsx', 'src/Cart.tsx']) expect(isInternalSource(f), f).toBe(false);
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
    // EK-B3: Turbopack ve Windows dosya URL'leri
    ['file:///C:/Users/u/app/app/page.tsx', 'C:/Users/u/app/app/page.tsx'],
    ['file:///home/u/my%20app/app/page.tsx', '/home/u/my app/app/page.tsx'],
    ['turbopack:///[project]/app/components/Cart.tsx', 'app/components/Cart.tsx'],
    ['[project]/examples/next-app/app/page.tsx', 'examples/next-app/app/page.tsx'],
    ['webpack://./app/components/Shop.tsx', 'app/components/Shop.tsx'],
    ['webpack://_N_E/./app/page.tsx?abc', 'app/page.tsx'],
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

describe('Next.js / RSC frames (EK-B3)', () => {
  it('extracts the server filename from React Flight frame URLs', () => {
    expect(serverFrameFilename('about://React/Server/file:///home/u/app/.next/server/%5Broot%5D__x._.js?5')).toBe('file:///home/u/app/.next/server/[root]__x._.js');
    expect(serverFrameFilename('about://React/Server/webpack-internal:///(rsc)/./app/page.tsx?12')).toBe('webpack-internal:///(rsc)/./app/page.tsx');
    expect(serverFrameFilename('rsc://React/Server/file:///app/page.js?0')).toBe('file:///app/page.js');
    expect(serverFrameFilename('about://React/Prerender/file:///app/page.js')).toBe('file:///app/page.js');
    expect(serverFrameFilename('http://localhost:3000/_next/static/chunks/a.js')).toBeNull();
  });

  it('builds the Next dev source-map endpoint URL on the page origin only for non-fetchable frames', () => {
    const page = 'http://127.0.0.1:3000';
    expect(nextDevSourceMapUrl('webpack-internal:///(app-pages-browser)/./app/Shop.tsx', page)).toBe(
      'http://127.0.0.1:3000/__nextjs_source-map?filename=webpack-internal%3A%2F%2F%2F%28app-pages-browser%29%2F.%2Fapp%2FShop.tsx',
    );
    expect(nextDevSourceMapUrl('about://React/Server/file:///a/b.js?3', page)).toBe('http://127.0.0.1:3000/__nextjs_source-map?filename=file%3A%2F%2F%2Fa%2Fb.js');
    expect(nextDevSourceMapUrl('http://127.0.0.1:3000/_next/static/chunks/a.js', page)).toBeNull();
  });

  it('resolves through a direct map URL (mapUrlFor) and an index map with sections (Turbopack)', async () => {
    const section = new SourceMapGenerator({ file: 'x' });
    section.addMapping({ generated: { line: 2, column: 10 }, original: { line: 13, column: 6 }, source: 'file:///home/u/app/app/page.tsx' });
    section.setSourceContent('file:///home/u/app/app/page.tsx', Array.from({ length: 20 }, (_, i) => `p${i + 1}`).join('\n'));
    const index = JSON.stringify({ version: 3, sources: [], sections: [{ offset: { line: 0, column: 0 }, map: JSON.parse(fixtureMap(false)) }, { offset: { line: 50, column: 0 }, map: JSON.parse(section.toString()) }] });
    const page = 'http://127.0.0.1:3000';
    const mapUrl = `${page}/__nextjs_source-map?filename=file%3A%2F%2F%2Fsrv%2Fchunk.js`;
    const fetched: string[] = [];
    const resolver = new SourceResolver(
      async (u) => (fetched.push(u), u === mapUrl ? index : null),
      (u) => isLocalSource(u, page),
      { mapUrlFor: (u) => nextDevSourceMapUrl(u, page) },
    );
    const loc = await resolver.resolve({ url: 'about://React/Server/file:///srv/chunk.js?5', line: 52, column: 11 });
    expect(loc).toMatchObject({ file: '/home/u/app/app/page.tsx', line: 13, column: 7, resolved: true });
    expect(loc.snippet?.lines).toContain('p13');
    // Aynı dosyanın başka sayaçlı çerçevesi önbellekten çözülür.
    await resolver.resolve({ url: 'about://React/Server/file:///srv/chunk.js?9', line: 52, column: 11 });
    expect(fetched).toEqual([mapUrl]);
    // Uç yoksa (Next dışı): getirilemez çerçeve → resolved:false, istek yok.
    const plain = new SourceResolver(async () => 'x', () => true);
    expect(await plain.resolve({ url: 'webpack-internal:///./src/a.tsx', line: 1, column: 1 })).toMatchObject({ resolved: false });
  });
});

describe('React 18 _debugSource (EK-B3)', () => {
  const origin = 'http://localhost:5173';

  it('matches an absolute file to the loaded module URL (longest suffix, /@fs/, same origin only)', () => {
    const urls = ['http://localhost:5173/src/main.tsx', 'http://localhost:5173/src/Cart.tsx?t=123', 'http://localhost:5173/Cart.tsx', 'http://cdn.example/src/App.tsx', 'http://localhost:5173/@fs/home/u/lib/x.tsx'];
    expect(matchModuleUrl('/home/u/app/src/Cart.tsx', urls, origin)).toBe('http://localhost:5173/src/Cart.tsx');
    expect(matchModuleUrl('/home/u/lib/x.tsx', urls, origin)).toBe('http://localhost:5173/@fs/home/u/lib/x.tsx');
    expect(matchModuleUrl('/home/u/app/src/App.tsx', urls, origin)).toBeNull();
    expect(matchModuleUrl('C:\\u\\app\\src\\Cart.tsx', urls, origin)).toBe('http://localhost:5173/src/Cart.tsx');
  });

  it('relativizes the path and adds a snippet from the module source map; falls back to the absolute path', async () => {
    const gen = new SourceMapGenerator({ file: 'Cart.tsx' });
    gen.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: '/home/u/app/src/Cart.tsx' });
    gen.setSourceContent('/home/u/app/src/Cart.tsx', Array.from({ length: 30 }, (_, i) => `c${i + 1}`).join('\n'));
    const script = 'http://localhost:5173/src/Cart.tsx';
    const code = `x\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(gen.toString()).toString('base64')}`;
    const resolver = new SourceResolver(async (u) => (u === script ? code : null), (u) => isLocalSource(u, origin), {
      moduleUrlFor: (f) => matchModuleUrl(f, [script], origin),
    });
    const loc = await resolver.fromDebugSource('/home/u/app/src/Cart.tsx', 27, 9);
    expect(loc).toMatchObject({ file: 'src/Cart.tsx', line: 27, column: 9, resolved: true });
    expect(loc.snippet).toMatchObject({ startLine: 24, lines: ['c24', 'c25', 'c26', 'c27', 'c28', 'c29', 'c30'] });
    expect(await resolver.fromDebugSource('/elsewhere/Other.tsx', 3)).toEqual({ file: '/elsewhere/Other.tsx', line: 3, column: 1, resolved: true });
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
