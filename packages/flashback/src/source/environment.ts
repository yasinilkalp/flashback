/** `SourceResolver` için sayfa ortamı: yüklenen betikler ve çerçeveye özgü RSC source map ucu (EK-B3). */
import type { ResolverOptions } from './sourcemap.js';

interface Resources {
  /** Yüklenen betikler, en yeniden eskiye. */
  scripts(): string[];
  /** Sayfa yüklendikten sonra RSC yükü yeniden getirildi mi? (Next.js: `?_rsc=`; HMR, gezinme, router.refresh) */
  rscRefetched(): boolean;
}

/**
 * Kaynak zamanlamasını izler. webpack JSONP chunk'ları yüklendikten sonra `<script>` etiketini kaldırdığı için
 * betikler buradan okunur; `PerformanceObserver`, zamanlama tamponu dolsa da yeni girişleri görür (uzun bir
 * oturumda HMR chunk'ları kaybolmasın).
 */
export function observeResources(): Resources {
  const scripts = new Map<string, number>();
  let rsc = false;
  const add = (e: PerformanceEntry) => {
    const r = e as PerformanceResourceTiming;
    if (r.initiatorType === 'script' || /\.m?js(?:[?#]|$)/.test(r.name)) scripts.set(r.name, r.startTime);
    // Geliştirmede Next.js ön yükleme yapmaz; `?_rsc=` isteği sunucu yükünün yenilendiğini gösterir.
    if (/[?&]_rsc=/.test(r.name)) rsc = true;
  };
  try {
    for (const e of performance.getEntriesByType('resource')) add(e);
    new PerformanceObserver((list) => list.getEntries().forEach(add)).observe({ type: 'resource', buffered: true });
  } catch {
    /* kaynak zamanlaması yok: yalnızca DOM'daki betikler */
  }
  return {
    scripts() {
      const out = [...scripts].sort((a, b) => b[1] - a[1]).map(([url]) => url);
      for (const s of Array.from(document.scripts)) if (s.src && !scripts.has(s.src)) out.push(s.src);
      return out;
    },
    rscRefetched: () => rsc,
  };
}

/**
 * Next.js App Router dev sunucusu, RSC çerçevelerinin haritasını `/__nextjs_source-map?filename=` ucundan verir
 * (React'in `findSourceMapURL` ayarı da bunu kullanır). Belgelenmemiş bir uç olduğu için en iyi çaba: yanıt yoksa
 * ya da geçersizse konum `resolved:false` kalır.
 */
export function nextServerSourceMapUrl(file: string): string | null {
  if (!('__next_f' in window)) return null;
  const chunk = Array.from(document.scripts).find((s) => s.src.includes('/_next/static/'));
  const basePath = chunk ? new URL(chunk.src).pathname.split('/_next/static/')[0] : '';
  const url = new URL(`${basePath}/__nextjs_source-map`, location.origin);
  url.searchParams.set('filename', file);
  return url.href;
}

export function pageResolverOptions(): ResolverOptions {
  const resources = observeResources();
  return { listScripts: resources.scripts, serverSourceMapUrl: nextServerSourceMapUrl, serverRefetched: resources.rscRefetched };
}
