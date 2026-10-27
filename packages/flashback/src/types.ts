/** `<Flashback/>` bileşeninin herkese açık tipleri (FRD §9.4). `noop` girişi de bu tipleri kullanır. */

export type FlashbackPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type FlashbackLocale = 'tr' | 'en';

export interface FlashbackRedactConfig {
  /** Ek hassas anahtar adları (FR-RED-06). */
  keys?: string[];
  /** Ek desenler (FR-RED-06). */
  patterns?: RegExp[];
  /** E-posta gizleme; varsayılan `true` (FR-RED-05). */
  emails?: boolean;
  /** Telefon gizleme; varsayılan `false` (FR-RED-05). */
  phones?: boolean;
}

export interface FlashbackProps {
  /** Varsayılan: `process.env.NODE_ENV !== 'production'` (FR-CFG-02). */
  enabled?: boolean;
  /** `flashback-mcp` alıcısının adresi. Varsayılan `http://127.0.0.1:4747`. */
  endpoint?: string;
  /** En az bu kadar saniyelik geçmiş tutulur (FR-REC-02). Varsayılan 60. */
  bufferSeconds?: number;
  /** Kaydedilmeyecek istekler: metin öneki ya da RegExp (FR-REC-05). */
  ignoreUrls?: Array<string | RegExp>;
  /** Tüm girişleri maskeler. Parolalar her durumda maskelenir (FR-REC-08). */
  maskAllInputs?: boolean;
  /** Gizleme; `false` kapatır (FR-RED-08, FR-UI-11). */
  redact?: boolean | FlashbackRedactConfig;
  /** Paneli açıp kapatan kısayol; `event.code` ile eşleştirilir. Varsayılan `alt+shift+r`. */
  shortcut?: string;
  /** Flashback düğmesinin köşesi. Varsayılan `bottom-right`. */
  position?: FlashbackPosition;
  /** Arayüz dili; varsayılan tarayıcı diline göre. */
  locale?: FlashbackLocale;
  /** Üretimde çalışmaya izin verir (önerilmez, FR-CFG-09). */
  allowProduction?: boolean;
  /**
   * Projenin `package.json` adı (FR-RCV-06). Verilirse alıcının projesiyle karşılaştırılır: uyuşmazsa düğme
   * "yanlış proje" gösterir ve alıcı olayı reddeder. Örn. `project={pkg.name}`.
   */
  project?: string;
}

/** `trackStore` dönüşü: takibi bırakır. */
export type Unsubscribe = () => void;
