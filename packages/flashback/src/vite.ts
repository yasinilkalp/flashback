/**
 * `flashback-devtools/vite`: geliştirme sunucusunda iki iş yapar.
 *
 * 1. HTML/SVG JSX öğelerine `data-flashback-source="dosya:satır:sütun"` yazar. React 19 öğenin konumunu
 *    (`_debugStack`) yalnızca fiber oluşturulurken yazar; Fast Refresh'ten sonra satır bayatlar. Öznitelik ise her
 *    render'da güncel props'tan gelir. Tarayıcı önce bu özniteliğe bakar; yoksa fiber yoluna düşer.
 * 2. `POST /__flashback/report` ucu: tarayıcının gönderdiği raporu proje kökündeki `.flashback/<id>.md` dosyasına
 *    yazar. Ajan dosyayı okur (ya da `flashback-mcp` üzerinden alır); ayrı süreç ya da port gerekmez.
 *
 * Yalnızca `vite` geliştirme sunucusunda çalışır: `vite build` ve Vitest (varsayılan `mode: 'test'`; anlık görüntü
 * testleri bozulmasın) etkilenmez.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { renderMarkdown } from './report/markdown.js';
import { REPORT_VERSION, type Report } from './report/types.js';
import { SOURCE_ATTR, formatSourceAttr } from './source/attr.js';

export interface FlashbackPluginOptions {
  /** Dönüştürülecek dosyalar (sorgusuz modül kimliğiyle eşlenir). Varsayılan: `.jsx` ve `.tsx`. */
  include?: RegExp;
  /** Dışarıda bırakılacak dosyalar. `node_modules` her zaman dışarıdadır. */
  exclude?: RegExp;
  /** Raporların klasörü. Varsayılan: `FLASHBACK_DIR`, yoksa proje kökündeki (git kökü, yoksa Vite kökü) `.flashback`. */
  dir?: string;
}

/** @deprecated `FlashbackPluginOptions` kullanın. */
export type FlashbackSourceOptions = FlashbackPluginOptions;

export const REPORT_PATH = '/__flashback/report';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** `.flashback/` içinde tutulan en fazla rapor; eskiler silinir. */
export const KEEP_REPORTS = 50;

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

const toPosix = (p: string) => p.split('\\').join('/');

/** Proje kökü: yukarı doğru ilk git kökü (monorepoda ajan genellikle orada çalışır); yoksa verilen klasör. */
export function findProjectRoot(start: string): string {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return resolve(start);
  }
}

/** `fb-20261030-141205-k3pz` (yerel saat; dosya adları zamana göre sıralanır). */
export function reportId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `fb-${date}-${time}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
}

/**
 * Tarayıcının verdiği yolu proje köküne göreli yapar. Tarayıcı yolları dev sunucusu köküne göreli ya da mutlaktır;
 * ajan proje kökünde çalışır. URL'ler ve kök dışındaki yollar olduğu gibi kalır. `:satır:sütun` eki korunur.
 */
export function projectPath(raw: string, viteRoot: string, projectRoot: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  const m = /^(.*?)((?::\d+){1,2})?$/.exec(raw)!;
  const file = m[1].replace(/^\/([a-z]:\/)/i, '$1');
  const abs = isAbsolute(file) && existsSync(file) ? file : resolve(viteRoot, file.replace(/^\/+/, ''));
  const rel = relative(projectRoot, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return raw;
  return toPosix(rel) + (m[2] ?? '');
}

/** Gelen gövde bir rapor mu? Yalnızca Markdown'u kurmaya yetecek biçim denetlenir. */
export function isReport(v: unknown): v is Report {
  const r = v as Report;
  return (
    !!r &&
    typeof r === 'object' &&
    r.v === REPORT_VERSION &&
    (r.lang === 'tr' || r.lang === 'en') &&
    typeof r.note === 'string' &&
    r.note.trim().length > 0 &&
    typeof r.createdAt === 'string' &&
    !!r.page &&
    typeof r.page.url === 'string' &&
    [r.network, r.console, r.steps, r.store].every(Array.isArray) &&
    (r.target === undefined || (typeof r.target === 'object' && typeof r.target.selector === 'string' && Array.isArray(r.target.components)))
  );
}

export interface WriteContext {
  viteRoot: string;
  projectRoot: string;
  dir: string;
}

/** Raporu `<dir>/<id>.md` olarak yazar, en yeni `KEEP_REPORTS` dosya dışındakileri siler. */
export function writeReport(report: Report, ctx: WriteContext, now = new Date()): { id: string; path: string } {
  const fixed: Report = {
    ...report,
    ...(report.target?.file ? { target: { ...report.target, file: projectPath(report.target.file, ctx.viteRoot, ctx.projectRoot) } } : {}),
    console: report.console.map((c) => (c.source ? { ...c, source: projectPath(c.source, ctx.viteRoot, ctx.projectRoot) } : c)),
  };
  mkdirSync(ctx.dir, { recursive: true });
  const ignore = join(ctx.dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '# Flashback raporları: commit edilmez.\n*\n');
  const id = reportId(now);
  const file = join(ctx.dir, `${id}.md`);
  writeFileSync(file, renderMarkdown(fixed, id));
  const reports = readdirSync(ctx.dir)
    .filter((f) => /^fb-\d{8}-\d{6}-[a-z0-9]+\.md$/.test(f))
    .sort();
  for (const old of reports.slice(0, Math.max(0, reports.length - KEEP_REPORTS))) unlinkSync(join(ctx.dir, old));
  const rel = relative(ctx.projectRoot, file);
  return { id, path: toPosix(rel.startsWith('..') || isAbsolute(rel) ? file : rel) };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * Yalnızca sayfanın kendi kökeninden gelen JSON kabul edilir: başka bir sitenin sekmesi geliştirme sunucusuna rapor
 * yazdıramaz (`Origin` ve `Sec-Fetch-Site` denetimi; JSON gövdesi tarayıcıda CORS ön uçuşu gerektirir).
 */
export function reportHandler(ctx: () => WriteContext, log: (msg: string) => void = () => {}) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { error: 'unsupported_media_type' });
    const site = req.headers['sec-fetch-site'];
    let sameOrigin = !site || site === 'same-origin';
    try {
      if (req.headers.origin) sameOrigin &&= new URL(req.headers.origin).host === req.headers.host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return send(res, 403, { error: 'forbidden' });
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES && !aborted) {
        aborted = true;
        send(res, 413, { error: 'too_large' });
        req.destroy();
      } else if (!aborted) chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      let report: unknown;
      try {
        report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(res, 400, { error: 'invalid_json' });
      }
      if (!isReport(report)) return send(res, 400, { error: 'invalid_report' });
      try {
        const saved = writeReport(report, ctx());
        log(`[flashback] ${saved.path}`);
        send(res, 201, saved);
      } catch (err) {
        send(res, 500, { error: 'write_failed', message: String(err) });
      }
    });
  };
}

export default function flashback(options: FlashbackPluginOptions = {}): Plugin {
  const include = options.include ?? /\.[jt]sx$/;
  let root = process.cwd();
  return {
    name: 'flashback',
    enforce: 'pre',
    apply: (_config, env) => env.command === 'serve' && env.mode !== 'test',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      const ctx = (): WriteContext => {
        const projectRoot = findProjectRoot(root);
        // `FLASHBACK_DIR`'i `flashback-mcp` de okur: ikisi aynı klasörde buluşur.
        const dir = options.dir ?? process.env.FLASHBACK_DIR;
        return { viteRoot: root, projectRoot, dir: dir ? resolve(root, dir) : join(projectRoot, '.flashback') };
      };
      server.middlewares.use(REPORT_PATH, reportHandler(ctx, (msg) => server.config.logger.info(msg, { timestamp: true })));
    },
    transform(code, id) {
      // Sanal modüller ve sorgulu kimlikler (`?raw`, `?worker`) kaynak dosya değildir.
      if (id.startsWith('\0') || id.includes('?')) return null;
      const path = toPosix(id);
      if (!include.test(path) || path.includes('/node_modules/') || options.exclude?.test(path)) return null;
      const rel = toPosix(relative(root, id));
      return addSourceAttributes(code, id, rel.startsWith('../') || isAbsolute(rel) ? path : rel);
    },
  };
}

export { flashback, flashback as flashbackSource };
