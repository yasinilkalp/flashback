/**
 * Kaynak yollarını proje köküne göre kısaltır (EK-B3). React 18 `_debugSource`, Turbopack ve webpack haritaları
 * mutlak yol verir (`C:/Users/<ad>/…`, `/home/<ad>/…`); tarayıcı proje kökünü bilmez, alıcı bilir. Göreli yol
 * ajana tutarlı bir `dosya:satır` verir ve kullanıcı adının pakete girmesini önler.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncidentDraft } from '@flashback/shared';

/** Kök içindeki mutlak yolu göreli (`/` ayraçlı) yapar; göreli, kök dışı ya da tanınmayan yollar olduğu gibi kalır. */
export function toProjectRelative(file: string, roots: readonly string[]): string {
  let p = file;
  if (p.startsWith('file://')) {
    try {
      p = fileURLToPath(p);
    } catch {
      return file;
    }
  }
  p = p.replace(/^\/([A-Za-z]:[\\/])/, '$1'); // /C:/x → C:/x
  if (!path.isAbsolute(p)) return roots.length ? inWorkspacePackage(p, roots[0]) : file;
  for (const root of roots) {
    const rel = path.relative(root, p);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  }
  return file;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage']);

/** Kökün altında (en çok iki düzey) `package.json` taşıyan klasörler; monorepo paketleri. */
function packageDirs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      if (fs.existsSync(path.join(sub, 'package.json'))) out.push(sub);
      if (depth < 2) walk(sub, depth + 1);
    }
  };
  walk(root, 1);
  return out;
}

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Göreli yol (Vite gibi bundler'lar kaynağı kendi köküne göre verir, ör. `src/Cart.tsx`) proje kökünde yoksa
 * monorepo paketlerinde aranır; yalnızca tek bir pakette varsa yol o pakete göre tamamlanır
 * (`examples/demo/src/Cart.tsx`). Bulunamazsa ya da birden çok aday varsa olduğu gibi kalır.
 */
function inWorkspacePackage(rel: string, root: string): string {
  const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!clean || clean.startsWith('../') || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return rel;
  if (isFile(path.join(root, clean))) return clean;
  const hits = packageDirs(root).filter((d) => isFile(path.join(d, clean)));
  if (hits.length !== 1) return rel;
  return path.relative(root, path.join(hits[0], clean)).split(path.sep).join('/');
}

/** Proje kökü ve (sembolik bağlantıysa) gerçek yolu. */
export function projectRoots(projectRoot: string): string[] {
  try {
    const real = fs.realpathSync(projectRoot);
    return real === projectRoot ? [projectRoot] : [projectRoot, real];
  } catch {
    return [projectRoot];
  }
}

const SOURCE_RE = /^(.*):(\d+):(\d+)$/;

/** Hedef öğenin dosyası ve konsol kayıtlarının `dosya:satır:sütun` kaynakları. */
export function relativizeDraft(d: IncidentDraft, roots: readonly string[]): IncidentDraft {
  const rel = (f: string) => toProjectRelative(f, roots);
  return {
    ...d,
    console: d.console.map((c) => {
      const m = c.source ? SOURCE_RE.exec(c.source) : null;
      return m ? { ...c, source: `${rel(m[1])}:${m[2]}:${m[3]}` } : c;
    }),
    target: d.target?.file ? { ...d.target, file: rel(d.target.file) } : d.target,
  };
}
