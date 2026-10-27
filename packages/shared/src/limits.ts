/** NFR-SIZE-01 ve ilgili sınırlar. Tek yerde tutulur; tarayıcı ve sunucu aynı değerleri kullanır. */
export const LIMITS = {
  /** Gövde başına saklanan en fazla bayt (fazlası kırpılır). */
  bodyBytes: 64 * 1024,
  /** DOM anlık görüntüsü üst sınırı. */
  domBytes: 1024 * 1024,
  /** Olay JSON'u üst sınırı (alıcıdaki varsayılan gövde sınırı da budur). */
  incidentBytes: 5 * 1024 * 1024,
  /** get_incident varsayılan token bütçesi (NFR-TOK-01, AS-1). ~4 karakter = 1 token. */
  reportTokens: 4000,
  /** Kota (FR-RCV-09). */
  maxIncidents: 200,
  maxStoreBytes: 500 * 1024 * 1024,
  /** run_repro zaman aşımı (NFR-REPRO-01). */
  reproTimeoutS: 60,
  reproTimeoutMaxS: 300,
} as const;

export function truncateText(s: string, maxBytes: number): { text: string; truncated: boolean; size: number } {
  const size = new TextEncoder().encode(s).length;
  if (size <= maxBytes) return { text: s, truncated: false, size };
  // Bayt sınırına yakın bir karakter sınırında kes.
  let cut = Math.floor(maxBytes * 0.9);
  while (new TextEncoder().encode(s.slice(0, cut)).length > maxBytes) cut = Math.floor(cut * 0.9);
  return { text: s.slice(0, cut), truncated: true, size };
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);
