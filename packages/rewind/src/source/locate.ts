/**
 * Öğenin JSX kaynak satırını bulur (FR-MARK-04, FR-MARK-11).
 *
 * Adaylar öğenin kendi fiber'ından köke doğru denenir (`sourceCandidates`). Her çerçeve source map ile çözülür;
 * çözülen dosya bağımlılık/çerçeve koduysa (node_modules, Next/React iç modülleri, Rewind) sıradaki çerçeveye
 * geçilir. Kullanıcı kodu olabilecek bir çerçeve çözülemezse **tahmin yapılmaz**: derlenmiş konum
 * `resolved:false` ile döner. React Server Component öğesinin sunucu çerçevesi çözülemezse istemci atalarına
 * çıkılmaz (yanlış dosyayı göstermemek için).
 */
import { isServerOwned, sourceCandidates, type Fiber } from '../dom/fiber.js';
import type { ResolvedLocation, SourceResolver } from './sourcemap.js';
import { isInternalSource } from './stack.js';

export interface LocateResult {
  location?: ResolvedLocation;
  /** Ajana iletilecek açıklama (ör. kaynak atadan geldi, RSC). */
  note?: string;
}

const ANCESTOR_NOTE =
  'öğenin kendi JSX konumu yok (bağımlılık kodunda ya da React\'in sahip yığını sınırı aşılınca oluşturulmuş); kaynak satırı en yakın atanın JSX\'i';
const RSC_NOTE = 'React Server Component öğesi: sunucu kaynak satırı çözülemedi; bileşen yığını yalnızca istemci bileşenlerini içerir';

export async function locateSource(fiber: Fiber | null, resolver: SourceResolver): Promise<LocateResult> {
  for (const c of sourceCandidates(fiber)) {
    const note = c.depth > 0 ? ANCESTOR_NOTE : undefined;
    const mark = (loc: ResolvedLocation): ResolvedLocation => (c.depth > 0 && loc.resolved ? { ...loc, fromAncestor: true } : loc);
    if (c.kind === 'debugSource') {
      if (isInternalSource(c.file)) continue;
      return { location: mark(await resolver.fromDebugSource(c.file, c.line, c.column)), note };
    }
    const server = isServerOwned(c.fiber);
    for (const frame of c.frames) {
      const loc = await resolver.resolve(frame);
      if (!loc.resolved) return { location: loc, note: server ? RSC_NOTE : note };
      if (isInternalSource(loc.file)) continue;
      return { location: mark(loc), note: server ? joinNotes('React Server Component öğesi (sunucuda oluşturuldu)', note) : note };
    }
    if (server) return { note: RSC_NOTE };
  }
  return {};
}

function joinNotes(...notes: Array<string | undefined>): string | undefined {
  const kept = notes.filter(Boolean);
  return kept.length ? kept.join('; ') : undefined;
}
