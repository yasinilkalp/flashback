/**
 * Üretim girişi (FR-CFG-08). `production` export koşulu ve `rewind-devtools/noop` buraya çözülür.
 * Kaydedici, rrweb ya da panel kodu İÇERMEZ; yalnızca aynı API'yi etkisiz olarak sunar.
 */
import type { RewindProps, Unsubscribe } from './types.js';

export type { RewindLocale, RewindPosition, RewindProps, RewindRedactConfig, Unsubscribe } from './types.js';

export function Rewind(_props: RewindProps): null {
  return null;
}

export function trackStore<S>(_name: string, _subscribe: (listener: () => void) => unknown, _getState: () => S): Unsubscribe {
  return () => {};
}
