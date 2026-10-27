/**
 * EK-B3 hazırlığı: paketleri tgz olarak paketler, fixture'ı etiketleyip uygulamalara kopyalar, bağımlılıkları kurar.
 *
 *   node spikes/ek-b3/prepare.mjs            # paketle + kopyala + (gerekirse) kur
 *   node spikes/ek-b3/prepare.mjs --install  # kurulumu zorla
 *
 * Önkoşul: depo kökünde `npm run build` (flashback-devtools dist'i). Etiketleme: `fixture.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, writeFixture } from './fixture.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = join(here, '../..');
const packs = join(here, '.packs');
const version = JSON.parse(readFileSync(join(repo, 'packages/flashback/package.json'), 'utf8')).version;
const forceInstall = process.argv.includes('--install');
const isWin = process.platform === 'win32';

function npm(args, cwd) {
  // Windows'ta npm bir .cmd betiği; argümanlarda boşluk olmadığı için kabukla çağırmak güvenli.
  execFileSync(isWin ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: isWin });
}

if (!existsSync(join(repo, 'packages/flashback/dist/index.js'))) {
  console.error('packages/flashback/dist yok: önce depo kökünde `npm run build` çalıştırın.');
  process.exit(1);
}

rmSync(packs, { recursive: true, force: true });
mkdirSync(packs, { recursive: true });
npm(['pack', '--pack-destination', packs], join(repo, 'packages/flashback'));
npm(['pack', '--pack-destination', packs], join(here, 'lib'));

for (const app of Object.keys(APPS)) {
  const appDir = join(here, 'apps', app);
  writeFixture(app, 1, true);
  if (forceInstall || !existsSync(join(appDir, 'node_modules'))) {
    npm(['install', '--no-audit', '--no-fund', '--no-package-lock'], appDir);
  } else {
    // tgz içeriği her paketlemede değişir; kurulu kopyayı tazele.
    npm(['install', '--no-audit', '--no-fund', '--no-package-lock', '--no-save', join(packs, `flashback-devtools-${version}.tgz`)], appDir);
  }
}
console.log('EK-B3 hazır.');
