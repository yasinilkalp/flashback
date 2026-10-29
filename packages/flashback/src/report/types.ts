/**
 * Rapor: tarayıcıda gizlenmiş hâliyle kurulur. Vite eklentisi bunu JSON olarak alır, yolları proje köküne göre
 * düzeltir ve Markdown'a çevirir; eklenti yoksa tarayıcı aynı Markdown'u panoya kopyalar.
 */
import type { FlashbackLocale } from '../types.js';

export const REPORT_VERSION = 1;

export interface ReportTarget {
  /** Öğenin CSS seçicisi. */
  selector: string;
  /** Öğenin JSX'inin yazıldığı dosya (dev sunucusu köküne göreli ya da mutlak). */
  file?: string;
  line?: number;
  column?: number;
  /** `false`: satır doğrulanamadı (`reason` neden). */
  resolved?: boolean;
  reason?: string;
  snippet?: { startLine: number; lines: string[] };
  /** Konum öğenin kendisinin değil, en yakın atasının JSX'i. */
  fromAncestor?: boolean;
  /** En yakından köke bileşen adları. */
  components: string[];
  props?: unknown;
  state?: unknown;
  /** Öğenin HTML'i (kısaltılmış). */
  html?: string;
}

export interface ReportRequest {
  /** Rapordan kaç ms önce başladı. */
  ago: number;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  error?: string;
  reqBody?: string;
  resBody?: string;
}

export interface ReportConsole {
  ago: number;
  level: string;
  message: string;
  source?: string;
}

export interface ReportStep {
  ago: number;
  type: string;
  selector?: string;
  label?: string;
  value?: string;
  key?: string;
  url?: string;
}

export interface ReportStore {
  ago: number;
  name: string;
  path: string;
  before: unknown;
  after: unknown;
}

export interface Report {
  v: typeof REPORT_VERSION;
  lang: FlashbackLocale;
  /** ISO zaman damgası. */
  createdAt: string;
  /** Geliştiricinin notu: ne yanlış? */
  note: string;
  page: { url: string; title: string; viewport: string };
  /** Seçilen öğe; sayfa geneli raporda yok. */
  target?: ReportTarget;
  network: ReportRequest[];
  console: ReportConsole[];
  steps: ReportStep[];
  store: ReportStore[];
  /** Gizlenen değer sayısı; `null`: gizleme kapalı. */
  redacted: number | null;
}
