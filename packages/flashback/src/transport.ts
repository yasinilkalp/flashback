/**
 * `flashback-mcp` alıcısıyla konuşma (FRD §9.3) ve teslim yedekleri (FR-RCV-07/08/11).
 * Tüm istekler yamasız fetch ile yapılır; böylece Flashback'in kendi istekleri kayda girmez (FR-REC-10).
 */
import { PROJECT_HEADER, ROUTES, type HealthResponse, type IncidentSummary } from '@flashback/shared';
import { PAYLOAD_SCHEMA_VERSION } from './config.js';

export type ReceiverStatus = 'connected' | 'disconnected' | 'wrong_project';

export interface HealthResult {
  status: ReceiverStatus;
  health?: HealthResponse;
}

export type PostResult =
  | { ok: true; id: string }
  | { ok: false; network: true; error: string }
  | { ok: false; network: false; status: number; error: string };

type FetchFn = typeof fetch;

const HEALTH_TIMEOUT_MS = 2500;
const POST_TIMEOUT_MS = 15_000;

function timeout(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    return j.message ?? j.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export class ReceiverClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetchFn: FetchFn,
    /** `project` prop'u (FR-RCV-06): verilirse alıcının projesiyle karşılaştırılır. */
    private readonly project?: string,
  ) {}

  private url(path: string) {
    return `${this.endpoint}${path}`;
  }

  async health(): Promise<HealthResult> {
    try {
      const res = await this.fetchFn(this.url(ROUTES.health), { signal: timeout(HEALTH_TIMEOUT_MS) });
      if (!res.ok) return { status: 'disconnected' };
      const health = (await res.json()) as HealthResponse;
      const compatible =
        health.name === 'flashback-mcp' &&
        health.schemaVersion === PAYLOAD_SCHEMA_VERSION &&
        (this.project === undefined || health.projectName === this.project);
      return { status: compatible ? 'connected' : 'wrong_project', health };
    } catch {
      return { status: 'disconnected' };
    }
  }

  async postIncident(body: string): Promise<PostResult> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url(ROUTES.incidents), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.project ? { [PROJECT_HEADER]: this.project } : {}) },
        // Blob: metin tarayıcıda yerel olarak bir kez kodlanır. Düz metin gövde 4x CPU kısmada 3,8 MB'ta ~1 sn
        // tutuyordu, Blob ~0,15 sn (NFR-LAT-01; 07-nfr-olcumleri.md §5).
        body: typeof Blob === 'function' ? new Blob([body], { type: 'application/json' }) : body,
        signal: timeout(POST_TIMEOUT_MS),
      });
    } catch (err) {
      return { ok: false, network: true, error: err instanceof Error ? err.message : String(err) };
    }
    if (res.status === 201 || res.ok) {
      const j = (await res.json()) as { id: string };
      return { ok: true, id: j.id };
    }
    return { ok: false, network: false, status: res.status, error: await errorText(res) };
  }

  async list(): Promise<IncidentSummary[]> {
    const res = await this.fetchFn(this.url(ROUTES.incidents), { signal: timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(await errorText(res));
    return (await res.json()) as IncidentSummary[];
  }

  async reply(id: string, text: string): Promise<void> {
    const res = await this.fetchFn(this.url(ROUTES.messages(id)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await errorText(res));
  }

  async reopen(id: string, reason: string): Promise<void> {
    const res = await this.fetchFn(this.url(ROUTES.reopen(id)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(await errorText(res));
  }
}

/** `20261027-153012` (UTC) */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function downloadMarkdown(markdown: string, now = new Date()): string {
  const name = `${fileStamp(now)}.flashback.md`;
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

/**
 * Alıcıya ulaşılamadığında gizlenmiş Markdown'u panoya kopyalar (FR-RCV-07); pano yoksa ya da bağlam güvenli
 * değilse `.md` dosyası indirir (FR-RCV-08).
 */
export async function deliverFallback(markdown: string): Promise<{ kind: 'clipboard' } | { kind: 'download'; file: string }> {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (typeof window !== 'undefined' && window.isSecureContext && clipboard?.writeText) {
    try {
      await clipboard.writeText(markdown);
      return { kind: 'clipboard' };
    } catch {
      /* izin yok → indirme */
    }
  }
  return { kind: 'download', file: downloadMarkdown(markdown) };
}

interface QueuedIncident {
  body: string;
  queuedAt: string;
}

/** Sekme ömrü boyunca gönderilemeyen olaylar (FR-RCV-11); sessionStorage'a en iyi çabayla yazılır. */
export class PendingQueue {
  private items: QueuedIncident[];

  constructor(private readonly key = 'flashback:queue') {
    this.items = this.read();
  }

  private read(): QueuedIncident[] {
    try {
      return JSON.parse(sessionStorage.getItem(this.key) ?? '[]') as QueuedIncident[];
    } catch {
      return [];
    }
  }

  private write() {
    try {
      sessionStorage.setItem(this.key, JSON.stringify(this.items));
    } catch {
      /* kota dolu: bellekte kalır */
    }
  }

  get size(): number {
    return this.items.length;
  }

  add(body: string): void {
    this.items.push({ body, queuedAt: new Date().toISOString() });
    this.write();
  }

  /** Kuyruktakileri gönderir; ağ hatasında durur. Teslim edilen olay kimliklerini döndürür. */
  async flush(client: ReceiverClient): Promise<string[]> {
    const delivered: string[] = [];
    while (this.items.length) {
      const r = await client.postIncident(this.items[0].body);
      if (!r.ok && r.network) break;
      this.items.shift();
      this.write();
      if (r.ok) delivered.push(r.id);
    }
    return delivered;
  }
}
