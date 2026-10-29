/**
 * Arayüzün gölge DOM kökü: sayfanın stilleri arayüzü, arayüzün stilleri sayfayı etkilemez. Kökün olayları adım
 * kaydına girmez ve seçim kipinde durdurulmaz (`data-flashback-ui`).
 */
import { createRoot, type Root } from 'react-dom/client';
import type { FlashbackController } from '../controller.js';
import { App } from './App.js';
import { UI_CSS } from './styles.js';

export interface UiHost {
  host: HTMLElement;
  render(controller: FlashbackController): void;
  unmount(): void;
}

export function createUiHost(): UiHost {
  const host = document.createElement('flashback-devtools');
  host.setAttribute('data-flashback-ui', '');
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  const mountPoint = document.createElement('div');
  shadow.append(style, mountPoint);
  document.body.appendChild(host);
  let root: Root | null = null;
  return {
    host,
    render(controller) {
      root = createRoot(mountPoint);
      root.render(<App controller={controller} />);
    },
    unmount() {
      const r = root;
      root = null;
      // Kök hemen sayfadan çıkar; React kökü, uygulamanın render'ı sırasında eşzamanlı unmount uyarısı vermemek
      // için bir sonraki görev turunda sökülür.
      host.remove();
      setTimeout(() => r?.unmount(), 0);
    },
  };
}
