/** `<Flashback/>` bileşeninin herkese açık tipleri. `noop` girişi de bu tipleri kullanır. */

export type FlashbackLocale = 'tr' | 'en';

export interface FlashbackRedactConfig {
  /** Ek hassas anahtar adları. */
  keys?: string[];
  /** Ek desenler; her eşleşme `[REDACTED:custom]` olur. */
  patterns?: RegExp[];
  /** E-posta gizleme; varsayılan `true`. */
  emails?: boolean;
  /** Telefon gizleme; varsayılan `false`. */
  phones?: boolean;
}

export interface FlashbackProps {
  /** Varsayılan: `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean;
  /** Seçim kipini açıp kapatan kısayol; `event.code` ile eşleştirilir. Varsayılan `alt+shift+f`. */
  shortcut?: string;
  /** Kaydedilmeyecek istekler: metin öneki ya da RegExp. */
  ignoreUrls?: Array<string | RegExp>;
  /** Gizleme; `false` kapatır. */
  redact?: boolean | FlashbackRedactConfig;
  /** Arayüz ve rapor dili; varsayılan tarayıcı diline göre. */
  locale?: FlashbackLocale;
}

/** `trackStore` dönüşü: takibi bırakır. */
export type Unsubscribe = () => void;
