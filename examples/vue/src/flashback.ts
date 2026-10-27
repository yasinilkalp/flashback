import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Flashback } from 'flashback-devtools';

/**
 * React dışı (Vue) uygulamada Flashback: `<Flashback/>` kendi React köküne bağlanır. Kayıt, zaman çizelgesi, ağ ve
 * konsol çerçeveden bağımsızdır; bileşen yığını ve JSX kaynak satırı yalnızca React öğelerinde çıkarılır.
 */
export function mountFlashback(container: HTMLElement): void {
  createRoot(container).render(createElement(Flashback, { enabled: import.meta.env.DEV, endpoint: import.meta.env.VITE_FLASHBACK_ENDPOINT }));
}
