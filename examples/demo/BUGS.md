# Demo: kasıtlı hatalar

Bu demo, Flashback akışını (öğeye tıkla → bir cümle yaz → ajana yapıştır) denemek için üç kasıtlı hata içerir.
Her hatanın düzeltmesi **tek satırlık** bir değişikliktir ve satır `// BUG(<AD>)` yorumuyla işaretlidir.

## Çalıştırma

```bash
npm install
npm run build -w flashback-devtools   # demo paketi dist'ten kullanır
npm run dev                          # http://localhost:5173
```

- Raporlar depo kökündeki `.flashback/` klasörüne yazılır.
- `FLASHBACK_DEMO_DETERMINISTIC=1` sunucuyu belirlenimci yapar (sabit oturum kimliği `sid=demo-session`).
- Demo kullanıcısı: `demo@example.com` / `demo1234` (sayfada gösterilmez; gizleme testinde sızmaması için).

## API (Vite `configureServer` ara katmanı, `vite.config.ts`)

| Uç | Davranış |
|---|---|
| `GET /api/products` | 3 ürün: 250 ₺, 500 ₺, 750 ₺ (ara toplam 1500 ₺) |
| `GET /api/shipping` | `{ "fee": "30" }` — ücret **metin** (YAZ10'un kök nedeni) |
| `POST /api/coupon` | `YAZ10` → `{ discount: 0.1 }` · `KIS20` → **500** `{ error: "internal" }` · diğerleri → 400 |
| `POST /api/login` | Doğru kimlikte `sid` HttpOnly çerezi; yanlışta 401 |
| `GET /api/orders` | Oturum yoksa 401; varsa 4 sipariş |

Kargo, indirimli tutar 1500 ₺ ve üzerindeyse ücretsizdir; bu yüzden hata yalnızca kupon uygulanınca görünür.

## YAZ10 — toplam saçma bir sayı

- **Adımlar:** Üç ürünü sepete ekle → kupon `YAZ10` → Uygula.
- **Belirti:** `[data-testid="total"]` → `135030 ₺`.
- **Beklenen:** `1380 ₺` (1500 × 0,9 + 30).
- **Kök neden:** `/api/shipping` ücreti `"30"` (metin) döndürür; `Cart.tsx` toplarken `Number()` kullanmaz, `1350 + "30"` metin birleştirmesi olur.
- **Dosya:** `src/Cart.tsx`, `// BUG(YAZ10)` satırı.

```diff
- const total = discounted + shipping; // BUG(YAZ10): …
+ const total = discounted + Number(shipping);
```

## KIS20 — hiçbir şey olmuyor (öğesiz hata)

- **Adımlar:** Üç ürünü sepete ekle → kupon `KIS20` → Uygula.
- **Belirti:** Sunucu 500 döner, kullanıcıya hiçbir şey gösterilmez (konsola `Kupon isteği başarısız` yazılır).
- **Beklenen:** `role="alert"` ile "Kupon uygulanamadı" mesajı.
- **Kök neden:** `catch` bloğu hatayı yutar; mesaj durumunu `null` yapar.
- **Dosya:** `src/Cart.tsx`, `// BUG(KIS20)` satırı. Flashback'te öğe seçmeden **Enter** ile sayfa geneli rapor açılır; raporda `POST /api/coupon → 500` görünür.

```diff
- setCouponError(null); // BUG(KIS20): …
+ setCouponError('Kupon uygulanamadı');
```

## ACCOUNT — sipariş sayısı yanlış (oturum gerektirir)

- **Adımlar:** `/login` → `demo@example.com` / `demo1234` → Giriş yap → `/account`.
- **Belirti:** `[data-testid="order-count"]` → `Sipariş sayısı: 5`.
- **Beklenen:** `Sipariş sayısı: 4`.
- **Kök neden:** Sayım `reduce` başlangıç değeri `1` ile yapılır.
- **Dosya:** `src/Account.tsx`, `// BUG(ACCOUNT)` satırı. Oturum olmadan `/account` → `/login`'e yönlendirir. E-posta ve parola girişleri raporda
  `[REDACTED:email]` / `[REDACTED:password]` olarak görünür.

```diff
- const count = orders.reduce((n) => n + 1, 1); // BUG(ACCOUNT): …
+ const count = orders.reduce((n) => n + 1, 0);
```

