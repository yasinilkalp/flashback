/**
 * Yakalama + arayüz çalışma zamanı. Ana giriş bunu yalnızca üretim dışı dalda dinamik `import()` ile yükler;
 * bundler `process.env.NODE_ENV`'i "production" yaptığında bu modül pakete hiç girmez.
 */
import { resolveConfig } from './config.js';
import { FlashbackController } from './controller.js';
import type { FlashbackProps } from './types.js';
import { createUiHost } from './ui/mount.js';

/** Etkin bir Flashback örneği; yalnızca biri çalışır. */
let active: { stop: () => void } | null = null;

export function startFlashback(props: FlashbackProps): () => void {
  active?.stop();
  const cfg = resolveConfig(props);
  const ui = createUiHost();
  const controller = new FlashbackController(cfg, ui.host);
  controller.start();
  ui.render(controller);
  const instance = {
    stop: () => {
      controller.stop();
      ui.unmount();
      if (active === instance) active = null;
    },
  };
  active = instance;
  return instance.stop;
}
