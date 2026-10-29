/**
 * `flashback-devtools/vite` (R13, FR-MARK-04/11): geliştirme sunucusunda HTML/SVG JSX öğelerine
 * `data-flashback-source="dosya:satır:sütun"` yazar.
 *
 * React 19 öğenin konumunu (`_debugStack`) yalnızca fiber oluşturulurken yazar; Fast Refresh'ten sonra satır bayatlar
 * ve panel `resolved:false` verir (EK-B3). Öznitelik ise her render'da güncel props'tan gelir: HMR modülü yeniden
 * dönüştürür, bileşen yeniden render edilir, DOM'daki değer yeni satırı gösterir. Panel önce bu özniteliğe bakar;
 * yoksa (bağımlılık bileşeninin öğesi, eklenti yok) fiber yoluna düşer.
 *
 * Yalnızca `vite` geliştirme sunucusunda çalışır: `vite build` (FR-CFG-08) ve Vitest (varsayılan `mode: 'test'`; anlık
 * görüntü testleri bozulmasın) dönüştürülmez.
 */
import { isAbsolute, relative } from 'node:path';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { SOURCE_ATTR, formatSourceAttr } from './source/attr.js';

export interface FlashbackSourceOptions {
  /** Dönüştürülecek dosyalar (sorgusuz modül kimliğiyle eşlenir). Varsayılan: `.jsx` ve `.tsx`. */
  include?: RegExp;
  /** Dışarıda bırakılacak dosyalar. `node_modules` her zaman dışarıdadır. */
  exclude?: RegExp;
}

/**
 * Öznitelik yalnızca bilinen HTML/SVG etiketlerine ve özel öğelere (`my-el`) yazılır. Küçük harfli her etiket DOM öğesi
 * değildir: react-three-fiber `<mesh>`, `<group>` gibi etiketleri Three.js nesnelerine çevirir ve tireli prop'u iç içe
 * özellik sanar. `<head>` içindeki ve görünmeyen etiketler işaretlenemeyeceği için atlanır.
 */
const HOST_TAGS = new Set(
  (
    'a abbr address area article aside audio b bdi bdo blockquote body br button canvas caption cite code col colgroup ' +
    'data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 ' +
    'h6 header hgroup hr i iframe img input ins kbd label legend li main map mark menu meter nav object ol optgroup ' +
    'option output p picture pre progress q rp rt ruby s samp search section select slot small source span strong sub ' +
    'summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr ' +
    'svg animate animateMotion animateTransform circle clipPath defs ellipse filter foreignObject g image line ' +
    'linearGradient marker mask path pattern polygon polyline radialGradient rect stop switch symbol text textPath ' +
    'tspan use view'
  ).split(' '),
);

export function isHostTag(name: string): boolean {
  return HOST_TAGS.has(name) || /^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(name);
}

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
}

function isNode(v: unknown): v is AstNode {
  return typeof v === 'object' && v !== null && typeof (v as AstNode).type === 'string';
}

/** AST'deki JSX açılış etiketleri (özyinelemesiz; derin JSX ağaçlarında yığın taşmasın). */
function* openingElements(root: AstNode): Generator<AstNode> {
  const stack: AstNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'JSXOpeningElement') yield node;
    for (const key in node) {
      if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue;
      const v = node[key];
      if (Array.isArray(v)) for (let i = v.length - 1; i >= 0; i--) isNode(v[i]) && stack.push(v[i]);
      else if (isNode(v)) stack.push(v);
    }
  }
}

function hasSourceAttr(el: AstNode): boolean {
  return (el.attributes as AstNode[]).some((a) => a.type === 'JSXAttribute' && (a.name as AstNode).name === SOURCE_ATTR);
}

/**
 * Bir modülün kaynağına öznitelikleri ekler; değişiklik yoksa null. `file`: öznitelikte yazacak yol (dev sunucusu
 * köküne göreli; kök dışındaysa mutlak). Yalnızca aynı satıra ekleme yapılır, satır numaraları değişmez.
 */
export function addSourceAttributes(code: string, id: string, file: string): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  if (!code.includes('<')) return null;
  let ast: AstNode;
  try {
    ast = parse(code, { sourceType: 'module', plugins: /\.tsx$/.test(id) ? ['jsx', 'typescript'] : ['jsx'] }) as unknown as AstNode;
  } catch {
    return null; // Sözdizimi hatasını sonraki eklenti (React/esbuild) bildirsin.
  }
  const s = new MagicString(code);
  for (const el of openingElements(ast)) {
    const name = el.name as AstNode;
    if (name.type !== 'JSXIdentifier' || !isHostTag(name.name as string) || hasSourceAttr(el) || !el.loc || name.end == null) continue;
    const value = formatSourceAttr({ file, line: el.loc.start.line, column: el.loc.start.column + 1 });
    s.appendLeft(name.end, ` ${SOURCE_ATTR}={${JSON.stringify(value)}}`);
  }
  if (!s.hasChanged()) return null;
  return { code: s.toString(), map: s.generateMap({ hires: true, source: id, includeContent: true }) };
}

export default function flashbackSource(options: FlashbackSourceOptions = {}): Plugin {
  const include = options.include ?? /\.[jt]sx$/;
  let root = process.cwd();
  return {
    name: 'flashback-source',
    enforce: 'pre',
    apply: (_config, env) => env.command === 'serve' && env.mode !== 'test',
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      // Sanal modüller ve sorgulu kimlikler (`?raw`, `?worker`) kaynak dosya değildir.
      if (id.startsWith('\0') || id.includes('?')) return null;
      const path = id.split('\\').join('/');
      if (!include.test(path) || path.includes('/node_modules/') || options.exclude?.test(path)) return null;
      const rel = relative(root, id).split('\\').join('/');
      return addSourceAttributes(code, id, rel.startsWith('../') || isAbsolute(rel) ? path : rel);
    },
  };
}

export { flashbackSource };
