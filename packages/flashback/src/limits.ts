/** Tampon sınırları. Tampon sürekli açık olduğu için bellek kullanımı bu değerlerle sınırlıdır. */
export const LIMITS = {
  /** Tamponda gövde başına saklanan en fazla bayt (fazlası kırpılır). */
  bodyBytes: 16 * 1024,
} as const;

export function truncateText(s: string, maxBytes: number): { text: string; truncated: boolean; size: number } {
  const size = new TextEncoder().encode(s).length;
  if (size <= maxBytes) return { text: s, truncated: false, size };
  // Bayt sınırına yakın bir karakter sınırında kes.
  let cut = Math.floor(maxBytes * 0.9);
  while (new TextEncoder().encode(s.slice(0, cut)).length > maxBytes) cut = Math.floor(cut * 0.9);
  return { text: s.slice(0, cut), truncated: true, size };
}
