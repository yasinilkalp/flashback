/**
 * flashback-devtools — geliştirme ortamında hatalı öğeye tıklayıp bir cümle yazarsınız; ajan dosya:satırı, son
 * istekleri, konsolu ve adımları hazır alır.
 *
 * Üretim koruması iki katmanlıdır:
 * 1. `production` export koşulu bu girişi `noop`'a çözer.
 * 2. Koşulu desteklemeyen bundler'larda da `process.env.NODE_ENV === 'production'` tanımı (define) yakalama dallarını
 *    ölü kod yapar: çalışma zamanı yalnızca üretim dışı dalda dinamik `import()` ile yüklenir.
 *    React'in kendisi gibi bu giriş de `process.env.NODE_ENV`'in bundler tarafından tanımlandığını varsayar.
 */
import { useEffect } from 'react';
import { shouldStart } from './config.js';
import { discardCapture, installEarlyCapture, stores } from './recorder/early.js';
import type { FlashbackProps, Unsubscribe } from './types.js';

export type { FlashbackLocale, FlashbackProps, FlashbackRedactConfig, Unsubscribe } from './types.js';

const loadRuntime = process.env.NODE_ENV !== 'production' ? () => import('./runtime.js') : null;

// Sayfa yüklenirken atılan istekler de tampona girsin diye ağ yakalama modül yüklenirken kurulur.
if (process.env.NODE_ENV !== 'production') installEarlyCapture();

/** `<Flashback/>` bileşeni. Uygulama ağacında hiçbir şey render etmez; arayüzü kendi gölge DOM kökündedir. */
export function Flashback(props: FlashbackProps): null {
  // Prop'lar değer olarak karşılaştırılır (satır içi nesne/dizi her render'da yeniden başlatmasın).
  const key = JSON.stringify(props, (_k, v: unknown) => (v instanceof RegExp ? v.toString() : v));
  useEffect(() => {
    if (!loadRuntime || !shouldStart(props)) {
      if (process.env.NODE_ENV !== 'production') discardCapture();
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void loadRuntime().then((m) => {
      if (!cancelled) stop = m.startFlashback(props);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [key]);
  return null;
}

/** Store değişikliklerini rapora ekler. Zustand: `trackStore('cart', useCart.subscribe, useCart.getState)`. */
export function trackStore<S>(name: string, subscribe: (listener: () => void) => unknown, getState: () => S): Unsubscribe {
  if (process.env.NODE_ENV === 'production') return () => {};
  return stores().track(name, subscribe, getState);
}
