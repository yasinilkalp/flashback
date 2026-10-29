# Flashback

**Hatayı anlatma; göster.**

Geliştirme ortamında hatalı öğeye tıklayıp bir cümle yazarsınız. Flashback, kodlama ajanınızın (Claude Code, Cursor, Codex…) ihtiyaç duyduğu her şeyi tek bir Markdown raporuna koyar: öğenin **dosya:satırı** ve kod parçası, bileşen yığını, son 60 saniyenin **istekleri**, **konsol** hataları ve **adımlar**.

## Kullanım

1. **`Alt+Shift+F`** ya da sağ alttaki Flashback düğmesi. Hatalı öğenin üstüne gelin; yanında `Cart.tsx:69 · <Cart>` görünür.
2. **Tıklayın** ve "Ne yanlış?" kutusuna bir cümle yazın. Öğesi olmayan bir hata için (ör. sessizce başarısız olan istek) tıklamak yerine **`Enter`**: sayfa geneli rapor.
3. **`Enter`**. Panoya şu gider; ajanınıza yapıştırın:

   ```
   Flashback raporunu oku ve hatayı düzelt: .flashback/fb-20261030-141205-k3pz.md
   ```

Kayıt başlatmak gerekmez: Flashback sayfa açıkken son dakikanın isteklerini, konsolunu ve adımlarını bellekte tutar. Ekran, DOM ya da ses kaydı yoktur.

## Kurulum

```bash
npm i -D flashback-devtools
```

```tsx
// main.tsx
import { Flashback } from 'flashback-devtools';

root.render(
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

Vite eklentisi iki iş yapar: öğelerin JSX satırını işaretler (kod değişse de satır doğru kalır) ve raporu proje kökündeki `.flashback/` klasörüne yazar. Klasör kendi `.gitignore`'unu oluşturur ve son 50 raporu tutar.

Eklenti yoksa (Next.js, webpack) Flashback yine çalışır: satırı React'in kendi bilgisinden ve source map'lerden çözer, raporun tamamını panoya Markdown olarak kopyalar.

Üretim derlemesinde Flashback pakete hiç girmez.

### MCP (isteğe bağlı)

Ajanınıza yapıştırmadan "son hatayı düzelt" demek için:

```bash
npm i -D flashback-mcp
```

```json
{ "mcpServers": { "flashback": { "command": "npx", "args": ["--no-install", "flashback-mcp"] } } }
```

Claude Code için `.mcp.json`, Cursor için `.cursor/mcp.json`. Codex (`~/.codex/config.toml`) sunucuyu proje dışında başlatabildiği için `env = { FLASHBACK_PROJECT_ROOT = "/yol/projeniz" }` ekleyin.

| Araç | Ne yapar |
|---|---|
| `get_report` | Raporu verir; kimlik verilmezse en yenisini |
| `list_reports` | Raporları yeniden eskiye listeler |

## Rapor

```md
# Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor

## Öğe
`examples/demo/src/Cart.tsx:69` · <Cart> ← <App>
▶ 69 │   <dd data-testid="total">{formatTry(total)}</dd>

## Son 60 sn
### İstekler
- −14 sn · GET `/api/shipping` → 200 (8 ms)
  - yanıt: `{"fee":"30"}`
### Adımlar
- −11 sn · yaz `#coupon` = `YAZ10`
- −11 sn · tıkla `Uygula`
```

Öğenin props/state'i ve HTML'i, store değişiklikleri (`trackStore`) ve konsol kayıtlarının kaynak satırları da rapordadır.

## Ayarlar

| Prop | Varsayılan | |
|---|---|---|
| `enabled` | `NODE_ENV !== 'production'` | |
| `shortcut` | `alt+shift+f` | Fiziksel tuşla eşleşir (`event.code`). Windows'ta `Alt+Shift` klavye dilini değiştiriyorsa başka bir kısayol verin. |
| `ignoreUrls` | `[]` | Rapora girmeyecek istekler: metin öneki ya da RegExp |
| `redact` | `true` | `{ keys, patterns, emails, phones }`; `false` kapatır |
| `locale` | tarayıcı dili | `tr` ya da `en`; arayüz ve rapor dili |

Store değişikliklerini rapora eklemek için:

```ts
import { trackStore } from 'flashback-devtools';

trackStore('cart', useCartStore.subscribe, useCartStore.getState); // Zustand
trackStore('redux', store.subscribe, store.getState); // Redux
```

## Gizlilik

- Rapor makinenizden çıkmaz. Flashback yalnızca kendi geliştirme sunucunuza (sayfanın kökenine) istek atar.
- Rapor tarayıcıda, dosyaya ya da panoya gitmeden önce gizlenir: şifre, token, API anahtarı, çerez, kart numarası, IBAN, T.C. Kimlik No ve e-posta `[REDACTED:<tür>]` olur. Parola alanları her zaman gizlenir.
- Gizleme bir güvenlik garantisi değildir. Rapor, ajanınızın kullandığı model sağlayıcısına gidebilir.

## Geliştirme

```bash
npm install
npm run build
npm run dev          # demo: http://localhost:5173 (kasıtlı hatalar: examples/demo/BUGS.md)
npm test
npm run test:e2e     # önce: npx playwright install chromium
```

```
packages/flashback  → flashback-devtools: <Flashback/>, Vite eklentisi
packages/mcp        → flashback-mcp: iki araçlı MCP sunucusu
examples/demo       → kasıtlı hatalar içeren Vite + React demo
```

Neden bu kadar küçük: [`docs/sadelestirme.md`](docs/sadelestirme.md). Kayıt, sepet ve `run_repro` içeren önceki sürüm `v0.1.0-beta.3` etiketinde; eski FRD `archive/` klasöründe.

## Lisans

MIT
