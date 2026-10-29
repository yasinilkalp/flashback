#!/usr/bin/env node
/**
 * Sürüm artırma: iki paketin sürümünü ve sürümün geçtiği her yeri birlikte günceller (KK-10).
 *
 *   npm run release:bump -- beta            # 0.1.0-beta.0 → 0.1.0-beta.1
 *   npm run release:bump -- 0.2.0           # açık sürüm
 *
 * Güncellenenler: iki paketin package.json'ı, FLASHBACK_VERSION, örneklerin flashback-devtools bağımlılığı ve
 * package-lock.json. Commit'leyip main'e push edince release.yml aynı
 * commit'in CI'ı geçtikten sonra yayınlar ve v<sürüm> etiketini açar.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PACKAGES = ['flashback-devtools', 'flashback-mcp'];

const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);
const readJson = (p) => JSON.parse(read(p));
const writeJson = (p, v) => write(p, `${JSON.stringify(v, null, 2)}\n`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const current = readJson('packages/flashback/package.json').version;
const mcpVersion = readJson('packages/mcp/package.json').version;
if (current !== mcpVersion) fail(`Paket sürümleri zaten farklı: flashback-devtools ${current}, flashback-mcp ${mcpVersion}.`);

const arg = process.argv[2];
if (!arg) fail('Kullanım: npm run release:bump -- <beta | sürüm>   (ör. beta, 0.1.0-beta.1, 0.2.0)');
let next;
if (arg === 'beta') {
  const m = current.match(/^(\d+\.\d+\.\d+)-beta\.(\d+)$/);
  if (!m) fail(`"beta" yalnızca -beta.N sürümünü artırır (şu an ${current}); sürümü açıkça verin.`);
  next = `${m[1]}-beta.${Number(m[2]) + 1}`;
} else {
  next = arg.replace(/^v/, '');
}
if (!SEMVER.test(next)) fail(`Geçersiz sürüm: ${next}`);
if (next === current) fail(`Sürüm zaten ${current}.`);

const changed = [];

/** Bağımlılık alanlarında `current`'a bağlı paketleri `next`'e taşır. */
function bumpDeps(manifest) {
  let hit = false;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of PACKAGES) {
      if (manifest[field]?.[name] === current) {
        manifest[field][name] = next;
        hit = true;
      }
    }
  }
  return hit;
}

for (const p of ['packages/flashback/package.json', 'packages/mcp/package.json']) {
  const pkg = readJson(p);
  pkg.version = next;
  bumpDeps(pkg);
  writeJson(p, pkg);
  changed.push(p);
}

const configPath = 'packages/flashback/src/config.ts';
const config = read(configPath);
const versionLine = /export const FLASHBACK_VERSION = '[^']*';/;
if (!versionLine.test(config)) fail(`${configPath} içinde FLASHBACK_VERSION satırı yok.`);
write(configPath, config.replace(versionLine, `export const FLASHBACK_VERSION = '${next}';`));
changed.push(configPath);

for (const dir of readdirSync(join(root, 'examples'))) {
  const p = `examples/${dir}/package.json`;
  if (!existsSync(join(root, p))) continue;
  const pkg = readJson(p);
  if (bumpDeps(pkg)) {
    writeJson(p, pkg);
    changed.push(p);
  }
}

// Kilit dosyası: çalışma alanı paketlerinin sürümü ve örneklerin bağımlılık aralığı. `npm ci` ikisini
// package.json'larla karşılaştırır; yeniden kurulum gerekmez.
const lock = readJson('package-lock.json');
for (const [key, entry] of Object.entries(lock.packages)) {
  if (key === 'packages/flashback' || key === 'packages/mcp') {
    entry.version = next;
    bumpDeps(entry);
  } else if (key.startsWith('examples/') && !key.includes('/node_modules/')) {
    bumpDeps(entry);
  }
}
writeJson('package-lock.json', lock);
changed.push('package-lock.json');

console.log(`Sürüm ${current} → ${next}`);
for (const p of changed) console.log(`  ${p}`);
console.log(`\nSonraki adım: commit'leyip main'e push edin. release.yml CI geçince yayınlar ve v${next} etiketini açar.`);
