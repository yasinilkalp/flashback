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
  if (!path.isAbsolute(p)) return file;
  for (const root of roots) {
    const rel = path.relative(root, p);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  }
  return file;
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
