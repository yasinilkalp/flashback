/**
 * Arka plandaki hafif tampon: konsol, ağ, adımlar ve store. DOM, ekran ya da ses kaydedilmez; sayfa açık olduğu
 * sürece çalışır ve yalnızca son dakikayı tutar.
 */
import type { ResolvedConfig } from '../config.js';
import { ConsoleCapture, type ConsoleRecord } from './console.js';
import { network, stores } from './early.js';
import { createInputMasker } from './mask.js';
import type { NetworkRecord } from './network.js';
import { StepCapture, type StepRecord } from './steps.js';
import type { StoreRecord } from './store.js';

/** Rapora giren pencere. */
export const WINDOW_MS = 60_000;
/**
 * Pencereden eski olsa da rapora giren son istek sayısı. Kök neden çoğu zaman sayfa yüklenirken atılan ve yanlış
 * bir değer döndüren başarılı bir istektir (demo: `/api/shipping`).
 */
export const MIN_REQUESTS = 10;
const PRUNE_EVERY_MS = 15_000;

export interface Snapshot {
  /** Anlık görüntünün alındığı an (epoch ms). */
  at: number;
  network: NetworkRecord[];
  console: ConsoleRecord[];
  steps: StepRecord[];
  store: StoreRecord[];
}

export class Capture {
  private readonly console = new ConsoleCapture();
  private readonly steps: StepCapture;
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly cfg: ResolvedConfig,
    /** Flashback arayüzünden gelen olaylar mı? (kayda girmez) */
    isOwnEvent: (e: Event) => boolean,
  ) {
    this.steps = new StepCapture(createInputMasker(cfg.redact, false), isOwnEvent);
  }

  start(): void {
    network().configure({ ignoreUrls: this.cfg.ignoreUrls });
    network().install(window);
    this.console.install(window);
    this.steps.install(window);
    this.pruneTimer = setInterval(() => this.prune(Date.now() - WINDOW_MS), PRUNE_EVERY_MS);
  }

  stop(): void {
    clearInterval(this.pruneTimer);
    this.console.uninstall();
    this.steps.uninstall();
    this.console.clear();
    this.steps.clear();
  }

  private prune(before: number): void {
    this.console.prune(before);
    this.steps.prune(before);
    stores().prune(before);
  }

  snapshot(now = Date.now()): Snapshot {
    const since = now - WINDOW_MS;
    const requests = network().snapshot();
    const recent = requests.filter((e) => e.time >= since);
    return {
      at: now,
      network: recent.length >= MIN_REQUESTS ? recent : requests.slice(-MIN_REQUESTS),
      console: this.console.snapshot().filter((e) => e.time >= since),
      steps: this.steps.snapshot().filter((e) => e.time >= since),
      store: stores().snapshot().filter((e) => e.time >= since),
    };
  }
}
