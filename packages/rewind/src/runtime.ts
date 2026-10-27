/**
 * Kaydedici + panel çalışma zamanı. Ana giriş bunu yalnızca üretim dışı dalda dinamik `import()` ile yükler;
 * bundler `process.env.NODE_ENV`'i "production" yaptığında bu modül (ve rrweb) pakete hiç girmez (FR-CFG-08).
 */
import { resolveConfig } from './config.js';
import { RewindController } from './controller.js';
import type { RewindProps } from './types.js';
import { createUiHost } from './ui/mount.js';

/** Etkin bir Rewind örneği; yalnızca biri çalışır (rrweb kaydı sayfa başına tektir). */
let active: { stop: () => void } | null = null;

export function startRewind(props: RewindProps, productionWarning: boolean): () => void {
  active?.stop();
  const cfg = resolveConfig(props, productionWarning);
  // Kök, kayıt başlamadan önce eklenir; böylece rrweb onu baştan bloklu yer tutucu olarak görür.
  const ui = createUiHost();
  const controller = new RewindController(cfg, ui.host);
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
