/**
 * Kaydedici: rrweb DOM kaydı + ağ + konsol + adımlar + store (FR-REC-*).
 * Kayıt elle başlatılır (`start`) ve durdurulur (`stop`); durdurma klibin kopyasını verir ve kaydı söker (FR-REC-01).
 */
import { record, type eventWithTime } from 'rrweb';
import type { ResolvedConfig } from '../config.js';
import { MEMORY_LIMIT_BYTES } from '../config.js';
import { ClipBuffer } from './clip.js';
import { ConsoleCapture, type ConsoleRecord } from './console.js';
import { network, stores } from './early.js';
import { createInputMasker, type InputMasker } from './mask.js';
import type { NetworkRecord } from './network.js';
import { StepCapture, type StepRecord } from './steps.js';
import type { StoreRecord } from './store.js';

/** rrweb'in hiç kaydetmediği bölgeler: geliştiricinin işaretledikleri ve Flashback arayüzü (FR-RED-13, FR-REC-10). */
export const BLOCK_SELECTOR = '[data-flashback-block], [data-flashback-ui]';
export const MASK_TEXT_SELECTOR = '[data-flashback-mask]';

/** Kayıt, sayfa yüklenişinden bu kadar sonra başladıysa öncesindeki durum klipte yoktur (Kanıt güveni). */
const LATE_START_MS = 3000;
/** Kayıttan önceki bu kadar ağ ve store geçmişi klibe bağlam olarak girer (erken yakalamanın sınırıyla aynı). */
const PRE_CLIP_MS = 120_000;

const ALL_INPUTS = {
  color: true, date: true, 'datetime-local': true, email: true, month: true, number: true, range: true, search: true,
  tel: true, text: true, time: true, url: true, week: true, textarea: true, select: true, password: true,
};

export interface FrozenSnapshot {
  events: eventWithTime[];
  network: NetworkRecord[];
  console: ConsoleRecord[];
  steps: StepRecord[];
  store: StoreRecord[];
  /** Kaydın başladığı an (epoch ms). */
  windowStart: number;
  /** Kayıt sayfa yüklenişinden sonra mı başlatıldı (öncesindeki durum klipte yok)? */
  lateStart: boolean;
  /** Klip bellek sınırında kesildi (NFR-MEM-01). */
  memoryWarning: boolean;
  frozenAt: number;
}

export class Recorder {
  private readonly clip: ClipBuffer;
  private readonly console = new ConsoleCapture();
  private readonly steps: StepCapture;
  private stopRrweb: (() => void) | undefined;
  private limitTimer: ReturnType<typeof setTimeout> | undefined;
  private clipStart = 0;
  readonly mask: InputMasker;

  constructor(
    private readonly cfg: ResolvedConfig,
    isOwnEvent: (e: Event) => boolean,
    /** Bellek ya da süre sınırına ulaşıldı: çağıran klibi durdurup kaydeder (NFR-MEM-01, FR-REC-02). */
    private readonly onLimit: () => void = () => {},
  ) {
    this.mask = createInputMasker(cfg.redact, cfg.maskAllInputs);
    this.steps = new StepCapture(this.mask, isOwnEvent);
    // rrweb'in emit çağrısının içinden kayıt durdurulmaz: sınır bir sonraki görevde bildirilir.
    this.clip = new ClipBuffer(MEMORY_LIMIT_BYTES, () => setTimeout(() => this.onLimit(), 0));
  }

  get recording(): boolean {
    return this.stopRrweb !== undefined;
  }

  /** Süren kaydın süresi (ms); kayıt yoksa 0. */
  get elapsedMs(): number {
    return this.recording ? Date.now() - this.clipStart : 0;
  }

  /**
   * Yeni bir klip başlatır. Önceki kayıttan kalan konsol ve adım girdileri atılır. Ağ ve store girdileri kayıt
   * dışındayken zaten son 2 dakikayla sınırlıdır ve klibe bağlam olarak girer: kök neden çoğu zaman kayıttan önce,
   * sayfa yüklenirken atılan bir istektedir (FR-REC-13; ör. YAZ10'da `/api/shipping`).
   */
  start(): void {
    if (this.recording) return;
    const now = Date.now();
    this.clipStart = now;
    this.clip.clear();
    network().configure({ endpoint: this.cfg.endpoint, ignoreUrls: this.cfg.ignoreUrls });
    network().install(window);
    this.console.prune(now);
    this.steps.prune(now);
    network().prune(now - PRE_CLIP_MS);
    stores().prune(now - PRE_CLIP_MS);
    network().attached = true;
    stores().attached = true;
    this.console.install(window);
    this.steps.install(window);
    this.stopRrweb = record({
      emit: (e) => this.clip.push(e),
      blockSelector: BLOCK_SELECTOR,
      maskTextSelector: MASK_TEXT_SELECTOR,
      maskInputOptions: ALL_INPUTS,
      maskInputFn: (text, el) => this.mask(text, el).value,
      recordAfter: 'DOMContentLoaded',
      recordCanvas: false,
      collectFonts: false,
      inlineImages: false,
      sampling: { input: 'last' },
    });
    this.limitTimer = setTimeout(() => this.onLimit(), this.cfg.maxRecordSeconds * 1000);
  }

  /** Kaydı durdurur ve klibi döndürür; kayıt yoksa `null`. */
  stop(): FrozenSnapshot | null {
    if (!this.recording) return null;
    const snapshot = this.freeze();
    clearTimeout(this.limitTimer);
    this.limitTimer = undefined;
    this.stopRrweb?.();
    this.stopRrweb = undefined;
    this.console.uninstall();
    this.steps.uninstall();
    network().attached = false;
    stores().attached = false;
    this.clip.clear();
    return snapshot;
  }

  private freeze(): FrozenSnapshot {
    const sinceLoad = typeof performance === 'undefined' ? 0 : this.clipStart - performance.timeOrigin;
    return {
      events: this.clip.events(),
      network: network().snapshot(),
      console: this.console.snapshot(),
      steps: this.steps.snapshot(),
      store: stores().snapshot(),
      windowStart: this.clipStart,
      lateStart: sinceLoad > LATE_START_MS,
      memoryWarning: this.clip.full,
      frozenAt: Date.now(),
    };
  }
}
