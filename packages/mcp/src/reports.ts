/**
 * `.flashback/` klasöründeki raporlar. Raporları geliştirme sunucusu (`flashback-devtools/vite`) yazar; bu modül
 * yalnızca okur.
 */
import fs from 'node:fs';
import path from 'node:path';

export const REPORT_ID = /^fb-\d{8}-\d{6}-[a-z0-9]+$/;

export interface ReportInfo {
  id: string;
  /** Raporun ilk satırı: geliştiricinin notu. */
  title: string;
  /** Kimlikteki yerel saat, `2026-10-30 14:12:05` biçiminde. */
  createdAt: string;
  /** Mutlak dosya yolu. */
  file: string;
}

/**
 * Rapor klasörü: `FLASHBACK_DIR`; yoksa başlangıç klasöründen (`FLASHBACK_PROJECT_ROOT` ya da `cwd`) yukarı doğru
 * ilk `.flashback` klasörü; o da yoksa ilk git kökündeki `.flashback` (henüz rapor yazılmamış olabilir).
 */
export function findReportsDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  if (env.FLASHBACK_DIR) return path.resolve(cwd, env.FLASHBACK_DIR);
  const start = path.resolve(cwd, env.FLASHBACK_PROJECT_ROOT ?? '.');
  let gitRoot: string | null = null;
  for (let dir = start; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, '.flashback');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    if (!gitRoot && fs.existsSync(path.join(dir, '.git'))) gitRoot = dir;
    if (path.dirname(dir) === dir) break;
  }
  return path.join(gitRoot ?? start, '.flashback');
}

function createdAt(id: string): string {
  const m = /^fb-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : '';
}

function firstLine(file: string): string {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(512);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString('utf8').split('\n')[0].replace(/^#\s*/, '').trim();
  } finally {
    fs.closeSync(fd);
  }
}

/** Raporlar, yeniden eskiye. Kimlik saniye çözünürlüklü olduğu için sıra dosya zamanından gelir. */
export function listReports(dir: string): ReportInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((f) => f.endsWith('.md') && REPORT_ID.test(f.slice(0, -3)))
    .map((f) => ({ f, file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.f.localeCompare(a.f))
    .map(({ f, file }) => {
      const id = f.slice(0, -3);
      return { id, title: firstLine(file), createdAt: createdAt(id), file };
    });
}

/** Raporun Markdown'u; `id` verilmezse en yenisi. Yoksa null. */
export function readReport(dir: string, id?: string): { info: ReportInfo; markdown: string } | null {
  if (id !== undefined && !REPORT_ID.test(id)) return null;
  const info = id ? listReports(dir).find((r) => r.id === id) : listReports(dir)[0];
  if (!info) return null;
  return { info, markdown: fs.readFileSync(info.file, 'utf8') };
}
