/**
 * Rewind denetleyicisi: kaydedici, alıcı istemcisi, gönderim kuyruğu ve panel durumu.
 * Arayüz (React) bu nesneye `useSyncExternalStore` ile abone olur.
 */
import type { HealthResponse, IncidentSummary } from '@rewind/shared';
import type { ResolvedConfig } from './config.js';
import { buildDraft, type Exclusions, type TargetCapture } from './draft/build.js';
import { collectEnv, getTabId, resolveConsoleSources } from './draft/collect.js';
import { prepareSubmission, type Submission } from './draft/report.js';
import { network } from './recorder/early.js';
import { Recorder, type FrozenSnapshot } from './recorder/recorder.js';
import { isLocalSource, matchModuleUrl, nextDevSourceMapUrl, SourceResolver } from './source/sourcemap.js';
import { deliverFallback, PendingQueue, ReceiverClient, type ReceiverStatus } from './transport.js';

const HEALTH_INTERVAL_MS = 3000;
const PREVIEW_SEEN_KEY = 'rewind:previewSeen';
const SEEN_KEY = 'rewind:seenMessages';

export interface ControllerState {
  open: boolean;
  receiver: ReceiverStatus;
  health?: HealthResponse;
  bufferMs: number;
  memoryWarning: boolean;
  incidents: IncidentSummary[] | null;
  unread: number;
  queued: number;
  /** Kuyruktan iletilen olay sayısı (son temizlikten beri). */
  queueDelivered: number;
}

export interface MarkInput {
  markedAt: number;
  target: TargetCapture | null;
  domRoot: Element | null;
  note: { what?: string; expected: string };
  exclude: Exclusions;
  primaryOverride?: { kind: 'network' | 'console'; seq: number };
}

export type SendResult =
  | { kind: 'sent'; id: string }
  | { kind: 'clipboard' }
  | { kind: 'download'; file: string }
  | { kind: 'rejected'; status: number; error: string };

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function unreadCount(incidents: IncidentSummary[], seen: Record<string, string>): number {
  let n = 0;
  for (const inc of incidents) {
    const since = seen[inc.id] ?? '';
    n += inc.messages.filter((m) => m.from === 'agent' && m.t > since).length;
  }
  return n;
}

/** Sayfanın yüklediği betik/modül URL'leri (kaynak zamanlaması + `<script src>`). */
function loadedScriptUrls(): string[] {
  const urls: string[] = [];
  try {
    for (const e of performance.getEntriesByType('resource')) urls.push(e.name);
  } catch {
    /* kaynak zamanlaması yok */
  }
  for (const s of Array.from(document.scripts)) if (s.src) urls.push(s.src);
  return urls;
}

export class RewindController {
  readonly recorder: Recorder;
  readonly client: ReceiverClient;
  readonly resolver: SourceResolver;
  readonly tabId = getTabId();
  private readonly queue = new PendingQueue();
  private state: ControllerState;
  private listeners = new Set<() => void>();
  private timers: Array<ReturnType<typeof setInterval>> = [];
  /** Panel açıldığında dondurulan tampon (FR-REC-11). */
  frozen: FrozenSnapshot | null = null;

  constructor(
    readonly cfg: ResolvedConfig,
    /** Rewind arayüz kökü; olayları kayda girmez. */
    readonly host: HTMLElement,
  ) {
    this.recorder = new Recorder(cfg, (e) => e.composedPath().includes(host));
    const fetchFn = network().nativeFetch;
    this.client = new ReceiverClient(cfg.endpoint, fetchFn, cfg.project);
    this.resolver = new SourceResolver(
      async (url) => {
        const res = await fetchFn(url);
        return res.ok ? res.text() : null;
      },
      (url) => isLocalSource(url, location.origin),
      {
        // Next.js geliştirme sunucusu: webpack-internal ve RSC sunucu çerçeveleri için source map ucu.
        mapUrlFor: (url) => ((window as { next?: { version?: string } }).next?.version ? nextDevSourceMapUrl(url, location.origin) : null),
        // React 18 `_debugSource` mutlak yolu → sayfanın yüklediği modül (Vite).
        moduleUrlFor: (file) => matchModuleUrl(file, loadedScriptUrls(), location.origin),
      },
    );
    this.state = { open: false, receiver: 'disconnected', bufferMs: 0, memoryWarning: false, incidents: null, unread: 0, queued: this.queue.size, queueDelivered: 0 };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): ControllerState => this.state;

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  start(): void {
    this.recorder.start();
    void this.poll();
    this.timers.push(setInterval(() => void this.poll(), HEALTH_INTERVAL_MS));
    this.timers.push(
      setInterval(() => {
        if (!this.state.open) this.set({ bufferMs: this.recorder.bufferMs, memoryWarning: this.recorder.memoryWarning });
      }, 1000),
    );
  }

  stop(): void {
    for (const t of this.timers.splice(0)) clearInterval(t);
    this.recorder.stop();
    this.listeners.clear();
  }

  private async poll(): Promise<void> {
    const h = await this.client.health();
    this.set({ receiver: h.status, health: h.health });
    if (h.status !== 'connected') return;
    if (this.queue.size) {
      const delivered = await this.queue.flush(this.client);
      this.set({ queued: this.queue.size, queueDelivered: this.state.queueDelivered + delivered.length });
    }
    await this.refreshIncidents();
  }

  async refreshIncidents(): Promise<void> {
    try {
      const incidents = await this.client.list();
      this.set({ incidents, unread: unreadCount(incidents, readSeen()) });
    } catch {
      /* bir sonraki yoklamada yeniden denenir */
    }
  }

  markSeen(inc: IncidentSummary): void {
    const last = inc.messages.filter((m) => m.from === 'agent').map((m) => m.t).sort().pop();
    if (!last) return;
    const seen = readSeen();
    if (seen[inc.id] === last) return;
    seen[inc.id] = last;
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      /* depolama yok */
    }
    if (this.state.incidents) this.set({ unread: unreadCount(this.state.incidents, seen) });
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  open(): void {
    if (this.state.open) return;
    this.recorder.markPanel('open');
    this.frozen = this.recorder.freeze();
    this.set({ open: true, bufferMs: this.recorder.bufferMs, memoryWarning: this.frozen.memoryWarning, queueDelivered: 0 });
  }

  close(): void {
    if (!this.state.open) return;
    this.recorder.markPanel('close');
    this.frozen = null;
    this.set({ open: false });
  }

  /** Önizleme bu oturumda zorunlu mu? (ilk gönderim, FR-UI-08) */
  previewRequired(): boolean {
    try {
      return sessionStorage.getItem(PREVIEW_SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  }

  previewShown(): void {
    try {
      sessionStorage.setItem(PREVIEW_SEEN_KEY, '1');
    } catch {
      /* depolama yok */
    }
  }

  /** Yükü BİR KEZ kurar ve serileştirir; önizleme ve POST bu tek metinden türetilir. */
  async prepare(input: MarkInput): Promise<Submission> {
    const snapshot = this.frozen ?? this.recorder.freeze();
    const consoleResolved = await resolveConsoleSources(snapshot.console, this.resolver);
    const draft = buildDraft({
      snapshot: { ...snapshot, console: consoleResolved },
      markedAt: input.markedAt,
      note: input.note,
      target: input.target,
      primaryOverride: input.primaryOverride,
      exclude: input.exclude,
      domRoot: input.domRoot,
      env: collectEnv(this.tabId),
      redact: this.cfg.redact,
      historyMs: this.cfg.bufferSeconds * 1000,
    });
    return prepareSubmission(draft);
  }

  async send(submission: Submission): Promise<SendResult> {
    const r = await this.client.postIncident(submission.body);
    if (r.ok) {
      void this.refreshIncidents();
      return { kind: 'sent', id: r.id };
    }
    if (!r.network) return { kind: 'rejected', status: r.status, error: r.error };
    this.queue.add(submission.body);
    this.set({ queued: this.queue.size, receiver: 'disconnected' });
    return deliverFallback(submission.preview.markdown);
  }
}
