/**
 * `data-flashback-source` (R13): derleme eklentisinin (`flashback-devtools/vite`) HTML/SVG öğelerine yazdığı JSX konumu.
 * Biçim `dosya:satır:sütun`; satır ve sütun 1 tabanlı, sütun `<` karakterinin yeri. Eklenti (Node) ve panel (tarayıcı)
 * aynı modülü kullanır.
 */
export const SOURCE_ATTR = 'data-flashback-source';

export interface SourceAttr {
  file: string;
  line: number;
  column: number;
}

export function formatSourceAttr({ file, line, column }: SourceAttr): string {
  return `${file}:${line}:${column}`;
}

/** Windows yolu (`C:/…`) iki nokta içerebildiği için satır ve sütun sağdan ayrılır; biçim bozuksa null. */
export function parseSourceAttr(value: string | null | undefined): SourceAttr | null {
  const m = value ? /^(.+):(\d+):(\d+)$/.exec(value) : null;
  if (!m) return null;
  const line = Number(m[2]);
  const column = Number(m[3]);
  return line > 0 && column > 0 ? { file: m[1], line, column } : null;
}
