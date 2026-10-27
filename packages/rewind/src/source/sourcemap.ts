/**
 * Tarayıcıda source map çözümleme (FR-MARK-04, FR-MARK-11, FR-MARK-12).
 *
 * Betik URL'si getirilir, son `//# sourceMappingURL=` yorumu bulunur (satır içi `data:` ya da URL), tüketici
 * önbelleğe alınır. Çözülemeyen her durumda derlenmiş konum `resolved:false` ile döner — tahmin YAPILMAZ.
 *
 * Özel durumlar (EK-B3):
 * - webpack `eval-source-map` (Next.js webpack, webpack-dev-server): çerçeve URL'si `webpack-internal:///…` olur ve
 *   getirilemez. Modülün satır içi haritası, sayfanın yüklediği chunk'larda `//# sourceURL=` işaretiyle bulunur
 *   (en yeni chunk önce; HMR güncellemesi eski kopyanın önüne geçer).
 * - React Server Components: çerçeve `about://React/Server/<dosya>` olur. Harita yalnızca çerçeve bir uç
 *   sağlıyorsa (`serverSourceMapUrl`, ör. Next.js dev sunucusu) getirilir; yoksa `resolved:false`.
 */
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';
import { hashContent } from '../hash.js';
import { serverComponentFile, type StackFrame } from './stack.js';

export interface Snippet {
  startLine: number;
  lines: string[];
  fileHash: string;
}

export interface ResolvedLocation {
  file: string;
  line: number;
  column: number;
  resolved: boolean;
  reason?: string;
  snippet?: Snippet;
  /** Konum öğenin kendisinin değil, en yakın kullanıcı kodu atasının JSX'i. */
  fromAncestor?: boolean;
  /** Konum bir React Server Component çerçevesinden (sunucuda oluşturulan öğe). */
  serverComponent?: boolean;
}

type FetchText = (url: string) => Promise<string | null>;

interface MapEntry {
  consumer: SourceMapConsumer;
  mapUrl: string;
}

const SOURCE_MAPPING_RE = /[#@]\s*sourceMappingURL=([^\s'"]+)\s*(?:\*\/)?\s*$/;

function findSourceMappingUrl(code: string): string | null {
  const lines = code.split('\n');
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 20; i--) {
    const m = SOURCE_MAPPING_RE.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

function decodeDataUrl(url: string): string | null {
  const comma = url.indexOf(',');
  if (comma === -1) return null;
  const meta = url.slice(5, comma);
  const data = url.slice(comma + 1);
  if (!/;base64/i.test(meta)) return decodeURIComponent(data);
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** webpack eval modülü: `//# sourceMappingURL=data:…\n//# sourceURL=<modül>` (chunk metninde satır sonu `\n` kaçışlı). */
const EVAL_MODULE_RE = /\/\/# sourceMappingURL=(data:[^\s"'\\]+)\\n\/\/# sourceURL=([^\s"'\\]+)/g;

/** Chunk'taki kullanıcı modüllerinin satır içi haritaları (bağımlılıklar atlanır; onların çerçeveleri zaten iç sayılır). */
function indexEvalModules(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(EVAL_MODULE_RE)) if (!m[2].includes('node_modules')) out.set(m[2], m[1]);
  return out;
}

/**
 * Kaynak yolunu projeye göreli yapar: köken, Vite `/@fs/`, webpack/Next önekleri atılır.
 * `base`: göreli kaynakların çözüldüğü URL (map URL'si); `scriptUrl`: derlenmiş modülün URL'si.
 */
export function toProjectPath(source: string, base: string, scriptUrl = base): string {
  const webpack = /^webpack(?:-internal)?:\/\/\/?(?:\([^)]*\)\/|[^/]*\/)?(?:\.\/)?(.*)$/.exec(source);
  if (webpack) return webpack[1].replace(/\?.*$/, '');
  const turbopack = /^turbopack:\/\/\/\[project\]\/(.*)$/.exec(source);
  if (turbopack) return turbopack[1];
  // file:///C:/x → C:/x (Windows), file:///home/x → /home/x. Mutlak yolu sunucu proje köküne göre kısaltır.
  if (source.startsWith('file://')) return decodeURIComponent(source.slice('file://'.length)).replace(/^\/([a-z]:\/)/i, '$1');
  const scriptPath = safeUrl(scriptUrl)?.pathname ?? '';
  let path: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
    const u = safeUrl(source);
    path = u && /^https?:$/.test(u.protocol) ? decodeURIComponent(u.pathname) : source;
  } else if (source.startsWith('/')) {
    if (source === scriptPath) return source.slice(1);
    // Mutlak dosya yolu; sonu modülün URL yoluysa (Vite) dev sunucusu köküne göreli yol verilir.
    if (scriptPath.length > 1 && source.endsWith(scriptPath)) return scriptPath.slice(1);
    return source.startsWith('/@fs/') ? source.slice(4) : source;
  } else {
    const u = safeUrl(source, base);
    path = u ? decodeURIComponent(u.pathname) : source;
  }
  if (path.startsWith('/@fs/')) return path.slice(4);
  return path.replace(/^\/+/, '');
}

function safeUrl(s: string, base?: string): URL | null {
  try {
    return new URL(s, base);
  } catch {
    return null;
  }
}

const LOOPBACK_HOST_RE = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$|\.localhost$/i;

/**
 * NFR-PRIV-01: Rewind loopback dışına istek atmaz. Kaynak ve source map yalnızca sayfanın kendi kökeninden ya da
 * loopback bir sunucudan getirilir; üçüncü taraf betikler (CDN, ödeme, analitik) çözülmez.
 */
export function isLocalSource(url: string, pageOrigin: string): boolean {
  const u = safeUrl(url);
  if (!u || !/^https?:$/.test(u.protocol)) return false;
  return u.origin === pageOrigin || LOOPBACK_HOST_RE.test(u.hostname);
}

const NOT_LOCAL = 'yerel olmayan kaynak çözülmez (NFR-PRIV-01)';

/**
 * Turbopack, HMR ile gelen modülü `<chunk>.js?id=<modül>` adıyla değerlendirir. Kod yalnızca tarayıcıda; aynı URL'den
 * dönen dosya bütün chunk'tır ve konumla eşleşmez.
 */
const TURBOPACK_HMR_RE = /\/_next\/static\/chunks\/[^?#]+\.js\?id=/;
const TURBOPACK_HMR = 'Turbopack HMR modülü: kodu yalnızca tarayıcıda, source map getirilemez';

export interface ResolverOptions {
  /** Sayfanın yüklediği betikler, en yeniden eskiye (webpack eval modüllerini bulmak için). */
  listScripts?: () => string[];
  /** RSC: sunucudaki derlenmiş dosyanın source map URL'si; çerçeve sağlamıyorsa null. */
  serverSourceMapUrl?: (file: string) => string | null;
  /**
   * RSC yükü sayfa yüklendikten sonra yenilendi mi? React, yeniden kullanılan fiber'da öğenin mount anındaki
   * sunucu konumunu tutar; HMR'den sonra bu konum güncel haritayla eşlenirse yanlış satır çıkar.
   */
  serverRefetched?: () => boolean;
}

/**
 * React 18 `_debugSource` mutlak yol verir (`/home/u/app/src/Cart.tsx`). Sayfanın yüklediği modüllerden yolu bu
 * dosyayla biten en uzun eşleşme (Vite `/@fs/` mutlak yolları dahil); yoksa null.
 */
export function matchModuleUrl(file: string, urls: Iterable<string>): string | null {
  const norm = file.replace(/\\/g, '/');
  let best: string | null = null;
  let bestLen = 0;
  for (const raw of urls) {
    let u: URL;
    let path: string;
    try {
      u = new URL(raw);
      path = decodeURIComponent(u.pathname);
    } catch {
      continue;
    }
    const candidate = path.startsWith('/@fs/') ? path.slice(4) : path;
    const ok = candidate === norm || candidate === `/${norm}` || (candidate.length > 1 && norm.endsWith(candidate));
    if (ok && candidate.length > bestLen) {
      best = `${u.origin}${u.pathname}`;
      bestLen = candidate.length;
    }
  }
  return best;
}

async function snippetOf(content: string, line: number): Promise<Snippet> {
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, line - 3);
  const end = Math.min(lines.length, line + 3);
  return { startLine: start, lines: lines.slice(start - 1, end), fileHash: await hashContent(content) };
}

export class SourceResolver {
  /** Önbellek: tüketici ya da çözülememe nedeni. */
  private readonly maps = new Map<string, Promise<MapEntry | string>>();
  /** Chunk URL'si → içindeki webpack eval modüllerinin haritaları. Chunk URL'leri değişmez (HMR yeni URL ile gelir). */
  private readonly chunks = new Map<string, Promise<Map<string, string> | null>>();

  constructor(
    private readonly fetchText: FetchText,
    /** Bu URL getirilebilir mi? (yerel köken / loopback) */
    private readonly isAllowed: (url: string) => boolean,
    private readonly opts: ResolverOptions = {},
  ) {}

  private cached(key: string, load: () => Promise<MapEntry | string>): Promise<MapEntry | string> {
    let p = this.maps.get(key);
    if (!p) {
      p = load().catch(() => 'source map okunamadı');
      this.maps.set(key, p);
    }
    return p;
  }

  private load(scriptUrl: string): Promise<MapEntry | string> {
    return this.cached(scriptUrl, () => this.loadUncached(scriptUrl));
  }

  private evalModules(script: string): Promise<Map<string, string> | null> {
    let p = this.chunks.get(script);
    if (!p) {
      p = this.fetchText(script)
        .then((code) => (code === null ? null : indexEvalModules(code)))
        .catch(() => null);
      this.chunks.set(script, p);
    }
    return p;
  }

  /** webpack eval modülü: en yeni chunk'tan başlayarak modülün satır içi haritasını arar. */
  private async loadEvalModule(moduleUrl: string): Promise<MapEntry | string> {
    for (const script of this.opts.listScripts?.() ?? []) {
      if (!this.isAllowed(script)) continue;
      const ref = (await this.evalModules(script))?.get(moduleUrl);
      if (!ref) continue;
      return this.cached(`${script}#${moduleUrl}`, async () => {
        const raw = decodeDataUrl(ref);
        if (!raw) return 'source map bulunamadı';
        return { consumer: new SourceMapConsumer(JSON.parse(raw) as RawSourceMap), mapUrl: moduleUrl };
      });
    }
    return 'webpack modülü yüklü betiklerde bulunamadı';
  }

  /**
   * RSC haritası her seferinde getirilir: webpack'te sunucu modülünün adı düzenlemeden sonra da aynı kalır,
   * önbellek eski satırı verirdi.
   */
  private async loadServer(file: string): Promise<MapEntry | string> {
    const mapUrl = this.opts.serverSourceMapUrl?.(file);
    if (!mapUrl) return 'sunucu bileşeni (RSC): source map konumu bilinmiyor';
    if (this.opts.serverRefetched?.()) {
      return 'sunucu bileşeni (RSC): sunucu yükü sayfa yüklendikten sonra yenilendi (HMR ya da gezinme); satır doğrulanamaz, doğru satır için sayfayı yenileyip tekrarlayın';
    }
    if (!this.isAllowed(mapUrl)) return NOT_LOCAL;
    try {
      const raw = await this.fetchText(mapUrl);
      if (!raw) return 'sunucu bileşeni (RSC): source map bulunamadı';
      return { consumer: new SourceMapConsumer(JSON.parse(raw) as RawSourceMap), mapUrl };
    } catch {
      return 'sunucu bileşeni (RSC): source map okunamadı';
    }
  }

  private async loadUncached(scriptUrl: string): Promise<MapEntry | string> {
    if (!this.isAllowed(scriptUrl)) return NOT_LOCAL;
    const code = await this.fetchText(scriptUrl);
    if (code === null) return 'betik getirilemedi';
    const ref = findSourceMappingUrl(code);
    if (!ref) return 'source map bulunamadı';
    let raw: string | null;
    let mapUrl = scriptUrl;
    if (ref.startsWith('data:')) raw = decodeDataUrl(ref);
    else {
      mapUrl = new URL(ref, scriptUrl).href;
      if (!this.isAllowed(mapUrl)) return NOT_LOCAL;
      raw = await this.fetchText(mapUrl);
    }
    if (!raw) return 'source map bulunamadı';
    const json = JSON.parse(raw) as RawSourceMap;
    return { consumer: new SourceMapConsumer(json), mapUrl };
  }

  async resolve(frame: StackFrame): Promise<ResolvedLocation> {
    const server = serverComponentFile(frame.url);
    const compiled: ResolvedLocation = { file: server ?? frame.url, line: frame.line, column: frame.column, resolved: false };
    const entry =
      server !== null
        ? await this.loadServer(server)
        : frame.url.startsWith('webpack-internal:')
          ? await this.loadEvalModule(frame.url)
          : TURBOPACK_HMR_RE.test(frame.url)
            ? TURBOPACK_HMR
            : await this.load(frame.url);
    if (typeof entry === 'string') return { ...compiled, reason: entry };
    const pos = entry.consumer.originalPositionFor({ line: frame.line, column: Math.max(0, frame.column - 1) });
    if (!pos.source || pos.line == null) return { ...compiled, reason: 'source map bu konumu eşlemiyor' };
    const out: ResolvedLocation = {
      file: toProjectPath(pos.source, entry.mapUrl, frame.url),
      line: pos.line,
      column: (pos.column ?? 0) + 1,
      resolved: true,
    };
    const content = entry.consumer.sourceContentFor(pos.source, true);
    if (content !== null) out.snippet = await snippetOf(content, pos.line);
    return out;
  }

  /**
   * React 18 `_debugSource`: satır zaten kaynak dosyadadır. Dosyayı sunan modül sayfada yüklüyse (Vite) yol dev
   * sunucusu köküne göreli yazılır ve kod parçası modülün haritasındaki kaynak içerikten alınır. Bulunamazsa konum
   * olduğu gibi döner (alıcı mutlak yolu proje köküne göre kısaltır).
   */
  async fromDebugSource(fileName: string, line: number, column?: number): Promise<ResolvedLocation> {
    const out: ResolvedLocation = { file: fileName, line, column: column ?? 1, resolved: true };
    const scripts = (this.opts.listScripts?.() ?? []).filter((u) => this.isAllowed(u));
    const scriptUrl = matchModuleUrl(fileName, scripts);
    if (!scriptUrl) return out;
    const urlPath = decodeURIComponent(new URL(scriptUrl).pathname);
    if (!urlPath.startsWith('/@fs/')) out.file = urlPath.slice(1);
    const entry = await this.load(scriptUrl);
    if (typeof entry === 'string') return out;
    const norm = fileName.replace(/\\/g, '/');
    const source = entry.consumer.sources.find((src) => {
      const p = toProjectPath(src, entry.mapUrl, scriptUrl);
      return p === out.file || p === norm || norm.endsWith(`/${p}`);
    });
    const content = source ? entry.consumer.sourceContentFor(source, true) : null;
    if (content !== null) out.snippet = await snippetOf(content, line);
    return out;
  }
}
