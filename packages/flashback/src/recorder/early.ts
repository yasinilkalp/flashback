/**
 * Erken yakalama (FR-REC-13): fetch/XHR yaması bileşen monte edilirken değil, modül yüklenirken kurulur.
 * Yalnızca üretim dışında yapılır. Bileşen `enabled=false` ile monte edilirse yamalar geri alınır, tampon silinir.
 *
 * Tekil nesneler tembel oluşturulur: modülün üst düzeyinde yan etki yoktur, böylece üretim derlemesinde
 * (çağrılar ölü dalda kalınca) bu kod ağaç sallamayla tamamen düşer (FR-CFG-08).
 */
import { isProductionEnv } from '../config.js';
import { NetworkCapture } from './network.js';
import { StoreRegistry } from './store.js';

let networkCapture: NetworkCapture | undefined;
let storeRegistry: StoreRegistry | undefined;

export const network = (): NetworkCapture => (networkCapture ??= new NetworkCapture());
export const stores = (): StoreRegistry => (storeRegistry ??= new StoreRegistry());

export function installEarlyCapture(): void {
  if (typeof window === 'undefined' || isProductionEnv()) return;
  network().install(window);
}

/** Flashback bu sayfada çalışmayacak: yamaları geri al, toplananları sil. */
export function discardCapture(): void {
  network().uninstall();
  network().clear();
  stores().disable();
}
