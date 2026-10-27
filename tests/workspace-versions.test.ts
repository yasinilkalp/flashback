import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Örnek uygulamalar paketlere tam sürümle bağlıdır. Sürüm değişip örnekler güncellenmezse npm, çalışma
 * alanındaki paketi bağlamak yerine kayıt defterinde arar ve CI'daki `npm ci` 404 ile düşer.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as Record<string, any>;

describe('çalışma alanı sürümleri', () => {
  const versions: Record<string, string> = {};
  for (const dir of ['packages/flashback', 'packages/mcp', 'packages/shared']) {
    const pkg = read(`${dir}/package.json`);
    versions[pkg.name] = pkg.version;
  }
  const manifests = ['packages/flashback', 'packages/mcp', ...readdirSync(join(root, 'examples')).map((d) => `examples/${d}`)];
  for (const dir of manifests) {
    it(`${dir} çalışma alanı paketlerine güncel sürümle bağlı`, () => {
      const pkg = read(`${dir}/package.json`);
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const [name, range] of Object.entries((pkg[field] ?? {}) as Record<string, string>)) {
          if (name in versions) expect(range, `${dir} ${field}.${name}`).toBe(versions[name]);
        }
      }
    });
  }
});
