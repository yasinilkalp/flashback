/**
 * fetch + XMLHttpRequest yakalama (FR-REC-03, FR-REC-04, FR-REC-05, FR-REC-10, FR-REC-13).
 *
 * - Gövdeler `LIMITS.bodyBytes` ile kırpılır; özgün boyut ve `truncated` saklanır. İkili gövdeler saklanmaz.
 * - Akış yanıtları bozulmaz: `response.clone()` yalnızca akış olmayan metinsel içerik türlerinde okunur;
 *   `text/event-stream`, ndjson vb. hiç okunmaz.
 * - Rewind'in kendi `endpoint`'i ve `ignoreUrls` kayda girmez.
 */
import { LIMITS, truncateText } from '@rewind/shared';

export interface NetworkRecord {
  seq: number;
  /** Başlangıç zamanı (epoch ms). */
  time: number;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  reqHeaders: Record<string, string>;
  resHeaders: Record<string, string>;
  reqBody?: string;
  resBody?: string;
  contentType?: string;
  bodySize?: number;
  truncated: boolean;
  error?: string;
}

export interface NetworkFilter {
  endpoint?: string;
  ignoreUrls: Array<string | RegExp>;
}

type FetchFn = typeof fetch;

interface XhrMeta {
  method: string;
  url: string;
  headers: Record<string, string>;
}

const STREAMING_RE = /event-stream|ndjson|stream\+json|x-mixed-replace/i;
const TEXTUAL_RE = /^(?:text\/|application\/(?:[\w.+-]*\+)?(?:json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql)|image\/svg\+xml)/i;
/** Bu boyutun üstündeki yanıtlar hiç okunmaz (yalnızca boyut kaydedilir). */
const MAX_READ_BYTES = 8 * 1024 * 1024;
/** Bileşen monte edilmeden önce (erken yakalama) tutulan en fazla süre ve kayıt sayısı. */
const EARLY_MAX_AGE_MS = 120_000;
const MAX_ENTRIES = 2000;

export function isReadableTextual(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  return TEXTUAL_RE.test(contentType) && !STREAMING_RE.test(contentType);
}

function baseHref(): string {
  return typeof location !== 'undefined' ? location.href : 'http://localhost/';
}

export function absoluteUrl(url: string): string {
  try {
    return new URL(url, baseHref()).href;
  } catch {
    return url;
  }
}

export function headersToObject(h: HeadersInit | Headers | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    h.forEach((v, k) => (out[k] = v));
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) out[k.toLowerCase()] = String(v);
  } else {
    for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  }
  return out;
}

function parseRawHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

/** İstek gövdesinden saklanabilir metin; ikili/akış gövdeler `undefined`. */
function requestBodyText(body: unknown): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
  return undefined;
}

function limitBody(text: string | undefined): { text?: string; truncated: boolean; size?: number } {
  if (text === undefined) return { truncated: false };
  const t = truncateText(text, LIMITS.bodyBytes);
  return { text: t.text, truncated: t.truncated, size: t.size };
}

export function matchesIgnore(url: string, ignore: Array<string | RegExp>): boolean {
  let pathAndQuery = url;
  try {
    const u = new URL(url);
    pathAndQuery = u.pathname + u.search;
  } catch {
    /* göreli */
  }
  return ignore.some((p) => (typeof p === 'string' ? url.startsWith(p) || pathAndQuery.startsWith(p) : p.test(url)));
}

export class NetworkCapture {
  private entries: NetworkRecord[] = [];
  private seq = 0;
  private filter: NetworkFilter = { ignoreUrls: [] };
  private target: (typeof globalThis) | null = null;
  private originalFetch: FetchFn | null = null;
  private wrappedFetch: FetchFn | null = null;
  private xhrOriginals: { open: XMLHttpRequest['open']; send: XMLHttpRequest['send']; setRequestHeader: XMLHttpRequest['setRequestHeader'] } | null = null;
  /** Bileşene bağlanana kadar (erken yakalama) yaşa göre budanır. */
  attached = false;

  get installed(): boolean {
    return this.target !== null;
  }

  /** Rewind'in kendi istekleri için yamasız fetch (kayda girmez). */
  get nativeFetch(): FetchFn {
    const f = this.originalFetch ?? globalThis.fetch;
    return f.bind(globalThis);
  }

  configure(filter: NetworkFilter): void {
    this.filter = { endpoint: filter.endpoint?.replace(/\/+$/, ''), ignoreUrls: filter.ignoreUrls };
    this.entries = this.entries.filter((e) => !this.excluded(e.url));
  }

  private excluded(absUrl: string): boolean {
    if (this.filter.endpoint && absUrl.startsWith(this.filter.endpoint)) return true;
    return matchesIgnore(absUrl, this.filter.ignoreUrls);
  }

  private push(e: Omit<NetworkRecord, 'seq'>) {
    if (!this.target) return; // yama başka bir sarmalayıcının altında kaldıysa bile kaldırıldıktan sonra kayıt yok
    if (this.excluded(e.url)) return; // gövde okunurken filtre değişmiş olabilir
    this.entries.push({ ...e, seq: ++this.seq });
    if (!this.attached) this.prune(Date.now() - EARLY_MAX_AGE_MS);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
  }

  /** Bu zamandan eski kayıtları atar. */
  prune(before: number): void {
    if (this.entries.length && this.entries[0].time < before) this.entries = this.entries.filter((e) => e.time >= before);
  }

  snapshot(): NetworkRecord[] {
    return [...this.entries].sort((a, b) => a.time - b.time);
  }

  clear(): void {
    this.entries = [];
  }

  install(target: typeof globalThis = globalThis): void {
    if (this.target) return;
    this.target = target;
    if (typeof target.fetch === 'function') this.patchFetch(target);
    if (typeof target.XMLHttpRequest === 'function') this.patchXhr(target);
  }

  /** Yamaları geri alır. Üstümüze başka bir yama eklendiyse onu bozmamak için yalnızca kendi işlevimizi söker. */
  uninstall(): void {
    const target = this.target;
    if (!target) return;
    if (this.originalFetch && target.fetch === this.wrappedFetch) target.fetch = this.originalFetch;
    if (this.xhrOriginals) Object.assign(target.XMLHttpRequest.prototype, this.xhrOriginals);
    this.target = null;
    this.originalFetch = null;
    this.wrappedFetch = null;
    this.xhrOriginals = null;
  }

  private patchFetch(target: typeof globalThis) {
    const original = target.fetch;
    this.originalFetch = original;
    const self = this;
    const wrapped: FetchFn = async function rewindFetch(input: RequestInfo | URL, init?: RequestInit) {
      const isRequest = typeof Request !== 'undefined' && input instanceof Request;
      const rawUrl = isRequest ? (input as Request).url : String(input instanceof URL ? input.href : input);
      const url = absoluteUrl(rawUrl);
      if (self.excluded(url)) return original.call(target, input, init);
      const method = (init?.method ?? (isRequest ? (input as Request).method : 'GET')).toUpperCase();
      const reqHeaders = { ...(isRequest ? headersToObject((input as Request).headers) : {}), ...headersToObject(init?.headers) };
      const reqBody = limitBody(requestBodyText(init?.body));
      const time = Date.now();
      const t0 = performance.now();
      let res: Response;
      try {
        res = await original.call(target, input, init);
      } catch (err) {
        self.push({
          time, method, url, status: 0, durationMs: Math.round(performance.now() - t0), reqHeaders, resHeaders: {},
          reqBody: reqBody.text, truncated: reqBody.truncated, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
        throw err;
      }
      const durationMs = Math.round(performance.now() - t0);
      const contentType = res.headers.get('content-type') ?? undefined;
      const length = Number(res.headers.get('content-length') ?? Number.NaN);
      const base = {
        time, method, url, status: res.status, durationMs, reqHeaders, resHeaders: headersToObject(res.headers),
        reqBody: reqBody.text, contentType,
      };
      const readable = isReadableTextual(contentType) && res.body !== null && !(length > MAX_READ_BYTES);
      if (!readable) {
        self.push({ ...base, truncated: reqBody.truncated || length > MAX_READ_BYTES, bodySize: Number.isFinite(length) ? length : undefined });
        return res;
      }
      let clone: Response | null = null;
      try {
        clone = res.clone();
      } catch {
        /* gövde kullanılmış */
      }
      if (!clone) self.push({ ...base, truncated: reqBody.truncated });
      else
        clone.text().then(
          (text) => {
            const body = limitBody(text);
            self.push({ ...base, resBody: body.text, bodySize: body.size, truncated: body.truncated || reqBody.truncated });
          },
          (err: unknown) => self.push({ ...base, truncated: reqBody.truncated, error: `gövde okunamadı: ${String(err)}` }),
        );
      return res;
    };
    this.wrappedFetch = wrapped;
    target.fetch = wrapped;
  }

  private patchXhr(target: typeof globalThis) {
    const proto = target.XMLHttpRequest.prototype;
    const originals = { open: proto.open, send: proto.send, setRequestHeader: proto.setRequestHeader };
    this.xhrOriginals = originals;
    const metas = new WeakMap<XMLHttpRequest, XhrMeta>();
    const self = this;

    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      metas.set(this, { method: String(method).toUpperCase(), url: absoluteUrl(String(url)), headers: {} });
      return (originals.open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as XMLHttpRequest['open'];

    proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
      const meta = metas.get(this);
      if (meta) meta.headers[name.toLowerCase()] = value;
      return originals.setRequestHeader.call(this, name, value);
    };

    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = metas.get(this);
      if (meta && !self.excluded(meta.url)) {
        const time = Date.now();
        const t0 = performance.now();
        const reqBody = limitBody(requestBodyText(body));
        let failure: string | undefined;
        const fail = (kind: string) => () => (failure = kind);
        this.addEventListener('error', fail('ağ hatası'));
        this.addEventListener('abort', fail('iptal edildi'));
        this.addEventListener('timeout', fail('zaman aşımı'));
        this.addEventListener('loadend', () => {
          const resHeaders = parseRawHeaders(this.getAllResponseHeaders());
          const contentType = resHeaders['content-type'];
          let text: string | undefined;
          if (!failure && isReadableTextual(contentType)) {
            if (this.responseType === '' || this.responseType === 'text') text = this.responseText;
            else if (this.responseType === 'json') text = JSON.stringify(this.response);
          }
          const res = limitBody(text);
          self.push({
            time, method: meta.method, url: meta.url, status: this.status, durationMs: Math.round(performance.now() - t0),
            reqHeaders: meta.headers, resHeaders, reqBody: reqBody.text, resBody: res.text, contentType, bodySize: res.size,
            truncated: res.truncated || reqBody.truncated, error: failure,
          });
        });
      }
      return originals.send.call(this, body);
    };
  }
}
