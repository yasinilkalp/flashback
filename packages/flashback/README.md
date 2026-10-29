# flashback-devtools

> **Hatayı anlatma; o ana dön, göster.**

Geliştirme ortamında kaydı araç çubuğundan (ya da `Alt+Shift+R` ile) başlatıp durdurursunuz. "Kayda başla" penceresinde
yalnızca bu sekmeyi (DOM, ağ, konsol) ya da ekranı/pencereyi seçer, isteğe bağlı mikrofon eklersiniz; ekran videosu ve
ses olaya `.webm` olarak eklenir. Her durdurma (en geç 60 sn'de) o anı sepete bir olay olarak ekler ve olayın ekranını
açar. Sepette her olayı geri sarar, hatalı öğeye tıklar (ya da sayfa düzeyi olay açar), "Ne
olmalıydı?" sorusunu yanıtlarsınız. Gizlenmiş, önizlenmiş olayları yerel `flashback-mcp` alıcısına birlikte
gönderirsiniz ya da tek bir prompt olarak kopyalarsınız. Ajan hatayı bir Playwright testiyle yeniden
üretir (kırmızı), düzeltir ve aynı testi yeniden koşar (yeşil).

```bash
npm i -D flashback-devtools flashback-mcp
```

Önkoşullar: React 18.3+ ya da 19.x, `run_repro` için projede `@playwright/test` ve bir kez `npx playwright install chromium`.

## Vite

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { Flashback } from 'flashback-devtools';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Flashback enabled={import.meta.env.DEV} />
  </>,
);
```

### Kaynak eklentisi (önerilir)

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
import flashbackSource from 'flashback-devtools/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [flashbackSource(), react()],
});
```

Eklenti, geliştirme sunucusunda JSX'teki HTML ve SVG öğelerine `data-flashback-source="src/Cart.tsx:42:7"` özniteliğini yazar. İşaretlenen öğenin satırı önce bu öznitelikten okunur:

- Kod düzenlenip sayfa HMR ile güncellendikten sonra da satır doğru kalır. React 19'da eklenti olmadan bu satır doğrulanamaz ve `resolved: false` olarak işaretlenir.
- Satır, dosyanın güncel içeriğiyle karşılaştırılır. Tutmazsa (ör. kayıttan sonra dosya değiştiyse) satır verilir ama doğrulanmamış olarak işaretlenir.
- Öznitelik yoksa (bağımlılıklardaki bileşenlerin öğeleri, eklenti kurulmamışsa) eski yola, fiber ve source map çözümüne düşülür.

Eklenti yalnızca `vite` geliştirme sunucusunda çalışır. `vite build` ve Vitest (`mode: 'test'`) çıktısına girmez, anlık görüntü testleri etkilenmez. `node_modules` dönüştürülmez. Öznitelik ajana giden olay paketinden çıkarılır; yalnızca paneldeki tekrar oynatmada kalır. Seçenekler:

| Seçenek | Varsayılan | Açıklama |
|---|---|---|
| `include` | `/\.[jt]sx$/` | Dönüştürülecek dosyalar |
| `exclude` | — | Dışarıda bırakılacak dosyalar (ör. react-three-fiber sahneleri: `/\/scene\//`) |

Öznitelik yalnızca bilinen HTML/SVG etiketlerine ve özel öğelere (`my-element`) yazılır; `<mesh>` gibi DOM dışı küçük harfli etiketlere dokunulmaz.

## Next.js (App Router)

```tsx
// app/flashback.tsx
'use client';
import { Flashback } from 'flashback-devtools';

export function FlashbackDevtools() {
  return <Flashback enabled={process.env.NODE_ENV === 'development'} />;
}
```

```tsx
// app/layout.tsx
import { FlashbackDevtools } from './flashback';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <FlashbackDevtools />
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

Panel React ile yazıldığı için `react` ve `react-dom` kurulu olmalıdır; `<Flashback/>` uygulamadan ayrı bir React köküne
bağlanır. Kayıt, zaman çizelgesi, ağ, konsol ve adımlar çerçeveden bağımsızdır. Bileşen yığını ve JSX kaynak satırı
yalnızca React öğelerinde çıkarılır; React dışı bir öğe seçildiğinde paket bunu belirtir (`source.framework`,
`resolutionReason`). Örnek: [`examples/vue`](../../examples/vue).

```ts
// src/flashback.ts
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Flashback } from 'flashback-devtools';

const container = document.body.appendChild(document.createElement('div'));
createRoot(container).render(createElement(Flashback, { enabled: import.meta.env.DEV }));
```

## Üretim

Kaydedici ve rrweb üretim paketine girmez; iki katmanlı koruma vardır:

1. **`production` export koşulu.** Vite, Next.js ve webpack 5 üretim derlemesinde paketi `flashback-devtools/noop`
   girişine çözer (koşulu desteklemeyen araçlarda doğrudan `flashback-devtools/noop` içe aktarılabilir).
2. **`process.env.NODE_ENV` ölü kod dalı.** Koşulu kullanmayan bundler'larda (düz esbuild, rollup) ana giriş,
   kaydediciyi ve paneli yalnızca `process.env.NODE_ENV !== 'production'` dalında dinamik `import()` ile yükler.
   Bundler bu ifadeyi `"production"` olarak tanımladığında (`--define:process.env.NODE_ENV='"production"'`,
   `@rollup/plugin-replace`) dal ve rrweb paketten düşer. React gibi bu giriş de ifadenin bundler tarafından
   tanımlandığını varsayar.

`NODE_ENV=production` iken `enabled` verilse bile bileşen başlamaz ve konsola bir kez uyarı yazar. `allowProduction`
(önerilmez) yalnızca kaydedicinin derlemede bulunduğu durumlarda (ör. `NODE_ENV=production` olmayan bir hazırlık
derlemesi) çalışır ve panelde kalıcı uyarı gösterir.

## Store takibi

```ts
import { trackStore } from 'flashback-devtools';

trackStore('cart', useCartStore.subscribe, useCartStore.getState); // Zustand
trackStore('redux', store.subscribe, store.getState); // Redux
```

## Prop'lar

| Prop | Varsayılan | Not |
|---|---|---|
| `enabled` | `NODE_ENV !== 'production'` | |
| `endpoint` | `http://127.0.0.1:4747` | `flashback-mcp` alıcısı |
| `maxRecordSeconds` | `60` | Bir kaydın en uzun süresi (sn); dolunca kayıt durur ve olay sepete eklenir |
| `ignoreUrls` | `[]` | Metin öneki ya da RegExp |
| `maskAllInputs` | `false` | Parolalar her durumda maskelenir |
| `redact` | `true` | `{ keys, patterns, emails: true, phones: false }`; `false` gizlemeyi kapatır |
| `shortcut` | `alt+shift+r` | Kaydı başlatıp durdurur; `event.code` ile eşleşir, metin girişindeyken tetiklenmez. Windows'ta `Alt+Shift` klavye dilini değiştiriyorsa başka bir kısayol verin |
| `position` | `bottom-right` | `bottom-left`, `top-right`, `top-left` |
| `locale` | Tarayıcı diline göre `tr` / `en` | |
| `allowProduction` | `false` | Önerilmez |
| `project` | — | `package.json` adı (ör. `project={pkg.name}`). Alıcının projesiyle uyuşmazsa "yanlış proje" gösterilir ve olay reddedilir (FR-RCV-06). |

## Gizleme

Olay, alıcıya gönderilmeden, panoya kopyalanmadan ya da `.md` olarak indirilmeden önce tarayıcıda gizlenir. Giriş
değerleri kayıt anında maskelenir (parola her zaman; e-posta alanları değerden bağımsız). Gizlenen değerler
`[REDACTED:<tür>]` olarak görünür.

- `data-flashback-mask`: öğenin metni maskelenir.
- `data-flashback-block`: bölge hiç kaydedilmez (yer tutucu olarak görünür).

URL öznitelikleri (`href`, `src`, `action`…) sorgu ve fragment parametrelerine göre; `content`/`value` öznitelikleri
kardeş `name`/`id`/`property` anahtarına göre (ör. `<meta name="csrf-token" content>`) gizlenir. Store
değişikliklerinde yolun herhangi bir parçası hassassa (`auth.token`) değer bütünüyle gizlenir.

Kaynak satırı çözümlemesi yalnızca sayfanın kendi kökeninden ve loopback adreslerinden betik/source map getirir;
üçüncü taraf betikler çözülmez (`resolved: false`).

Gönderimden önce önizleme gizlenmiş raporu, Kanıt güveni bloğunu ve "Ayrıca gönderilenler" özetini gösterir;
önizleme ve gönderilen yük aynı serileştirilmiş metinden üretilir. Alıcıya ulaşılamazsa rapor panoya kopyalanır,
pano yoksa `<zaman>.flashback.md` olarak iner ve olay sekme ömrü boyunca yeniden gönderilmek üzere kuyrukta bekler.
