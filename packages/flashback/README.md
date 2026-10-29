# flashback-devtools

> **Hatayı anlatma; göster.**

Geliştirme ortamında `Alt+Shift+F`'ye basıp hatalı öğeye tıklarsınız ve bir cümle yazarsınız. Flashback; öğenin
dosya:satırını ve kod parçasını, bileşen yığınını, son 60 saniyenin isteklerini, konsol hatalarını ve adımları tek bir
Markdown raporuna koyar. Panoya giden kısa istemi kodlama ajanınıza (Claude Code, Cursor, Codex…) yapıştırırsınız.

```bash
npm i -D flashback-devtools
```

Önkoşul: React 18.3+ ya da 19.x (arayüz kendi React kökünde çalışır).

## Vite

```tsx
// src/main.tsx
import { Flashback } from 'flashback-devtools';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Flashback />
  </>,
);
```

```ts
// vite.config.ts
import flashback from 'flashback-devtools/vite';

export default defineConfig({ plugins: [flashback(), react()] });
```

Eklenti yalnızca `vite` geliştirme sunucusunda çalışır (`vite build` ve Vitest etkilenmez):

- `.jsx`/`.tsx` dosyalarındaki HTML/SVG öğelerine `data-flashback-source="dosya:satır:sütun"` yazar. Fast Refresh'ten
  sonra da satır doğru kalır.
- `POST /__flashback/report` ucunu ekler: rapor proje kökündeki (git kökü, yoksa Vite kökü) `.flashback/<id>.md`
  dosyasına yazılır. Yalnızca sayfanın kendi kökeninden gelen istek kabul edilir. Klasör kendi `.gitignore`'unu oluşturur
  ve en yeni 50 raporu tutar.

| Seçenek | Varsayılan | |
|---|---|---|
| `dir` | `FLASHBACK_DIR`, yoksa `<proje kökü>/.flashback` | Rapor klasörü |
| `include` | `/\.[jt]sx$/` | Öznitelik yazılacak dosyalar |
| `exclude` | — | Dışarıda bırakılacak dosyalar (`node_modules` her zaman dışarıda) |

## Next.js ve diğerleri

Eklenti olmadan da çalışır: satır React'in kendi bilgisinden (`_debugStack`, `_debugSource`) ve tarayıcıdaki source
map'lerden çözülür; çözülemezse yanlış satır verilmez. Rapor dosyaya yazılmaz, tamamı panoya Markdown olarak gider.

```tsx
// app/flashback.tsx
'use client';
import { Flashback } from 'flashback-devtools';

export function FlashbackDevtools() {
  return <Flashback />;
}
```

`app/layout.tsx` içinde `<body>`'nin sonuna `<FlashbackDevtools />` ekleyin.

## Prop'lar

| Prop | Varsayılan | |
|---|---|---|
| `enabled` | `NODE_ENV !== 'production'` | |
| `shortcut` | `alt+shift+f` | Seçim kipini açıp kapatır. Fiziksel tuşla eşleşir (`event.code`); metin girişindeyken tetiklenmez. |
| `ignoreUrls` | `[]` | Rapora girmeyecek istekler: metin öneki ya da RegExp. Flashback'in kendi ucu ve HMR istekleri zaten girmez. |
| `redact` | `true` | `{ keys, patterns, emails: true, phones: false }`; `false` gizlemeyi kapatır |
| `locale` | tarayıcı dili | `tr` ya da `en`; arayüz ve rapor dili |

## Store takibi

```ts
import { trackStore } from 'flashback-devtools';

trackStore('cart', useCartStore.subscribe, useCartStore.getState); // Zustand
trackStore('redux', store.subscribe, store.getState); // Redux
```

Değişiklikler yol bazında (önceki → sonraki) rapora girer.

## Neler toplanır

Sayfa açıkken bellekte son 60 saniye tutulur: `fetch`/XHR istekleri (gövdeler kırpılır, akışlar okunmaz),
`console.error`/`warn`, yakalanmamış hatalar ve Promise redleri, tıklama/giriş/tuş/gezinme adımları ve store
değişiklikleri. İstekler için ayrıca pencereden eski olsa da son 10 istek tutulur: kök neden çoğu zaman sayfa
yüklenirken atılan bir istektir. DOM, ekran ya da ses kaydedilmez.

## Gizleme

Rapor dosyaya ya da panoya gitmeden önce tarayıcıda gizlenir. Hassas anahtar adları (şifre, token, API anahtarı, oturum,
çerez, CSRF), bilinen sır biçimleri (JWT, `Bearer`, `sk-…`, `ghp_…`, `AKIA…`), sağlamalı kişisel veriler (kart, IBAN,
T.C. Kimlik No) ve e-posta `[REDACTED:<tür>]` olur. Parola alanları her zaman gizlenir. Gizleme bir güvenlik garantisi
değildir.

## Üretim

Flashback üretim paketine girmez:

1. **`production` export koşulu.** Vite, Next.js ve webpack 5 üretim derlemesinde paket `flashback-devtools/noop`
   girişine çözülür.
2. **`process.env.NODE_ENV` ölü kod dalı.** Koşulu kullanmayan bundler'larda yakalama ve arayüz yalnızca
   `process.env.NODE_ENV !== 'production'` dalında dinamik `import()` ile yüklenir; `"production"` tanımlanınca dal düşer.
