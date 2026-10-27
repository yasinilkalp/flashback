/**
 * Tarayıcıda source map çözümleme (FR-MARK-04, FR-MARK-11, FR-MARK-12).
 *
 * Betik URL'si getirilir, son `//# sourceMappingURL=` yorumu bulunur (satır içi `data:` ya da URL), tüketici
 * önbelleğe alınır. Çözülemeyen her durumda derlenmiş konum `resolved:false` ile döner — tahmin YAPILMAZ.
 */
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';
import { hashContent } from '../hash.js';
import type { StackFrame } from './stack.js';

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
  /**
   * Konum öğenin kendi JSX'i değil, onu oluşturan en yakın atanınki (öğe bağımlılık kodunda ya da React'in sahip
   * yığını sınırı aşıldığında oluşturulmuş). Panel ve Kanıt güveni bunu açıkça gösterir.
   */
  fromAncestor?: boolean;
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

/**
 * Kaynak yolunu projeye göreli yapar: köken, Vite `/@fs/`, webpack/Next/Turbopack önekleri atılır.
 * `base`: göreli kaynakların çözüldüğü URL (map URL'si); `scriptUrl`: derlenmiş modülün URL'si.
 * `file://` kaynakları (Turbopack, Next RSC) mutlak dosya yolu olarak kalır; Windows'ta `C:/…` biçimindedir.
 */
export function toProjectPath(source: string, base: string, scriptUrl = base): string {
  const webpack = /^webpack(?:-internal)?:\/\/\/?(?:\([^)]*\)\/|[^/]*\/)?(?:\.\/)?(.*)$/.exec(source);
  if (webpack) return webpack[1].replace(/\?.*$/, '');
  // Turbopack: "turbopack:///[project]/app/page.tsx", "[project]/app/page.tsx".
  const turbopack = /^(?:turbopack:\/\/\/)?\[project\]\/(.*)$/.exec(source);
  if (turbopack) return turbopack[1].replace(/\?.*$/, '');
  if (source.startsWith('file://')) return fileUrlToPath(source);
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

/** `file:///home/u/a.tsx` → `/home/u/a.tsx`; `file:///C:/u/a.tsx` → `C:/u/a.tsx`. */
function fileUrlToPath(source: string): string {
  let path = source.slice('file://'.length).replace(/[?#].*$/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    /* olduğu gibi */
  }
  return /^\/[a-z]:[\\/]/i.test(path) ? path.slice(1) : path;
}

/**
 * React Flight (RSC) sunucu çerçevesi: React, sunucu bileşeninin yığınını istemcide sahte fonksiyonlarla
 * yeniden oluşturur; URL'leri `about://React/<ortam>/<dosya>?<n>` (React 19.1+) ya da `rsc://React/…` (19.0)
 * biçimindedir. Dönüş: sunucudaki dosya adı (`file:///…` ya da `webpack-internal:///(rsc)/…`).
 */
export function serverFrameFilename(url: string): string | null {
  const m = /^(?:about|rsc):\/\/React\/[^/]+\/(.+?)(?:\?\d+)?$/.exec(url);
  if (!m) return null;
  try {
    return decodeURI(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Next.js geliştirme sunucusunun source map ucu (`/__nextjs_source-map?filename=`): tarayıcının getiremeyeceği
 * çerçeveler için (webpack `eval-source-map` modülleri `webpack-internal:///…`, RSC sunucu çerçeveleri). Uç sayfanın
 * kendi kökenindedir (NFR-PRIV-01). Next dışı bir uygulamada `null`.
 */
export function nextDevSourceMapUrl(frameUrl: string, pageOrigin: string): string | null {
  const filename = serverFrameFilename(frameUrl) ?? (frameUrl.startsWith('webpack-internal:///') ? frameUrl : null);
  if (!filename) return null;
  const u = new URL('/__nextjs_source-map', pageOrigin);
  u.searchParams.set('filename', filename);
  return u.href;
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
const NOT_FETCHABLE = 'paketleyici içi modül (webpack-internal / RSC) getirilemez ve source map ucu yok';

export interface SourceResolverOptions {
  /**
   * Betik URL'si getirilemeyen çerçeveler (ör. `webpack-internal:///…`, RSC `about://React/Server/…`) için doğrudan
   * source map URL'si. `null`: bu çerçeve için yol yok.
   */
  mapUrlFor?: (frameUrl: string) => string | null;
  /**
   * React 18 `_debugSource.fileName` (mutlak dosya yolu) için sayfanın yüklediği modül URL'si (Vite: yolun sonu
   * modülün URL yoluyla aynı olan modül). Bulunursa yol dev sunucusu köküne göreli verilir ve kod parçası eklenir.
   */
  moduleUrlFor?: (file: string) => string | null;
}

/** `file` yolunun sonu, URL yollarından biriyle eşleşen en uzun aday (Vite `/@fs/` mutlak yolları dahil). */
export function matchModuleUrl(file: string, urls: Iterable<string>, pageOrigin: string): string | null {
  const norm = file.replace(/\\/g, '/');
  let best: string | null = null;
  let bestLen = 0;
  for (const raw of urls) {
    const u = safeUrl(raw);
    if (!u || u.origin !== pageOrigin) continue;
    let path: string;
    try {
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

export class SourceResolver {
  /** Önbellek: tüketici ya da çözülememe nedeni. */
  private readonly maps = new Map<string, Promise<MapEntry | string>>();

  constructor(
    private readonly fetchText: FetchText,
    /** Bu URL getirilebilir mi? (yerel köken / loopback) */
    private readonly isAllowed: (url: string) => boolean,
    private readonly options: SourceResolverOptions = {},
  ) {}

  private load(scriptUrl: string): Promise<MapEntry | string> {
    const direct = this.options.mapUrlFor?.(scriptUrl) ?? null;
    const key = direct ? `map:${direct}` : scriptUrl;
    let p = this.maps.get(key);
    if (!p) {
      p = (direct ? this.loadMap(direct) : this.loadUncached(scriptUrl)).catch(() => 'source map okunamadı');
      this.maps.set(key, p);
    }
    return p;
  }

  private async loadMap(mapUrl: string): Promise<MapEntry | string> {
    if (!this.isAllowed(mapUrl)) return NOT_LOCAL;
    const raw = await this.fetchText(mapUrl);
    if (!raw) return 'source map bulunamadı';
    return { consumer: new SourceMapConsumer(JSON.parse(raw) as RawSourceMap), mapUrl };
  }

  private async loadUncached(scriptUrl: string): Promise<MapEntry | string> {
    if (!this.isAllowed(scriptUrl)) {
      return /^(?:webpack-internal|about|rsc):/.test(scriptUrl) ? NOT_FETCHABLE : NOT_LOCAL;
    }
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

  /**
   * React 18 `_debugSource`: satır JSX dönüşümünden gelir (orijinal dosya), source map gerekmez. Modül URL'si
   * bulunursa yol göreli yapılır ve modülün source map'indeki kaynak içeriğinden kod parçası eklenir.
   */
  async fromDebugSource(fileName: string, line: number, column?: number): Promise<ResolvedLocation> {
    const out: ResolvedLocation = { file: fileName, line, column: column ?? 1, resolved: true };
    const scriptUrl = this.options.moduleUrlFor?.(fileName) ?? null;
    if (!scriptUrl) return out;
    const urlPath = decodeURIComponent(new URL(scriptUrl).pathname);
    out.file = urlPath.startsWith('/@fs/') ? urlPath.slice(4) : urlPath.slice(1);
    const entry = await this.load(scriptUrl);
    if (typeof entry === 'string') return out;
    const norm = fileName.replace(/\\/g, '/');
    const source = entry.consumer.sources.find((s) => {
      const p = toProjectPath(s, entry.mapUrl, scriptUrl);
      return p === out.file || norm.endsWith(`/${p}`) || p === norm;
    });
    const content = source ? entry.consumer.sourceContentFor(source, true) : null;
    if (content !== null) out.snippet = await snippetOf(content, line);
    return out;
  }

  async resolve(frame: StackFrame): Promise<ResolvedLocation> {
    const compiled: ResolvedLocation = { file: frame.url, line: frame.line, column: frame.column, resolved: false };
    const entry = await this.load(frame.url);
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
}

async function snippetOf(content: string, line: number): Promise<Snippet> {
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, line - 3);
  const end = Math.min(lines.length, line + 3);
  return { startLine: start, lines: lines.slice(start - 1, end), fileHash: await hashContent(content) };
}
