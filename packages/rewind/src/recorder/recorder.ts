/**
 * Kaydedici: rrweb DOM kaydı (halka tampon) + ağ + konsol + adımlar + store (FR-REC-*).
 * Panel açılınca `freeze()` tamponun o anki kopyasını verir; kayıt arka planda boşluksuz sürer (FR-REC-11).
 */
import { record, type eventWithTime } from 'rrweb';
import type { ResolvedConfig } from '../config.js';
import { MEMORY_LIMIT_BYTES } from '../config.js';
import { ConsoleCapture, type ConsoleRecord } from './console.js';
import { network, stores } from './early.js';
import { createInputMasker, type InputMasker } from './mask.js';
import type { NetworkRecord } from './network.js';
import { EventRing } from './ring.js';
import { StepCapture, type StepRecord } from './steps.js';
import type { StoreRecord } from './store.js';

/** rrweb'in hiç kaydetmediği bölgeler: geliştiricinin işaretledikleri ve Rewind arayüzü (FR-RED-13, FR-REC-10). */
export const BLOCK_SELECTOR = '[data-rewind-block], [data-rewind-ui]';
export const MASK_TEXT_SELECTOR = '[data-rewind-mask]';
/** Panel açılış/kapanış işaretçisi (FR-REC-12). */
export const PANEL_EVENT_TAG = 'rewind:panel';

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
  /** Penceredeki ilk rrweb olayının zamanı (epoch ms). */
  windowStart: number;
  /** Pencere sayfa yüklenişinden sonra mı başlıyor (eski dilimler atıldı)? */
  evicted: boolean;
  memoryWarning: boolean;
  frozenAt: number;
}

export class Recorder {
  private readonly ring: EventRing;
  private readonly console = new ConsoleCapture();
  private readonly steps: StepCapture;
  private stopRrweb: (() => void) | undefined;
  readonly mask: InputMasker;

  constructor(
    private readonly cfg: ResolvedConfig,
    isOwnEvent: (e: Event) => boolean,
  ) {
    this.mask = createInputMasker(cfg.redact, cfg.maskAllInputs);
    this.steps = new StepCapture(this.mask, isOwnEvent);
    this.ring = new EventRing(MEMORY_LIMIT_BYTES, (start) => {
      network().prune(start);
      stores().prune(start);
      this.console.prune(start);
      this.steps.prune(start);
    });
  }

  start(): void {
    network().configure({ endpoint: this.cfg.endpoint, ignoreUrls: this.cfg.ignoreUrls });
    network().install(window);
    network().attached = true;
    stores().attached = true;
    this.console.install(window);
    this.steps.install(window);
    this.stopRrweb = record({
      emit: (e, isCheckout) => this.ring.push(e, isCheckout),
      checkoutEveryNms: (this.cfg.bufferSeconds * 1000) / 2,
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
  }

  stop(): void {
    this.stopRrweb?.();
    this.stopRrweb = undefined;
    this.console.uninstall();
    this.steps.uninstall();
    network().attached = false;
    stores().attached = false;
  }

  get bufferMs(): number {
    return this.ring.durationMs();
  }

  get memoryWarning(): boolean {
    return this.ring.memoryWarning;
  }

  /** Zaman çizelgesine panel işaretçisi ekler (FR-REC-12). */
  markPanel(state: 'open' | 'close'): void {
    if (this.stopRrweb) record.addCustomEvent(PANEL_EVENT_TAG, { state });
  }

  freeze(): FrozenSnapshot {
    return {
      events: this.ring.events(),
      network: network().snapshot(),
      console: this.console.snapshot(),
      steps: this.steps.snapshot(),
      store: stores().snapshot(),
      windowStart: this.ring.windowStart,
      evicted: this.ring.evicted,
      memoryWarning: this.ring.memoryWarning,
      frozenAt: Date.now(),
    };
  }
}
