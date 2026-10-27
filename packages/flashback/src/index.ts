/**
 * flashback-devtools — geliştirme ortamında son ≥60 saniyeyi kaydeder, hatayı geri sarıp gösterip ajana gönderir.
 *
 * Üretim koruması iki katmanlıdır (FR-CFG-08):
 * 1. `production` export koşulu bu girişi `noop`'a çözer.
 * 2. Koşulu desteklemeyen bundler'larda da `process.env.NODE_ENV === 'production'` tanımı (define) kaydedici dallarını
 *    ölü kod yapar: çalışma zamanı (rrweb, panel) yalnızca üretim dışı dalda dinamik `import()` ile yüklenir.
 *    React'in kendisi gibi bu giriş de `process.env.NODE_ENV`'in bundler tarafından tanımlandığını varsayar.
 */
import { useEffect } from 'react';
import { decideStart } from './config.js';
import { discardCapture, installEarlyCapture, stores } from './recorder/early.js';
import type { FlashbackProps, Unsubscribe } from './types.js';

export type { FlashbackLocale, FlashbackPosition, FlashbackProps, FlashbackRedactConfig, Unsubscribe } from './types.js';

const loadRuntime = process.env.NODE_ENV !== 'production' ? () => import('./runtime.js') : null;

// FR-REC-13: uygulamanın ilk istekleri de kayda girsin diye yakalama modül yüklenirken kurulur.
if (process.env.NODE_ENV !== 'production') installEarlyCapture();

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[flashback] ${message}`);
}

/** `<Flashback/>` bileşeni (FR-REC-01, FR-CFG-02/03/09). Uygulama ağacında hiçbir şey render etmez. */
export function Flashback(props: FlashbackProps): null {
  // Prop'lar değer olarak karşılaştırılır (satır içi nesne/dizi her render'da yeniden başlatmasın).
  const key = JSON.stringify(props, (_k, v: unknown) => (v instanceof RegExp ? v.toString() : v));
  useEffect(() => {
    const decision = decideStart(props);
    if (!decision.start) {
      if (process.env.NODE_ENV !== 'production') discardCapture();
      if (decision.reason === 'production') warnOnce('Üretim ortamında enabled=true verildi; Flashback başlatılmadı. Gerekirse allowProduction kullanın (önerilmez).');
      return;
    }
    if (!loadRuntime) {
      warnOnce('Bu üretim derlemesinde kaydedici yok (NODE_ENV=production); allowProduction etkisiz.');
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void loadRuntime().then((m) => {
      if (!cancelled) stop = m.startFlashback(props, decision.productionWarning);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [key]);
  return null;
}

/** Store değişikliklerini kaydeder (FR-REC-09). Zustand: `trackStore('cart', useCart.subscribe, useCart.getState)`. */
export function trackStore<S>(name: string, subscribe: (listener: () => void) => unknown, getState: () => S): Unsubscribe {
  if (process.env.NODE_ENV === 'production') return () => {};
  return stores().track(name, subscribe, getState);
}
