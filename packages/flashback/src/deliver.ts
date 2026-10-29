/**
 * Raporu teslim eder. Vite eklentisi varsa dev sunucusu raporu `.flashback/<id>.md` olarak yazar ve panoya kısa bir
 * istem gider; yoksa (ör. Next.js) raporun tamamı panoya Markdown olarak gider. Ayrı süreç ya da port yoktur.
 */
import { renderMarkdown } from './report/markdown.js';
import type { Report } from './report/types.js';
import type { FlashbackLocale } from './types.js';

/** Vite eklentisinin ucu; sayfanın kendi kökeninde. */
export const REPORT_ENDPOINT = '/__flashback/report';

export interface Saved {
  id: string;
  /** Proje köküne göreli dosya yolu (ör. `.flashback/fb-20261030-141205-k3pz.md`). */
  path: string;
}

/** Raporu dev sunucusuna yazdırır; eklenti yoksa ya da yazamazsa null. */
export async function saveReport(report: Report, fetchFn: typeof fetch): Promise<Saved | null> {
  try {
    const res = await fetchFn(REPORT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Saved>;
    return typeof body.id === 'string' && typeof body.path === 'string' ? { id: body.id, path: body.path } : null;
  } catch {
    return null;
  }
}

const PROMPTS = {
  tr: {
    file: (path: string, note: string) => `Flashback raporunu oku ve hatayı düzelt: ${path}\n\nNot: ${note}`,
    inline: 'Aşağıdaki Flashback raporunu oku ve hatayı düzelt.',
  },
  en: {
    file: (path: string, note: string) => `Read the Flashback report and fix the bug: ${path}\n\nNote: ${note}`,
    inline: 'Read the Flashback report below and fix the bug.',
  },
} as const;

/** Panoya gidecek metin: dosya yazıldıysa kısa istem, yazılmadıysa raporun tamamı. */
export function clipboardText(report: Report, saved: Saved | null, lang: FlashbackLocale): string {
  const p = PROMPTS[lang] ?? PROMPTS.en;
  return saved ? p.file(saved.path, report.note) : `${p.inline}\n\n${renderMarkdown(report)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
