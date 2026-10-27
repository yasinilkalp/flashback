# Rewind — Uygulama sözleşmesi (geliştiriciler ve ajanlar için)

Bağlayıcı gereksinim kaynağı: `frd/04-FRD-v1.0.md`. Bu dosya, paketler arasındaki **teknik sözleşmeyi** sabitler.
Burada yazmayan bir konuda FRD'ye bakın; FRD ile çelişen bir şey görürseniz FRD geçerlidir.

## Depo yapısı

```
packages/shared   → @rewind/shared (private): zod şeması, gizleme (Redactor), sınırlar, kimlik, assertion render, protokol sabitleri
packages/rewind   → rewind-devtools: <Rewind/> bileşeni, kaydedici, panel (tarayıcı)
packages/mcp      → rewind-mcp: MCP stdio sunucusu + HTTP alıcı + .rewind/ deposu + run_repro (Node)
examples/demo     → Vite + React 19 sepet demosu, kasıtlı hatalar, oturumlu /account rotası
frd/              → FRD belgeleri
```

- Dil: TypeScript, ESM. Node ≥ 22. Derleme `tsup`. Test `vitest` (kök `vitest.config.ts`: `packages/*/test/**/*.test.ts(x)`; e2e: `*.e2e.test.ts`).
- `@rewind/shared` yayımlanmaz; iki paket de onu `tsup` ile **bundle eder** (`noExternal: ['@rewind/shared']`).
- Kod tanımlayıcıları İngilizce. Kullanıcıya ve ajana giden metinler **Türkçe** (README ile tutarlı).
- Bağımlılıklar az ve sabit sürümlü olsun (rrweb tam sürüm: `2.2.0`).

## Paylaşılan paket (`@rewind/shared`) — değiştirmeden kullanın

- `IncidentDraftSchema` / `IncidentDraftInput`: tarayıcının POST ettiği yük. `IncidentSchema`: sunucunun sakladığı olay.
- `Redactor` (FR-RED-*): `text`, `value`, `headers`, `url`, `body`, `input`; `stats` (count, byType).
- `LIMITS`, `truncateText`, `estimateTokens`.
- `createIncidentId`, `isIncidentId`, `INCIDENT_ID_RE`.
- `renderAssertion(s)`: IR → Playwright kodu (tek yetkili kod üreticisi).
- `CLIENT_HEADER`, `DEFAULT_ENDPOINT`, `ROUTES`, `HealthResponse`, `IncidentSummary`.

Paylaşılan pakete yalnızca **ekleme** yapılabilir (geriye uyumlu). Ekleme yaptıysanız raporunuzda belirtin.

## HTTP alıcı API'si (tarayıcı ↔ rewind-mcp)

Taban: `endpoint` prop'u (varsayılan `http://127.0.0.1:4747`). Tüm yanıtlar JSON.

| Uç | Yöntem | Gövde | Yanıt |
|---|---|---|---|
| `/health` | GET | — | 200 `HealthResponse` |
| `/incidents` | POST | `IncidentDraftInput` (`Content-Type: application/json`) | 201 `{ id }` · 400 şema · 403 köken · 413 boyut · 415 içerik türü · 421 Host · 507 kota |
| `/incidents` | GET | — | 200 `IncidentSummary[]` (yeniden eskiye) |
| `/incidents/:id` | GET | — | 200 `IncidentSummary` |
| `/incidents/:id/messages?since=<ISO>` | GET | — | 200 `Message[]` |
| `/incidents/:id/messages` | POST | `{ text }` | 201 `Message` |
| `/incidents/:id/reopen` | POST | `{ reason }` | 200 `IncidentSummary` · 409 zaten açık |

Güvenlik (sunucu uygular, istemci uyar):
- Tarayıcı istekleri `Origin` başlığını kendiliğinden taşır; izin listesi: `http(s)://localhost:*`, `http(s)://127.0.0.1:*`, `http(s)://[::1]:*` ve `REWIND_ALLOW_ORIGINS`.
- `Origin` yoksa (tarayıcı dışı istemci) `x-rewind-client: <ad>` başlığı zorunlu.
- POST'ta `Content-Type: application/json` zorunlu → tarayıcı preflight (OPTIONS) yapar; sunucu izinli kökenlere CORS yanıtı verir.
- `Host` başlığı loopback olmalı (421).

## Olay taslağı nasıl dolar (tarayıcı)

- `schemaVersion: 1`, `source` (origin, rewindVersion, framework `react`, userAgent, tabId), `recordingStartedAt` (ISO UTC), tüm `t` alanları kayıt başlangıcına göre ms (FR-PKG-06).
- `context`: `url` (işaretlenen andaki), `startUrl` (pencere başındaki), viewport, locale, timezone, storage anahtarları (değer yok), çerez adları (değer yok) — FR-PKG-07.
- `note.expected` zorunlu (FR-UI-07).
- `target`: seçilen öğe ya da `null` (sayfa düzeyi olay, FR-MARK-07).
- `primaryEvidence`: `target` varsa `{kind:'target'}`; yoksa işaretlenen ana en yakın ağ hatası (status ≥ 400 ya da `error`) veya konsol hatası, `ref` = ilgili dizideki indeks (FR-MARK-08).
- `steps`: `selector` + `fallbackSelectors`; gizlenmiş giriş değerinde `value` işaretli metin, `valueRedactedAs` tür.
- `network`/`console`/`store`/`domSnapshot`/`events` gizlenmiş ve kırpılmış (`LIMITS`).
- `redaction`: `{ enabled, count, byType }` — `Redactor.stats`.
- `confidence`: FR-PKG-08 maddeleri (anahtarlar: `source`, `element`, `propsState`, `preWindow`, `truncated`, `redaction`, `synthetic`).

**Önizleme ile gönderilen yük aynı serileştirilmiş nesneden üretilir** (FR-UI-08).

## MCP tarafı özet (rewind-mcp)

- `npx rewind-mcp` → stdio MCP + HTTP alıcı tek süreçte. `serve` → yalnızca alıcı. `check` → başlangıç kontrolleri. `prune` → temizlik.
- Olaylar `<dir>/<id>.json`; repro dosyaları `<dir>/repro/<id>.spec.ts`, `<id>.steps.json`, ekran görüntüleri `<dir>/repro/<id>-<run>.png`.
- Araçlar: `list_incidents`, `get_incident`, `get_incident_events`, `get_dom_snapshot`, `run_repro`, `get_repro_script`, `reply_to_incident`, `mark_fixed` (sözleşmeler FRD §9.5, hata kodları §9.6).

## Demo (examples/demo) — kasıtlı hatalar

| Senaryo | Belirti | Kök neden (tek satır) | Beklenen |
|---|---|---|---|
| YAZ10 | Toplam `135030 ₺` | `/api/shipping` kargo ücretini metin `"30"` döndürür; `Cart.tsx` toplarken `Number()` yok | `1380 ₺` |
| KIS20 | Hiçbir şey olmaz | `/api/coupon` KIS20 için 500 döner; istemci hatayı yutar, mesaj göstermez | `role="alert"` ile hata mesajı |
| /account | Sipariş sayısı yanlış | Oturum gerektirir (`/api/login` → `sid` çerezi); sayım hatası | Doğru sayı |

Demo API'si Vite `configureServer` ara katmanıyla aynı süreçte çalışır (port 5173).
