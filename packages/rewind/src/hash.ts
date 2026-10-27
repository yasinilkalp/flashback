/** Özet işlevleri: kod parçası dosya özeti (FR-MARK-12) ve önizleme/yük parmak izi (FR-UI-08). */

export async function hashContent(content: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(content));
    return `sha256:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `fnv1a:${fnv1a(content)}`;
}

/** Senkron, kriptografik olmayan 32 bit FNV-1a (güvensiz bağlam yedeği ve parmak izleri için). */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
