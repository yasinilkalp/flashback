import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Rewind } from 'rewind-devtools';

/**
 * React dışı (Vue) uygulamada Rewind: `<Rewind/>` kendi React köküne bağlanır. Kayıt, zaman çizelgesi, ağ ve
 * konsol çerçeveden bağımsızdır; bileşen yığını ve JSX kaynak satırı yalnızca React öğelerinde çıkarılır.
 */
export function mountRewind(container: HTMLElement): void {
  createRoot(container).render(createElement(Rewind, { enabled: import.meta.env.DEV, endpoint: import.meta.env.VITE_REWIND_ENDPOINT }));
}
