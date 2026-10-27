/**
 * Üretim girişi (FR-CFG-08). `production` export koşulu ve `flashback-devtools/noop` buraya çözülür.
 * Kaydedici, rrweb ya da panel kodu İÇERMEZ; yalnızca aynı API'yi etkisiz olarak sunar.
 */
import type { FlashbackProps, Unsubscribe } from './types.js';

export type { FlashbackLocale, FlashbackPosition, FlashbackProps, FlashbackRedactConfig, Unsubscribe } from './types.js';

export function Flashback(_props: FlashbackProps): null {
  return null;
}

export function trackStore<S>(_name: string, _subscribe: (listener: () => void) => unknown, _getState: () => S): Unsubscribe {
  return () => {};
}
