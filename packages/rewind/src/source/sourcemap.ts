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
 * Kaynak yolunu projeye göreli yapar: köken, Vite `/@fs/`, webpack/Next önekleri atılır.
 * `base`: göreli kaynakların çözüldüğü URL (map URL'si); `scriptUrl`: derlenmiş modülün URL'si.
 */
export function toProjectPath(source: string, base: string, scriptUrl = base): string {
  const webpack = /^webpack(?:-internal)?:\/\/\/?(?:\([^)]*\)\/|[^/]*\/)?(?:\.\/)?(.*)$/.exec(source);
  if (webpack) return webpack[1].replace(/\?.*$/, '');
  if (source.startsWith('file://')) return decodeURIComponent(source.slice('file://'.length));
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

export class SourceResolver {
  /** Önbellek: tüketici ya da çözülememe nedeni. */
  private readonly maps = new Map<string, Promise<MapEntry | string>>();

  constructor(
    private readonly fetchText: FetchText,
    /** Bu URL getirilebilir mi? (yerel köken / loopback) */
    private readonly isAllowed: (url: string) => boolean,
  ) {}

  private load(scriptUrl: string): Promise<MapEntry | string> {
    let p = this.maps.get(scriptUrl);
    if (!p) {
      p = this.loadUncached(scriptUrl).catch(() => 'source map okunamadı');
      this.maps.set(scriptUrl, p);
    }
    return p;
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
    if (content !== null) {
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, pos.line - 3);
      const end = Math.min(lines.length, pos.line + 3);
      out.snippet = { startLine: start, lines: lines.slice(start - 1, end), fileHash: await hashContent(content) };
    }
    return out;
  }
}
