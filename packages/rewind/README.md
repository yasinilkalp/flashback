# rewind-devtools

> **Hatayı anlatma; geri sar, göster.**

Geliştirme ortamında uygulamanın son ≥ 60 saniyesini kaydeder. Bir şey bozulduğunda panelde geri sararsınız,
hatalı öğeye tıklarsınız (ya da sayfa düzeyi olay açarsınız), "Ne olmalıydı?" sorusunu yanıtlarsınız ve gizlenmiş,
önizlenmiş olay paketini yerel `rewind-mcp` alıcısına gönderirsiniz. Ajan hatayı bir Playwright testiyle yeniden
üretir (kırmızı), düzeltir ve aynı testi yeniden koşar (yeşil).

```bash
npm i -D rewind-devtools rewind-mcp
```

Önkoşullar: React 18.3+ ya da 19.x, `run_repro` için projede `@playwright/test` ve bir kez `npx playwright install chromium`.

## Vite

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { Rewind } from 'rewind-devtools';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Rewind enabled={import.meta.env.DEV} />
  </>,
);
```

## Next.js (App Router)

```tsx
// app/rewind.tsx
'use client';
import { Rewind } from 'rewind-devtools';

export function RewindDevtools() {
  return <Rewind enabled={process.env.NODE_ENV === 'development'} />;
}
```

```tsx
// app/layout.tsx
import { RewindDevtools } from './rewind';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <RewindDevtools />
      </body>
    </html>
  );
}
```

Çalışan örnek: [`examples/next-app`](../../examples/next-app) (Turbopack varsayılan; `next dev --webpack` ile webpack).
İstemci bileşenlerinin satırı tarayıcıdaki source map ile, React Server Component öğelerinin satırı Next geliştirme
sunucusunun kendi source map ucuyla (`/__nextjs_source-map`, sayfanın kökeni) çözülür; çözülemezse yanlış satır
verilmez, `resolved: false` işaretlenir.

## React dışı uygulamalar (Vue, Svelte…)

Panel React ile yazıldığı için `react` ve `react-dom` kurulu olmalıdır; `<Rewind/>` uygulamadan ayrı bir React köküne
bağlanır. Kayıt, zaman çizelgesi, ağ, konsol ve adımlar çerçeveden bağımsızdır. Bileşen yığını ve JSX kaynak satırı
yalnızca React öğelerinde çıkarılır; React dışı bir öğe seçildiğinde paket bunu belirtir (`source.framework`,
`resolutionReason`). Örnek: [`examples/vue`](../../examples/vue).

```ts
// src/rewind.ts
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Rewind } from 'rewind-devtools';

const container = document.body.appendChild(document.createElement('div'));
createRoot(container).render(createElement(Rewind, { enabled: import.meta.env.DEV }));
```

## Üretim

Kaydedici ve rrweb üretim paketine girmez; iki katmanlı koruma vardır:

1. **`production` export koşulu.** Vite, Next.js ve webpack 5 üretim derlemesinde paketi `rewind-devtools/noop`
   girişine çözer (koşulu desteklemeyen araçlarda doğrudan `rewind-devtools/noop` içe aktarılabilir).
2. **`process.env.NODE_ENV` ölü kod dalı.** Koşulu kullanmayan bundler'larda (düz esbuild, rollup) ana giriş,
   kaydediciyi ve paneli yalnızca `process.env.NODE_ENV !== 'production'` dalında dinamik `import()` ile yükler.
   Bundler bu ifadeyi `"production"` olarak tanımladığında (`--define:process.env.NODE_ENV='"production"'`,
   `@rollup/plugin-replace`) dal ve rrweb paketten düşer. React gibi bu giriş de ifadenin bundler tarafından
   tanımlandığını varsayar.

`NODE_ENV=production` iken `enabled` verilse bile bileşen başlamaz ve konsola bir kez uyarı yazar. `allowProduction`
(önerilmez) yalnızca kaydedicinin derlemede bulunduğu durumlarda (ör. `import.meta.env.PROD` olan ama
`NODE_ENV=production` olmayan bir hazırlık derlemesi) çalışır ve panelde kalıcı uyarı gösterir.

## Store takibi

```ts
import { trackStore } from 'rewind-devtools';

trackStore('cart', useCartStore.subscribe, useCartStore.getState); // Zustand
trackStore('redux', store.subscribe, store.getState); // Redux
```

## Prop'lar

| Prop | Varsayılan | Not |
|---|---|---|
| `enabled` | `NODE_ENV !== 'production'` | |
| `endpoint` | `http://127.0.0.1:4747` | `rewind-mcp` alıcısı |
| `bufferSeconds` | `60` | En az bu kadar geçmiş tutulur |
| `ignoreUrls` | `[]` | Metin öneki ya da RegExp |
| `maskAllInputs` | `false` | Parolalar her durumda maskelenir |
| `redact` | `true` | `{ keys, patterns, emails: true, phones: false }`; `false` gizlemeyi kapatır |
| `shortcut` | `alt+shift+r` | `event.code` ile eşleşir; metin girişindeyken tetiklenmez |
| `position` | `bottom-right` | `bottom-left`, `top-right`, `top-left` |
| `locale` | Tarayıcı diline göre `tr` / `en` | |
| `allowProduction` | `false` | Önerilmez |
| `project` | — | `package.json` adı (ör. `project={pkg.name}`). Alıcının projesiyle uyuşmazsa "yanlış proje" gösterilir ve olay reddedilir (FR-RCV-06). |

## Gizleme

Olay, alıcıya gönderilmeden, panoya kopyalanmadan ya da `.md` olarak indirilmeden önce tarayıcıda gizlenir. Giriş
değerleri kayıt anında maskelenir (parola her zaman; e-posta alanları değerden bağımsız). Gizlenen değerler
`[REDACTED:<tür>]` olarak görünür.

- `data-rewind-mask`: öğenin metni maskelenir.
- `data-rewind-block`: bölge hiç kaydedilmez (yer tutucu olarak görünür).

URL öznitelikleri (`href`, `src`, `action`…) sorgu ve fragment parametrelerine göre; `content`/`value` öznitelikleri
kardeş `name`/`id`/`property` anahtarına göre (ör. `<meta name="csrf-token" content>`) gizlenir. Store
değişikliklerinde yolun herhangi bir parçası hassassa (`auth.token`) değer bütünüyle gizlenir.

Kaynak satırı çözümlemesi yalnızca sayfanın kendi kökeninden ve loopback adreslerinden betik/source map getirir;
üçüncü taraf betikler çözülmez (`resolved: false`).

Gönderimden önce önizleme gizlenmiş raporu, Kanıt güveni bloğunu ve "Ayrıca gönderilenler" özetini gösterir;
önizleme ve gönderilen yük aynı serileştirilmiş metinden üretilir. Alıcıya ulaşılamazsa rapor panoya kopyalanır,
pano yoksa `<zaman>.rewind.md` olarak iner ve olay sekme ömrü boyunca yeniden gönderilmek üzere kuyrukta bekler.
