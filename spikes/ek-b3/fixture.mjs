/**
 * Fixture'ı uygulamalara etiketleyerek yazar. Her `data-ekb3="@"` / `data-ekb3-rsc="@"` değeri, uygulama köküne
 * göre `src/<klasör>/<Dosya>.tsx:<satır>` olur; ölçüm bu değeri doğru yanıt olarak kullanır. Her etiketli öğe
 * `data-ekb3-v` ile fixture sürümünü de taşır (HMR'nin DOM'a ulaştığını anlamak için).
 *
 * Sürüm 2 (HMR ölçümü): ilk satırın (`'use client'` ya da yorum) ardına gerçekçi bir düzenleme gibi 3 satır kod
 * eklenir. Dışa aktarım eklenmez; Fast Refresh sınırı bozulmasın, sayfa yeniden yüklenmesin.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export const APPS = {
  'vite-r19': [['fixture/client', 'src/fixture']],
  'vite-r18': [['fixture/client', 'src/fixture']],
  next16: [['fixture/client', 'src/fixture'], ['fixture/server', 'src/server']],
};

export const HMR_INSERT = ['// hmr: düzenleme', "const hmrNote = 'v2';", 'void hmrNote;'];

function label(source, relFile, version) {
  const lines = source.split('\n');
  if (version === 2) lines.splice(1, 0, ...HMR_INSERT);
  return lines
    .map((line, i) => line.replace(/(data-ekb3(?:-rsc)?)="@"/g, `$1="${relFile}:${i + 1}" data-ekb3-v="${version}"`))
    .join('\n');
}

/** Uygulamanın fixture kopyasını yazar. `clean`: klasörü önce siler (ilk kurulum). */
export function writeFixture(app, version = 1, clean = false) {
  const appDir = join(here, 'apps', app);
  for (const [from, to] of APPS[app]) {
    const dest = join(appDir, to);
    if (clean) rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(join(here, from))) {
      writeFileSync(join(dest, name), label(readFileSync(join(here, from, name), 'utf8'), `${to}/${name}`, version));
    }
  }
}
