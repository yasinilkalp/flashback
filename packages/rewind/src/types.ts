/** `<Rewind/>` bileşeninin herkese açık tipleri (FRD §9.4). `noop` girişi de bu tipleri kullanır. */

export type RewindPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type RewindLocale = 'tr' | 'en';

export interface RewindRedactConfig {
  /** Ek hassas anahtar adları (FR-RED-06). */
  keys?: string[];
  /** Ek desenler (FR-RED-06). */
  patterns?: RegExp[];
  /** E-posta gizleme; varsayılan `true` (FR-RED-05). */
  emails?: boolean;
  /** Telefon gizleme; varsayılan `false` (FR-RED-05). */
  phones?: boolean;
}

export interface RewindProps {
  /** Varsayılan: `process.env.NODE_ENV !== 'production'` (FR-CFG-02). */
  enabled?: boolean;
  /** `rewind-mcp` alıcısının adresi. Varsayılan `http://127.0.0.1:4747`. */
  endpoint?: string;
  /** En az bu kadar saniyelik geçmiş tutulur (FR-REC-02). Varsayılan 60. */
  bufferSeconds?: number;
  /** Kaydedilmeyecek istekler: metin öneki ya da RegExp (FR-REC-05). */
  ignoreUrls?: Array<string | RegExp>;
  /** Tüm girişleri maskeler. Parolalar her durumda maskelenir (FR-REC-08). */
  maskAllInputs?: boolean;
  /** Gizleme; `false` kapatır (FR-RED-08, FR-UI-11). */
  redact?: boolean | RewindRedactConfig;
  /** Paneli açıp kapatan kısayol; `event.code` ile eşleştirilir. Varsayılan `alt+shift+r`. */
  shortcut?: string;
  /** Rewind düğmesinin köşesi. Varsayılan `bottom-right`. */
  position?: RewindPosition;
  /** Arayüz dili; varsayılan tarayıcı diline göre. */
  locale?: RewindLocale;
  /** Üretimde çalışmaya izin verir (önerilmez, FR-CFG-09). */
  allowProduction?: boolean;
}

/** `trackStore` dönüşü: takibi bırakır. */
export type Unsubscribe = () => void;
