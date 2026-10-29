import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';
import { describe, expect, it } from 'vitest';
import { parseSourceAttr } from '../src/source/attr.js';
import flashback, { addSourceAttributes, isHostTag } from '../src/vite.js';

const APP = [
  "import { Foo } from './Foo';",
  'export function App<T,>({ items }: { items: T[] }) {',
  '  return (',
  '    <section className="app">',
  '      <Foo.Bar /><Foo x={1} /><>{items.length as number}</>',
  '      <span data-flashback-source="keep">t</span><svg><linearGradient /></svg>',
  '      <mesh /><my-widget />',
  '    </section>',
  '  );',
  '}',
].join('\n');

/** Dönüştürülmüş koddaki `<etiket data-flashback-source={"…"}` değerleri, sırasıyla. */
function attrs(code: string): Array<{ tag: string; value: string }> {
  return [...code.matchAll(/<([\w-]+) data-flashback-source=\{"([^"]+)"\}/g)].map((m) => ({ tag: m[1], value: m[2] }));
}

describe('addSourceAttributes (R13, flashback-devtools/vite)', () => {
  it('HTML/SVG öğelerine ve özel öğelere JSX konumunu yazar; bileşenlere, parçalara ve bilinmeyen etiketlere dokunmaz', () => {
    const out = addSourceAttributes(APP, '/r/src/App.tsx', 'src/App.tsx')!;
    expect(attrs(out.code)).toEqual([
      { tag: 'section', value: 'src/App.tsx:4:5' },
      { tag: 'svg', value: 'src/App.tsx:6:50' },
      { tag: 'linearGradient', value: 'src/App.tsx:6:55' },
      { tag: 'my-widget', value: 'src/App.tsx:7:15' },
    ]);
    // Var olan öznitelik korunur; react-three-fiber gibi DOM dışı küçük harfli etiketler atlanır.
    expect(out.code).toContain('<span data-flashback-source="keep">');
    expect(out.code).toContain('<mesh />');
    expect(out.code).toContain('<Foo.Bar /><Foo x={1} /><>');
    // Yalnızca satır içine ekleme: satır sayısı ve her konumun satırı aynı kalır.
    expect(out.code.split('\n')).toHaveLength(APP.split('\n').length);
    for (const { tag, value } of attrs(out.code)) {
      const { line, column } = parseSourceAttr(value)!;
      expect(APP.split('\n')[line - 1].slice(column - 1)).toMatch(new RegExp(`^<${tag}\\b`));
    }
  });

  it('kaynak haritası üretilen satırı özgün satıra eşler', () => {
    const out = addSourceAttributes(APP, '/r/src/App.tsx', 'src/App.tsx')!;
    const consumer = new SourceMapConsumer(out.map as unknown as RawSourceMap);
    const lines = out.code.split('\n');
    const line = lines.findIndex((l) => l.includes('<svg')) + 1;
    const column = lines[line - 1].indexOf('<linearGradient');
    const pos = consumer.originalPositionFor({ line, column });
    expect(pos).toMatchObject({ source: '/r/src/App.tsx', line: 6, column: 54 });
    expect(consumer.sourceContentFor('/r/src/App.tsx')).toBe(APP);
  });

  it('eklenecek öğe yoksa, JSX yoksa ya da sözdizimi bozuksa null (hata sonraki eklentiye kalır)', () => {
    expect(addSourceAttributes('export const a = 1 < 2;', '/r/a.tsx', 'a.tsx')).toBeNull();
    expect(addSourceAttributes('export const A = () => <Foo />;', '/r/a.tsx', 'a.tsx')).toBeNull();
    expect(addSourceAttributes('export const A = () => <div', '/r/a.tsx', 'a.tsx')).toBeNull();
    expect(addSourceAttributes('export default 1;', '/r/a.tsx', 'a.tsx')).toBeNull();
  });

  it('.jsx dosyaları TypeScript eklentisi olmadan ayrıştırılır', () => {
    const out = addSourceAttributes('export const A = () => <p>{"x"}</p>;', '/r/a.jsx', 'a.jsx')!;
    expect(attrs(out.code)).toEqual([{ tag: 'p', value: 'a.jsx:1:24' }]);
  });

  it('isHostTag', () => {
    for (const t of ['div', 'button', 'h1', 'svg', 'clipPath', 'foreignObject', 'x-foo', 'my-el-2']) expect(isHostTag(t)).toBe(true);
    for (const t of ['mesh', 'group', 'primitive', 'boxGeometry', 'head', 'script', 'style', 'Div', '-x']) expect(isHostTag(t)).toBe(false);
  });
});

describe('flashback eklentisi', () => {
  const plugin = (options?: Parameters<typeof flashback>[0]) => {
    const p = flashback(options);
    (p.configResolved as (c: { root: string }) => void)({ root: '/r' });
    const transform = (code: string, id: string) => (p.transform as (code: string, id: string) => ReturnType<typeof addSourceAttributes>)(code, id);
    return { p, transform };
  };

  it('yalnızca geliştirme sunucusunda çalışır: build ve test (Vitest) dönüştürülmez (FR-CFG-08)', () => {
    const { p } = plugin();
    const apply = p.apply as (c: object, env: { command: string; mode: string }) => boolean;
    expect(p.enforce).toBe('pre');
    expect(apply({}, { command: 'serve', mode: 'development' })).toBe(true);
    expect(apply({}, { command: 'build', mode: 'production' })).toBe(false);
    expect(apply({}, { command: 'build', mode: 'development' })).toBe(false);
    expect(apply({}, { command: 'serve', mode: 'test' })).toBe(false);
  });

  it('yol dev sunucusu köküne göreli; kök dışı dosyada mutlak. node_modules, sorgulu ve sanal modüller atlanır', () => {
    const { transform } = plugin();
    const code = 'export const A = () => <div />;';
    expect(attrs(transform(code, '/r/src/A.tsx')!.code)).toEqual([{ tag: 'div', value: 'src/A.tsx:1:24' }]);
    expect(attrs(transform(code, '/lib/ui/B.tsx')!.code)).toEqual([{ tag: 'div', value: '/lib/ui/B.tsx:1:24' }]);
    expect(transform(code, '/r/node_modules/ui/C.tsx')).toBeNull();
    expect(transform(code, '/r/src/A.tsx?raw')).toBeNull();
    expect(transform(code, '\0virtual:a.tsx')).toBeNull();
    expect(transform(code, '/r/src/a.ts')).toBeNull();
    expect(transform(code, '/r/src/A.mdx')).toBeNull();
  });

  it('include ve exclude seçenekleri', () => {
    const { transform } = plugin({ include: /\.(?:[jt]sx|js)$/, exclude: /\/three\// });
    const code = 'export const A = () => <div />;';
    expect(transform(code, '/r/src/a.js')).not.toBeNull();
    expect(transform(code, '/r/src/three/Scene.tsx')).toBeNull();
  });
});
