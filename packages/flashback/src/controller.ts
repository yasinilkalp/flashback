/**
 * Flashback denetleyicisi: kaydedici, olay sepeti, alıcı istemcisi ve panel durumu.
 * Arayüz (React) bu nesneye `useSyncExternalStore` ile abone olur.
 */
import type { HealthResponse, IncidentSummary } from '@flashback/shared';
import { Basket, createGroupId, type BasketEntry } from './basket.js';
import type { ResolvedConfig } from './config.js';
import { buildDraft, type Exclusions, type TargetCapture } from './draft/build.js';
import { collectEnv, getTabId, resolveConsoleSources } from './draft/collect.js';
import { agentPrompt, combinePrompt, prepareSubmission, previewFromBody, withGroup, type Submission } from './draft/report.js';
import { network } from './recorder/early.js';
import { Recorder, type FrozenSnapshot } from './recorder/recorder.js';
import { pageResolverOptions } from './source/environment.js';
import { isLocalSource, SourceResolver } from './source/sourcemap.js';
import { deliverFallback, PendingQueue, ReceiverClient, type ReceiverStatus } from './transport.js';

const HEALTH_INTERVAL_MS = 3000;
const NOTICE_MS = 4000;
/** Bundan kısa kayıt sepete eklenmez (yanlışlıkla iki kez basılan kısayol). */
const MIN_CLIP_MS = 500;
const PREVIEW_SEEN_KEY = 'flashback:previewSeen';
const SEEN_KEY = 'flashback:seenMessages';

/** Araç çubuğundaki kısa bildirim. */
export type Notice = { kind: 'added'; n: number; truncated: boolean } | { kind: 'tooShort' } | { kind: 'error'; message: string };

export interface ControllerState {
  open: boolean;
  receiver: ReceiverStatus;
  health?: HealthResponse;
  recording: boolean;
  /** Süren kaydın süresi (ms); kayıt yoksa 0. */
  elapsedMs: number;
  /** Sepetteki olaylar, sıra numarasına göre; `null`: sepet yükleniyor. */
  basket: BasketEntry[] | null;
  /** Panelde açık olan sepet olayı. */
  selectedId: string | null;
  notice: Notice | null;
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

export type Fallback = { kind: 'clipboard' } | { kind: 'download'; file: string };

/** "Hepsini gönder" sonucu (FR-BSK-03). */
export interface BatchResult {
  sent: Array<{ n: number; id: string }>;
  groupId?: string;
  rejected: Array<{ n: number; status: number; error: string }>;
  /** Alıcıya ulaşılamadı: kalan olaylar prompt olarak panoya kopyalandı ya da indirildi; sepette dururlar. */
  fallback?: Fallback;
  /** Gönderilen olaylar için ajana yapıştırılacak kısa istem. */
  prompt?: string;
}

/** Panelde açık sepet olayı ve klibi. */
export interface Selected {
  entry: BasketEntry;
  snapshot: FrozenSnapshot;
}

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

export class FlashbackController {
  readonly recorder: Recorder;
  readonly client: ReceiverClient;
  readonly resolver: SourceResolver;
  readonly tabId = getTabId();
  private readonly queue = new PendingQueue();
  private state: ControllerState;
  private listeners = new Set<() => void>();
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private tick: ReturnType<typeof setInterval> | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private basket: Basket | null = null;
  private ready: Promise<void> = Promise.resolve();
  /** Panelde açık olay (klip IndexedDB'den yüklenir). */
  selected: Selected | null = null;

  constructor(
    readonly cfg: ResolvedConfig,
    /** Flashback arayüz kökü; olayları kayda girmez. */
    readonly host: HTMLElement,
  ) {
    this.recorder = new Recorder(cfg, (e) => e.composedPath().includes(host), () => void this.stopRecording());
    const fetchFn = network().nativeFetch;
    this.client = new ReceiverClient(cfg.endpoint, fetchFn, cfg.project);
    this.resolver = new SourceResolver(
      async (url) => {
        const res = await fetchFn(url);
        return res.ok ? res.text() : null;
      },
      (url) => isLocalSource(url, location.origin),
      pageResolverOptions(),
    );
    this.state = {
      open: false,
      receiver: 'disconnected',
      recording: false,
      elapsedMs: 0,
      basket: null,
      selectedId: null,
      notice: null,
      incidents: null,
      unread: 0,
      queued: this.queue.size,
      queueDelivered: 0,
    };
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

  /** Kayıt başlamaz (FR-REC-01): yalnızca alıcı yoklanır ve sepet yüklenir. */
  start(): void {
    void this.poll();
    this.timers.push(setInterval(() => void this.poll(), HEALTH_INTERVAL_MS));
    this.ready = Basket.open().then(async (b) => {
      this.basket = b;
      this.set({ basket: await b.list() });
    });
  }

  stop(): void {
    for (const t of this.timers.splice(0)) clearInterval(t);
    clearInterval(this.tick);
    clearTimeout(this.noticeTimer);
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

  private notify(notice: Notice): void {
    clearTimeout(this.noticeTimer);
    this.set({ notice });
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), NOTICE_MS);
  }

  // ---- Kayıt (FR-REC-01/02) ----------------------------------------------------

  startRecording(): void {
    if (this.recorder.recording) return;
    this.recorder.start();
    this.set({ recording: true, elapsedMs: 0, notice: null });
    this.tick = setInterval(() => this.set({ elapsedMs: this.recorder.elapsedMs }), 1000);
  }

  /**
   * Kaydı durdurur ve klibi sepete ekler (FR-BSK-01). Boş klip eklenmez. Yanlışlıkla iki kez basılan düğme ya da
   * kısayolun ürettiği çok kısa klip de eklenmez; sepet açılarak durdurulan klip ise (`keepShort`) kısa da olsa eklenir.
   */
  async stopRecording(opts: { keepShort?: boolean } = {}): Promise<BasketEntry | null> {
    const snapshot = this.recorder.stop();
    clearInterval(this.tick);
    this.tick = undefined;
    if (!this.state.recording && !snapshot) return null;
    this.set({ recording: false, elapsedMs: 0 });
    if (!snapshot) return null;
    if (snapshot.events.length < 2 || (!opts.keepShort && snapshot.frozenAt - snapshot.windowStart < MIN_CLIP_MS)) {
      this.notify({ kind: 'tooShort' });
      return null;
    }
    try {
      await this.ready;
      const entry = await this.basket!.add(snapshot, location.href);
      await this.reloadBasket();
      this.notify({ kind: 'added', n: entry.n, truncated: entry.truncated });
      await this.select(entry.id);
      return entry;
    } catch (err) {
      this.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /** Kısayol (FR-UI-02): kaydı başlatır ya da durdurur. Panel açıksa kapanır, kayıt sayfada sürer. */
  toggleRecording(): void {
    if (this.recorder.recording) {
      void this.stopRecording();
      return;
    }
    this.close();
    this.startRecording();
  }

  // ---- Panel ve sepet ----------------------------------------------------------

  /** Paneli açar; kayıt sürüyorsa önce durdurulup sepete eklenir. */
  open(): void {
    if (this.state.open) return;
    this.set({ open: true, queueDelivered: 0 });
    if (this.recorder.recording) void this.stopRecording({ keepShort: true });
    else void this.ensureSelection();
  }

  close(): void {
    if (!this.state.open) return;
    this.set({ open: false });
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  private async reloadBasket(): Promise<BasketEntry[]> {
    const list = await this.basket!.list();
    const sel = this.selected && list.find((e) => e.id === this.selected!.entry.id);
    if (this.selected && !sel) this.selected = null;
    else if (this.selected && sel) this.selected = { ...this.selected, entry: sel };
    this.set({ basket: list, selectedId: this.selected?.entry.id ?? null });
    return list;
  }

  /** Seçili olay sepette değilse not bekleyen ilk olayı, o da yoksa sonuncuyu açar. */
  private async ensureSelection(): Promise<void> {
    await this.ready;
    const list = this.state.basket ?? [];
    if (this.selected && list.some((e) => e.id === this.selected!.entry.id)) return;
    const pick = list.find((e) => !e.ready) ?? list[list.length - 1];
    if (pick) await this.select(pick.id);
  }

  async select(id: string): Promise<void> {
    await this.ready;
    const entry = this.state.basket?.find((e) => e.id === id);
    const snapshot = entry && (await this.basket!.clip(id));
    if (!entry || !snapshot) return;
    this.selected = { entry, snapshot };
    this.set({ selectedId: id });
  }

  async removeItem(id: string): Promise<void> {
    await this.ready;
    await this.basket!.remove(id);
    await this.reloadBasket();
    await this.ensureSelection();
  }

  async clearBasket(): Promise<void> {
    await this.ready;
    await this.basket!.clear();
    this.selected = null;
    await this.reloadBasket();
  }

  /** Önizleme bu oturumda zorunlu mu? (ilk kayıt, FR-UI-08) */
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

  /** Seçili olayın yükünü BİR KEZ kurar ve serileştirir; önizleme ve sepete yazılan gövde bu tek metinden türetilir. */
  async prepare(input: MarkInput): Promise<Submission> {
    const snapshot = this.selected?.snapshot;
    if (!snapshot) throw new Error('Sepette seçili olay yok');
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
    });
    return prepareSubmission(draft);
  }

  /** Not yazılmış olayı gönderime hazır olarak sepete yazar (FR-BSK-06). */
  async saveDraft(submission: Submission, note: { what?: string; expected: string }): Promise<BasketEntry> {
    const sel = this.selected;
    if (!sel) throw new Error('Sepette seçili olay yok');
    const entry = await this.basket!.setDraft(sel.entry.id, { body: submission.body }, note);
    this.selected = { ...sel, entry };
    await this.reloadBasket();
    return entry;
  }

  private async readyDrafts(): Promise<Array<{ entry: BasketEntry; body: string }>> {
    await this.ready;
    const out: Array<{ entry: BasketEntry; body: string }> = [];
    for (const entry of await this.basket!.list()) {
      const d = entry.ready ? await this.basket!.draft(entry.id) : undefined;
      if (d) out.push({ entry, body: d.body });
    }
    return out;
  }

  /**
   * Hazır olayları alıcıya gönderir (FR-BSK-03). Birden fazlaysa ortak bir grup taşırlar (FR-BSK-05).
   * Gönderilen olay sepetten düşer; alıcıya ulaşılamazsa kalanlar sepette durur ve prompt olarak kopyalanır.
   */
  async sendAll(): Promise<BatchResult> {
    const items = await this.readyDrafts();
    const result: BatchResult = { sent: [], rejected: [] };
    if (!items.length) return result;
    const groupId = items.length > 1 ? createGroupId() : undefined;
    for (const [i, { entry, body }] of items.entries()) {
      const r = await this.client.postIncident(groupId ? withGroup(body, { id: groupId, index: i + 1, size: items.length }) : body);
      if (r.ok) {
        result.sent.push({ n: entry.n, id: r.id });
        await this.basket!.remove(entry.id);
        continue;
      }
      if (!r.network) {
        result.rejected.push({ n: entry.n, status: r.status, error: r.error });
        continue;
      }
      this.set({ receiver: 'disconnected' });
      result.fallback = (await this.copyPrompt()) ?? undefined;
      break;
    }
    if (result.sent.length) {
      result.groupId = groupId;
      result.prompt = agentPrompt(
        result.sent.map((s) => s.id),
        groupId,
      );
      void this.refreshIncidents();
    }
    await this.reloadBasket();
    await this.ensureSelection();
    return result;
  }

  /** Hazır olayların raporlarını tek prompt olarak panoya kopyalar; pano yoksa `.md` indirir (FR-BSK-04). */
  async copyPrompt(): Promise<Fallback | null> {
    const items = await this.readyDrafts();
    if (!items.length) return null;
    return deliverFallback(combinePrompt(items.map(({ body }) => previewFromBody(body).markdown)));
  }

  /** Metni panoya kopyalar; pano yoksa `.md` indirir. */
  copyText(text: string): Promise<Fallback> {
    return deliverFallback(text);
  }
}
