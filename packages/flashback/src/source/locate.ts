/** Öğenin JSX'inin yazıldığı yer (FR-MARK-04, FR-MARK-11). Panel ve EK-B3 ölçümü aynı yolu kullanır. */
import { getFiber, sourceHints } from '../dom/fiber.js';
import type { ResolvedLocation, SourceResolver } from './sourcemap.js';
import { isDependencyPath, serverComponentFile } from './stack.js';

/**
 * Adaylar sırayla denenir. Source map bir adayı bağımlılık koduna (`node_modules`) çözerse sıradakine geçilir;
 * çözülemeyen ilk aday `resolved:false` ile döner (tahmin yapılmaz, sessizce yanlış satır verilmez).
 * HMR yüzünden bayat olabilen aday da `resolved:false` döner; dosya yine de verilir (satır doğrulanmamış).
 */
export async function locateSource(el: Element, resolver: SourceResolver): Promise<ResolvedLocation | undefined> {
  for (const hint of sourceHints(getFiber(el))) {
    const ancestor = hint.depth ? { fromAncestor: true } : {};
    if (hint.kind === 'debugSource') {
      const loc = { file: hint.file, line: hint.line, column: hint.column ?? 1 };
      if (hint.stale) return { ...loc, resolved: false, reason: hint.stale };
      return { ...(await resolver.fromDebugSource(hint.file, hint.line, hint.column)), ...ancestor };
    }
    const server = serverComponentFile(hint.frame.url) !== null ? { serverComponent: true } : {};
    const loc = { ...(await resolver.resolve(hint.frame)), ...server };
    if (loc.resolved && isDependencyPath(loc.file)) continue;
    if (hint.stale && loc.resolved) {
      // Kod parçası güncel içerikten ama satır eski koddan olabilir: ikisini birlikte göstermek yanıltır.
      const { snippet: _snippet, ...rest } = loc;
      return { ...rest, resolved: false, reason: hint.stale };
    }
    return loc.resolved ? { ...loc, ...ancestor } : loc;
  }
  return undefined;
}
