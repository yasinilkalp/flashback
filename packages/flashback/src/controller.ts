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
import { CaptureError, draftMedia, MediaCapture, needsMedia, type CaptureErrorKind, type MediaClip, type RecordOptions } from './recorder/media.js';
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
const RECORD_OPTIONS_KEY = 'flashback:recordOptions';

export type PanelTab = 'basket' | 'incidents';

/** Araç çubuğundaki kısa bildirim. */
export type Notice = { kind: 'added'; n: number; truncated: boolean } | { kind: 'tooShort' } | { kind: 'error'; message: string };

export interface ControllerState {
  open: boolean;
  /** Panelde açık sekme. */
  tab: PanelTab;
  /** "Kayda başla" seçim penceresi açık mı? */
  picker: boolean;
  /** Ekran/mikrofon izni bekleniyor (seçim penceresi açık kalır). */
  starting: boolean;
  /** Son kayıt denemesi neden başlamadı (izin yok, vazgeçildi, desteklenmiyor). */
  pickerError: CaptureErrorKind | null;
  /** Seçim penceresindeki kaynak ve mikrofon seçimi; sayfanın kökeninde saklanır. */
  recordOptions: RecordOptions;
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
  /** Olay gönderildi ama ekran kaydı yüklenemedi (FR-REC-16). */
  mediaFailed: Array<{ n: number; error: string }>;
}

/** Panelde açık sepet olayı ve klibi. */
export interface Selected {
  entry: BasketEntry;
  snapshot: FrozenSnapshot;
  /** Ekran/mikrofon kaydı (FR-REC-16). */
  media?: MediaClip;
}

function readRecordOptions(): RecordOptions {
  try {
    const o = JSON.parse(localStorage.getItem(RECORD_OPTIONS_KEY) ?? '{}') as Partial<RecordOptions>;
    return { source: o.source === 'screen' ? 'screen' : 'tab', mic: o.mic === true };
  } catch {
    return { source: 'tab', mic: false };
  }
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
  /** Süren ekran/mikrofon kaydı. */
  private media: MediaCapture | null = null;
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
      tab: 'basket',
      picker: false,
      starting: false,
      pickerError: null,
      recordOptions: readRecordOptions(),
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
    this.media?.release();
    this.media = null;
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

  // ---- Kayıt (FR-REC-01/02, FR-REC-16) -----------------------------------------

  /** "Kayda başla" seçim penceresini açar; panel açıksa kapanır. */
  openPicker(): void {
    if (this.recorder.recording) return;
    this.close();
    this.set({ picker: true, pickerError: null });
  }

  closePicker(): void {
    if (this.state.starting) return;
    this.set({ picker: false, pickerError: null });
  }

  setRecordOptions(o: RecordOptions): void {
    try {
      localStorage.setItem(RECORD_OPTIONS_KEY, JSON.stringify(o));
    } catch {
      /* depolama kapalı: seçim yalnızca bu oturumda geçerli */
    }
    this.set({ recordOptions: o, pickerError: null });
  }

  /**
   * Kaydı başlatır. Ekran/pencere ya da mikrofon seçildiyse önce izin istenir; kullanıcı vazgeçerse kayıt başlamaz
   * ve seçim penceresi hatayla açık kalır. DOM kaydı izin alındıktan sonra başlar: video ile aynı andan başlasın.
   */
  async startRecording(options: RecordOptions = this.state.recordOptions): Promise<boolean> {
    if (this.recorder.recording || this.state.starting) return false;
    let media: MediaCapture | null = null;
    if (needsMedia(options)) {
      media = new MediaCapture(options);
      this.set({ starting: true, pickerError: null });
      try {
        await media.acquire();
      } catch (err) {
        this.set({ starting: false, picker: true, pickerError: err instanceof CaptureError ? err.kind : 'screen' });
        return false;
      }
    }
    this.close();
    this.recorder.start();
    if (media) {
      try {
        media.start(() => void this.stopRecording());
        this.media = media;
      } catch {
        // MediaRecorder kurulamadı (desteklenmeyen biçim): DOM kaydı videosuz sürer.
        media.release();
      }
    }
    this.set({ recording: true, elapsedMs: 0, notice: null, picker: false, starting: false, pickerError: null });
    this.tick = setInterval(() => this.set({ elapsedMs: this.recorder.elapsedMs }), 1000);
    return true;
  }

  /**
   * Kaydı durdurur, klibi sepete ekler (FR-BSK-01) ve o olayın ekranını (not ve öğe seçimi) açar. Boş klip
   * eklenmez. Yanlışlıkla iki kez basılan düğme ya da kısayolun ürettiği çok kısa klip de eklenmez; sepet açılarak
   * durdurulan klip ise (`keepShort`) kısa da olsa eklenir.
   */
  async stopRecording(opts: { keepShort?: boolean } = {}): Promise<BasketEntry | null> {
    const snapshot = this.recorder.stop();
    const capture = this.media;
    this.media = null;
    clearInterval(this.tick);
    this.tick = undefined;
    if (!this.state.recording && !snapshot) return null;
    this.set({ recording: false, elapsedMs: 0 });
    const media = capture ? await capture.stop().catch(() => null) : null;
    if (!snapshot) return null;
    if (snapshot.events.length < 2 || (!opts.keepShort && snapshot.frozenAt - snapshot.windowStart < MIN_CLIP_MS)) {
      this.notify({ kind: 'tooShort' });
      return null;
    }
    try {
      await this.ready;
      const entry = await this.basket!.add(snapshot, location.href, media);
      await this.reloadBasket();
      this.notify({ kind: 'added', n: entry.n, truncated: entry.truncated });
      await this.select(entry.id);
      // Panel kullanıcı tarafından açıldıysa (ör. Kayıtlar düğmesi) sekmesine dokunulmaz.
      if (!this.state.open) this.set({ open: true, tab: 'basket', queueDelivered: 0 });
      return entry;
    } catch (err) {
      this.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * Kısayol (FR-UI-02): kayıt sürüyorsa durdurur; seçim penceresi açıksa son seçimle kaydı başlatır; değilse
   * seçim penceresini açar (panel açıksa kapanır).
   */
  toggleRecording(): void {
    if (this.recorder.recording) {
      void this.stopRecording();
      return;
    }
    if (this.state.picker) void this.startRecording();
    else this.openPicker();
  }

  // ---- Panel ve sepet ----------------------------------------------------------

  /** Paneli açar; kayıt sürüyorsa önce durdurulup sepete eklenir. */
  open(tab: PanelTab = this.state.tab): void {
    if (this.state.open) {
      if (tab !== this.state.tab) this.set({ tab });
      return;
    }
    this.set({ open: true, tab, picker: false, pickerError: null, queueDelivered: 0 });
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

  setTab(tab: PanelTab): void {
    this.set({ tab });
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
    const media = entry.media ? await this.basket!.media(id) : undefined;
    this.selected = { entry, snapshot, ...(media ? { media } : {}) };
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
    const clip = this.selected?.media;
    const media = clip && !input.exclude.media ? await draftMedia(clip, input.markedAt) : undefined;
    const consoleResolved = await resolveConsoleSources(snapshot.console, this.resolver);
    const draft = buildDraft({
      snapshot: { ...snapshot, console: consoleResolved },
      markedAt: input.markedAt,
      note: input.note,
      target: input.target,
      primaryOverride: input.primaryOverride,
      exclude: input.exclude,
      domRoot: input.domRoot,
      media,
      env: collectEnv(this.tabId),
      redact: this.cfg.redact,
    });
    return prepareSubmission(draft);
  }

  /** Not yazılmış olayı gönderime hazır olarak sepete yazar (FR-BSK-06). */
  async saveDraft(submission: Submission, note: { what?: string; expected: string }): Promise<BasketEntry> {
    const sel = this.selected;
    if (!sel) throw new Error('Sepette seçili olay yok');
    const entry = await this.basket!.setDraft(sel.entry.id, { body: submission.body, ...(submission.media ? { media: true } : {}) }, note);
    this.selected = { ...sel, entry };
    await this.reloadBasket();
    return entry;
  }

  private async readyDrafts(): Promise<Array<{ entry: BasketEntry; body: string; media: boolean }>> {
    await this.ready;
    const out: Array<{ entry: BasketEntry; body: string; media: boolean }> = [];
    for (const entry of await this.basket!.list()) {
      const d = entry.ready ? await this.basket!.draft(entry.id) : undefined;
      if (d) out.push({ entry, body: d.body, media: d.media === true });
    }
    return out;
  }

  /**
   * Hazır olayları alıcıya gönderir (FR-BSK-03). Birden fazlaysa ortak bir grup taşırlar (FR-BSK-05).
   * Gönderilen olay sepetten düşer; alıcıya ulaşılamazsa kalanlar sepette durur ve prompt olarak kopyalanır.
   */
  async sendAll(): Promise<BatchResult> {
    const items = await this.readyDrafts();
    const result: BatchResult = { sent: [], rejected: [], mediaFailed: [] };
    if (!items.length) return result;
    const groupId = items.length > 1 ? createGroupId() : undefined;
    for (const [i, { entry, body, media }] of items.entries()) {
      const r = await this.client.postIncident(groupId ? withGroup(body, { id: groupId, index: i + 1, size: items.length }) : body);
      if (r.ok) {
        result.sent.push({ n: entry.n, id: r.id });
        // FR-REC-16: kayıt dosyası olay oluştuktan sonra ayrı bir istekle yüklenir.
        const clip = media ? await this.basket!.media(entry.id) : undefined;
        if (clip) {
          const up = await this.client.postMedia(r.id, clip.blob, clip.mimeType);
          if (!up.ok) result.mediaFailed.push({ n: entry.n, error: up.error });
        }
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
