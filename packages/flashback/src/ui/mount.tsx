/**
 * Panelin Shadow DOM kökü (FR-UI-12). Kök, rrweb kaydı başlamadan önce eklenir ve `data-flashback-ui` ile bloklanır;
 * gölge ağacındaki tek çocuk da bloklu sarmalayıcıdır. Böylece panel hiçbir zaman kayda girmez (FR-REC-10).
 */
import { createRoot, type Root } from 'react-dom/client';
import type { FlashbackController } from '../controller.js';
import { Shell } from './Shell.js';
import { PANEL_CSS } from './styles.js';

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
  const container = document.createElement('div');
  container.setAttribute('data-flashback-ui', '');
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  container.appendChild(style);
  const mountPoint = document.createElement('div');
  container.appendChild(mountPoint);
  shadow.appendChild(container);
  document.body.appendChild(host);
  let root: Root | null = null;
  return {
    host,
    render(controller) {
      root = createRoot(mountPoint);
      root.render(<Shell controller={controller} />);
    },
    unmount() {
      const r = root;
      root = null;
      // Kök hemen sayfadan çıkar (yeniden başlatılan kayıt onu görmesin); React kökü, uygulamanın render'ı
      // sırasında eşzamanlı unmount uyarısı vermemek için bir sonraki görev turunda sökülür.
      host.remove();
      setTimeout(() => r?.unmount(), 0);
    },
  };
}
