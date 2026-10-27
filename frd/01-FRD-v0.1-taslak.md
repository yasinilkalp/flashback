# Flashback — Fonksiyonel Gereksinim Dokümanı (FRD)

| Alan | Değer |
|---|---|
| Belge | Flashback FRD |
| Sürüm | v0.1 (taslak — inceleme öncesi) |
| Tarih | 26.10.2026 |
| Hazırlayan | Yasin İlkalp Arabacı (USTA) / Claude |
| Durum | İncelemeye açık |
| Kaynaklar | Proje tanımı (Flashback projesi), `README.md`, `package.json`, `vitest*.config.ts` |

> Slogan: **Hatayı anlatma; geri sar, göster.**

---

## 1. Amaç

Flashback, yapay zekâ kodlama ajanları için zaman yolculuklu bir hata raporlama aracıdır. Geliştirme ortamında çalışan web uygulamasının son ~60 saniyesini sürekli kaydeder. Geliştirici bir hata gördüğünde zaman çizelgesinde geri sarar, hatanın başladığı anı bulur, ilgili öğeye tıklar ve kısa bir not yazar. Flashback bu tıklamadan tek bir **olay paketi** üretir ve MCP üzerinden kodlama ajanına iletir. Ajan hatayı bir Playwright testiyle yeniden üretir (kırmızı), düzeltir, aynı testi tekrar çalıştırır (yeşil) ve olayı kapatır.

Bu belge, Flashback'in MVP ve MVP sonrası ilk sürümleri için **ne yapması gerektiğini** tanımlar. Nasıl yapılacağı (tasarım ayrıntıları) yalnızca gereksinimi anlaşılır kılmak için anılır.

## 2. Ürün hedefleri

| Kimlik | Hedef | Ölçüt (öneri) |
|---|---|---|
| H1 | Hatayı anlatma derdini bitirmek | Geliştiricinin hata bildirimi için yazdığı serbest metin uzunluğu azalır |
| H2 | Ajana tahmin değil kanıt vermek | Ajan doğru dosya:satırı ilk turda bulur |
| H3 | Düzeltmeyi kanıtlamak | Her kapanan olayda önce kırmızı, sonra yeşil test koşusu bulunur |
| H4 | Daha az token, daha az tur | Demo hatada ilk turda okunan bağlam ~%60 küçüldü; bu korunur/iyileşir |
| H5 | Veriyi makinede ve güvende tutmak | Hiçbir veri makine dışına çıkmaz; hassas değerler ajana gitmeden gizlenir |
| H6 | Basit kurulum, ajandan bağımsızlık | 2 npm paketi ile kurulum; MCP destekleyen her ajanla çalışma |

## 3. Kapsam

### 3.1 Kapsam içi

- `flashback-devtools`: uygulamaya eklenen tarayıcı bileşeni (`<Flashback/>`), kaydedici, zaman çizelgesi paneli, işaretleme, gizleme.
- `flashback-mcp`: stdio MCP sunucusu + yerel HTTP alıcısı + olay deposu (`.flashback/`) + `run_repro` çalıştırıcısı.
- React (18 ve 19) için bileşen yığını ve kaynak satırı çözümleme.
- Vite, Next.js ve webpack geliştirme sunucularının source map'leri.
- Zustand, Redux ve özel store'lar için `trackStore` ile store izleme.
- Claude Code, Cursor, Codex ve MCP destekleyen diğer ajanlar.

### 3.2 Kapsam dışı (bu sürüm)

- Üretim ortamında kayıt (session replay ürünü değildir).
- Bulut senkronizasyonu, ekip paylaşımı, uzak depolama.
- Vue/Svelte için bileşen yığını (diğer veriler toplanır).
- Canvas, video ve çapraz kökenli iframe içeriklerinin tekrar oynatılması.
- Mobil/yerel uygulamalar (React Native vb.).

## 4. Tanımlar

| Terim | Tanım |
|---|---|
| Olay (incident) | Geliştiricinin işaretleyip kaydettiği tek bir hata raporu; benzersiz kimliği vardır (`fb-YYYYMMDD-HHMMSS-xxxx`) |
| Olay paketi | Olaya ait tüm kanıtlar: öğe, kaynak satırı, bileşen yığını, adımlar, ağ, konsol, store, DOM |
| Halka tampon | Son `bufferSeconds` süreyi tutan, eskisini atan kayıt belleği |
| İşaretlenen an (`marked_at`) | Geliştiricinin zaman çizelgesinde seçtiği zaman noktası |
| Hedef öğe (`target`) | İşaretlenen anda tıklanan DOM öğesi |
| Repro | Kaydedilen adımları gerçek tarayıcıda oynatıp beklentiyi doğrulayan Playwright testi |
| Kırmızı/Yeşil | Repro testinin kalması / geçmesi |
| Alıcı | `flashback-mcp` içindeki, tarayıcıdan olay alan HTTP sunucusu (`127.0.0.1:4747`) |

## 5. Paydaşlar ve personalar

| Persona | Rol | Beklenti |
|---|---|---|
| P1 — Geliştirici (birincil kullanıcı) | Uygulamayı geliştirip AI ajanıyla çalışan frontend/fullstack geliştirici | Hatayı tarif etmeden göstermek, hızlı düzeltme |
| P2 — Kodlama ajanı (sistem kullanıcısı) | Claude Code, Cursor, Codex vb. | Yapılandırılmış, gürültüsüz, doğrulanabilir kanıt |
| P3 — Proje sahibi/bakımcı | Flashback'i geliştiren ekip | Bakımı kolay, ajandan bağımsız mimari |

## 6. Sistem bağlamı

```
 Tarayıcı (dev)                                   Ajan
┌──────────────────────────────┐           ┌───────────────────┐
│ <Flashback/>                    │           │ Claude Code /     │
│  ├ rrweb DOM kaydı (halka)   │           │ Cursor / Codex    │
│  ├ fetch/XHR yakalama        │  POST     └─────────▲─────────┘
│  ├ console + hata yakalama   │ /incidents          │ stdio (MCP)
│  ├ adım kaydı (tık, giriş…)  │──────────► ┌────────┴──────────┐
│  ├ store takibi              │ ◄──────────│ flashback-mcp        │
│  └ React fiber + sourcemap   │  GET       │  └ .flashback/*.json │
└──────────────────────────────┘ (yanıtlar) └───────────────────┘
```

---

## 7. Fonksiyonel gereksinimler

Öncelik: **M** = Must (MVP), **S** = Should, **C** = Could.

### 7.1 Kayıt (REC)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-REC-01 | Sistem, `enabled=true` olduğunda sayfa yüklenir yüklenmez DOM değişikliklerini rrweb ile kaydetmeye başlamalıdır. | M | Bileşen monte edildikten sonra ilk tam anlık görüntü 1 sn içinde alınır |
| FR-REC-02 | Kayıt halka tamponda tutulmalı; tampon `bufferSeconds/2` aralıkla tam anlık görüntü alır ve son iki dilimi saklar. | M | Bellekteki kayıt süresi her an `[bufferSeconds/2, bufferSeconds]` aralığındadır |
| FR-REC-03 | `fetch` ve `XMLHttpRequest` çağrıları yöntem, URL, durum kodu, süre, istek ve yanıt gövdesiyle kaydedilmelidir. | M | Demo uygulamadaki `POST /api/coupon` çağrısı gövdesiyle olayda görünür |
| FR-REC-04 | `ignoreUrls` (metin öneki veya RegExp) ile eşleşen istekler kaydedilmemelidir. | M | Eşleşen istek olay paketinde yer almaz |
| FR-REC-05 | `console.error`, `console.warn`, yakalanmamış istisnalar ve işlenmemiş Promise redleri kaynak konumuyla kaydedilmelidir. | M | Demo KIS20 senaryosunda konsol hatası olayda görünür |
| FR-REC-06 | Kullanıcı adımları (tıklama, metin girişi, tuş, sayfa geçişi) seçici ve zaman damgasıyla kaydedilmelidir. | M | Adımlardan üretilen Playwright testi senaryoyu oynatır |
| FR-REC-07 | Parola alanları her zaman maskelenmeli; `maskAllInputs=true` ise tüm girişler maskelenmelidir. | M | Parola değeri hiçbir kayıtta açık metin olarak bulunmaz |
| FR-REC-08 | `trackStore(ad, subscribe, getState)` ile kaydedilen store'ların her değişikliği önceki→sonraki değerle kaydedilmelidir. | S | Zustand ve Redux örneklerinde değişiklik farkı olayda görünür |
| FR-REC-09 | Flashback'in kendi arayüzü ve kendi ağ istekleri kayda girmemelidir. | M | Olay paketinde Flashback paneline ait DOM ya da `:4747` isteği yoktur |

### 7.2 Panel ve zaman çizelgesi (UI)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-UI-01 | Sağ altta (yapılandırılabilir köşe) bir Flashback düğmesi gösterilmelidir. | M | `position` prop'u dört köşeyi destekler |
| FR-UI-02 | Panel, `shortcut` (varsayılan `Alt+Shift+R`) ile açılıp kapanmalıdır. | M | Kısayol uygulamanın kendi kısayollarıyla çakışmadığında çalışır |
| FR-UI-03 | Panel açıldığında tampon dondurulmalı ve zaman çizelgesi üzerinde geri/ileri sarma yapılabilmelidir. | M | Kullanıcı geçmişteki herhangi bir kareye gidebilir |
| FR-UI-04 | Zaman çizelgesinde ağ hataları, konsol hataları ve kullanıcı adımları işaretçi olarak gösterilmelidir. | S | Hatalı istek kırmızı işaretçiyle görünür |
| FR-UI-05 | **S** tuşu seçim kipini açmalı; kullanıcı tekrar oynatma karesindeki bir öğeye tıklayarak hedef öğeyi seçmelidir. | M | Seçilen öğe vurgulanır, seçici ve bileşen adı gösterilir |
| FR-UI-06 | Kullanıcı bir not (beklenen davranış) yazabilmeli ve **Kaydet ve ajana gönder** ile olayı oluşturabilmelidir. | M | Olay alıcıya ulaşır ve panelde onay görünür |
| FR-UI-07 | **Kayıtlar** sekmesi, olayları durumları ve son repro sonuçlarıyla listelemelidir. | M | Kırmızı/yeşil geçmişi olay başına görünür |
| FR-UI-08 | Ajanın `reply_to_incident` ile sorduğu sorular panelde görünmeli, geliştirici panelden yanıt verebilmelidir. | S | Soru 5 sn içinde panelde belirir |

### 7.3 İşaretleme ve öğe çözümleme (MARK)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-MARK-01 | Tekrar oynatmada seçilen öğe, düğüm kimliği üzerinden canlı sayfadaki aynı öğeye eşlenmelidir. | M | Eşleme demo senaryolarında %100 başarılı |
| FR-MARK-02 | Hedef öğe için benzersiz bir CSS seçici üretilmelidir. | M | Seçici canlı sayfada tek öğeyi döndürür |
| FR-MARK-03 | React fiber'ından bileşen yığını (en yakından köke) çıkarılmalıdır. | M | Demo "Toplam" öğesinde `Cart` bileşeni yığında görünür |
| FR-MARK-04 | JSX'in yazıldığı dosya:satır, React 19'da `_debugStack`, React 18'de `_debugSource` ile alınmalı ve source map ile orijinal dosyaya çözülmelidir. | M | Demo hatada `Cart.tsx:<satır>` doğru döner |
| FR-MARK-05 | Hedef öğenin props, state, hesaplanan stilleri ve o andaki HTML'i pakete eklenmelidir. | M | Pakette alanlar bulunur; props/state'in işaretleme anında canlı uygulamadan okunduğu açıkça belirtilir |
| FR-MARK-06 | React dışı çerçevelerde bileşen yığını boş bırakılmalı, diğer veriler eksiksiz toplanmalıdır. | S | Vue demo uygulamasında olay oluşturulabilir |

### 7.4 Olay paketi (PKG)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-PKG-01 | Olay paketi şunları içermelidir: kimlik, oluşturma zamanı, sayfa URL'i, işaretlenen an, not, hedef öğe bilgileri, adımlar, ağ, konsol, store, DOM anlık görüntüsü, gizleme özeti. | M | JSON şemasına uyar |
| FR-PKG-02 | Paket, ajanın okuyacağı bir Markdown raporuna dönüştürülebilmelidir; rapor en önemli kanıtı (hedef, dosya:satır, ilgili hatalar) en üstte vermelidir. | M | `get_incident` çıktısı ilk ekranda dosya:satırı içerir |
| FR-PKG-03 | Rapor, işaretlenen anın çevresindeki olayları öne çıkarmalı, ilgisiz gürültüyü kırpmalıdır. | S | Demo hatada ilk tur bağlamı ≥%60 küçük kalır |
| FR-PKG-04 | Paket, adımlardan üretilmiş çalıştırılabilir bir Playwright testi içermelidir. | M | Test `.flashback/repro/<id>.spec.ts` olarak yazılabilir |

### 7.5 Hassas veri gizleme (RED)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-RED-01 | Olay, alıcıya gönderilmeden ya da panoya kopyalanmadan **önce tarayıcıda** gizleme işleminden geçirilmelidir. | M | Alıcıya giden yükte gizli değer yoktur |
| FR-RED-02 | Anahtar adına göre gizleme: `password`, `accessToken`, `apiKey`, `authorization`, `sessionId`, çerez vb. — JSON, form gövdesi, URL parametresi, props içinde. | M | Birim testleri geçer |
| FR-RED-03 | Desenle gizleme: JWT, `Bearer …`, `sk-…`, `ghp_…`, `AKIA…`, `xox…-`, `AIza…`. | M | Birim testleri geçer |
| FR-RED-04 | Sağlamalı desenler: kart numarası (Luhn), IBAN (mod-97), T.C. Kimlik No (TCKN algoritması); sıradan sayılar etkilenmemelidir. | M | Yanlış pozitif testleri geçer |
| FR-RED-05 | E-posta adresleri varsayılan gizlenmeli, `redact={{ emails: false }}` ile kapatılabilmelidir. | M | — |
| FR-RED-06 | Kullanıcı kendi anahtarlarını ve desenlerini ekleyebilmelidir. | M | `redact={{ keys, patterns }}` çalışır |
| FR-RED-07 | Gizlenen değerler `[REDACTED]` veya türüyle (`[REDACTED:email]`) gösterilmeli, rapor kaç değerin gizlendiğini belirtmelidir. | M | Raporda sayaç görünür |
| FR-RED-08 | `redact=false` her şeyi kaydedildiği gibi göndermelidir. | M | — |

### 7.6 Alıcı ve depolama (RCV)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-RCV-01 | `flashback-mcp`, varsayılan `127.0.0.1:4747` üzerinde HTTP alıcısı açmalıdır (`FLASHBACK_HOST`, `FLASHBACK_PORT`). | M | — |
| FR-RCV-02 | Alıcı yalnızca localhost kökenlerinden gelen isteklere izin vermeli; diğer kökenler `FLASHBACK_ALLOW_ORIGINS` ile açıkça eklenmelidir. | M | Yabancı köken 403 alır |
| FR-RCV-03 | Olaylar `FLASHBACK_DIR` (varsayılan `<cwd>/.flashback`) altına JSON olarak yazılmalı; klasör kendi `.gitignore` dosyasını oluşturmalıdır. | M | `.flashback/` git'e girmez |
| FR-RCV-04 | `npx flashback-mcp serve` yalnızca alıcıyı çalıştırmalı; ajan sonradan bağlandığında port doluysa olayları çalışan sunucudan okumalıdır. | S | İki süreç senaryosu e2e testi geçer |
| FR-RCV-05 | MCP sunucusu erişilemezse olay Markdown olarak panoya kopyalanmalı ve kullanıcı bilgilendirilmelidir. | M | Alıcı kapalıyken pano içeriği dolu |

### 7.7 MCP araçları (MCP)

| Kimlik | Araç | Gereksinim | Öncelik |
|---|---|---|---|
| FR-MCP-01 | `list_incidents` | Açık, düzeltilmiş veya tüm olayları listeler | M |
| FR-MCP-02 | `get_incident` | Tam raporu Markdown olarak döndürür | M |
| FR-MCP-03 | `get_incident_events` | Ham zaman çizelgesini JSON döndürür; `around_ms` ile filtreler | M |
| FR-MCP-04 | `get_dom_snapshot` | O andaki HTML'i döndürür; `contains` ile arar | S |
| FR-MCP-05 | `run_repro` | Adımları gerçek tarayıcıda oynatır, `assertions` kodunu işaretlenen anda çalıştırır; geçti/kaldı, hata, gözlenen konsol/ağ hataları ve ekran görüntüsü döndürür | M |
| FR-MCP-06 | `get_repro_script` | Testi çalıştırmadan üretir | S |
| FR-MCP-07 | `reply_to_incident` | Geliştiriciye soru sorar | S |
| FR-MCP-08 | `mark_fixed` | Olayı düzeltme özetiyle kapatır | M |

### 7.8 Kırmızı → yeşil doğrulama (REPRO)

| Kimlik | Gereksinim | Öncelik | Kabul kriteri |
|---|---|---|---|
| FR-REPRO-01 | `run_repro`, projenin kendi `@playwright/test` paketini kullanmalı (`FLASHBACK_PROJECT_ROOT`), proje `playwright.config` dosyasını kullanmamalı; `.flashback/repro/` altında ayrı çalışmalıdır. | M | Proje ayarları testi etkilemez |
| FR-REPRO-02 | Assertion kodu içinde `target` değişkeni hedef öğeyi temsil etmelidir. | M | `expect(target).toHaveText(...)` çalışır |
| FR-REPRO-03 | `strict: true` ise konsol hataları ve HTTP ≥400 yanıtlar testi kaldırmalıdır. | S | — |
| FR-REPRO-04 | `base_url` ve `headed` seçenekleri desteklenmelidir. | S | — |
| FR-REPRO-05 | Her koşunun sonucu (zaman, durum, süre) olaya kaydedilmeli ve sonuçta önceki koşular listelenmelidir. | M | "Önceki koşular: ❌ 15:03:06" görünür |
| FR-REPRO-06 | Sonuç, ajana yorum içermelidir (ör. "Düzeltmeden önceyse beklenen sonuç — hata yeniden üretildi"). | S | — |
| FR-REPRO-07 | Dev sunucusu kapalıysa test çalıştırılmamalı, ajana açık bir mesaj dönmelidir. | M | — |
| FR-REPRO-08 | Üretilen spec dosyası olduğu gibi projenin test klasörüne taşınabilir olmalıdır. | S | Taşınan dosya projenin Playwright'ı ile geçer |

### 7.9 Olay yaşam döngüsü (LIFE)

| Kimlik | Gereksinim | Öncelik |
|---|---|---|
| FR-LIFE-01 | Olay durumları: `open` → `fixed`. | M |
| FR-LIFE-02 | `mark_fixed`, son koşu kaldıysa veya hiç koşu yoksa ajanı uyarmalıdır. | M |
| FR-LIFE-03 | Kapanan olayın düzeltme özeti ve son test sonucu panelde görünmelidir. | M |

### 7.10 Kurulum ve yapılandırma (CFG)

| Kimlik | Gereksinim | Öncelik |
|---|---|---|
| FR-CFG-01 | Kurulum `npm i -D flashback-devtools flashback-mcp` ile yapılmalıdır. | M |
| FR-CFG-02 | `<Flashback enabled={import.meta.env.DEV} />` ile üretimde devre dışı bırakılabilmelidir. | M |
| FR-CFG-03 | Props: `enabled`, `endpoint`, `bufferSeconds`, `ignoreUrls`, `maskAllInputs`, `redact`, `shortcut`, `position`. | M |
| FR-CFG-04 | Claude Code, Cursor ve Codex için hazır MCP yapılandırma örnekleri sunulmalıdır. | M |
| FR-CFG-05 | Ortam değişkenleri: `FLASHBACK_PORT`, `FLASHBACK_HOST`, `FLASHBACK_DIR`, `FLASHBACK_PROJECT_ROOT`, `FLASHBACK_ALLOW_ORIGINS`. | M |

---

## 8. Ana kullanıcı akışı

1. Geliştirici uygulamayı dev modunda çalıştırır; Flashback arka planda kaydeder.
2. Hata görülür (ör. YAZ10 kuponundan sonra toplam "135030 ₺").
3. `Alt+Shift+R` → panel açılır, tampon donar.
4. Zaman çizelgesinde geri sarılır; **S** → "Toplam" öğesine tıklanır.
5. Not: "Toplam 1380 ₺ olmalı." → **Kaydet ve ajana gönder**.
6. Gizleme çalışır → olay alıcıya POST edilir → `.flashback/<id>.json`.
7. Geliştirici ajana: "Flashback olaylarına bak ve düzelt."
8. Ajan `list_incidents` → `get_incident` → `run_repro` (❌ kırmızı).
9. Ajan `Cart.tsx`'i düzeltir → `run_repro` (✅ yeşil) → `mark_fixed`.
10. Panelde Kayıtlar sekmesinde ❌ → ✅ geçmişi görünür.

Alternatif akışlar: MCP kapalı → panoya kopyalama; ajan soru sorar → panelden yanıt.

## 9. Veri modeli (özet)

```jsonc
Incident {
  id: string,                 // fb-20261026-150247-x6mn
  status: "open" | "fixed",
  createdAt: ISODate,
  url: string,
  markedAtMs: number,
  note: string,
  target: { selector, file, line, column, componentStack[], props, state, computedStyle, html },
  steps: Step[],              // click | input | key | navigate
  network: NetworkEntry[],    // method, url, status, durationMs, reqBody, resBody
  console: ConsoleEntry[],    // level, message, stack, source
  store: StoreChange[],       // name, path, before, after, t
  domSnapshot: string,
  redaction: { count, byType },
  repros: ReproRun[],         // t, passed, durationMs, error, screenshot
  messages: Message[],        // from: agent|dev, text, t
  fix?: { summary, t }
}
```

## 10. Fonksiyonel olmayan gereksinimler

| Kimlik | Gereksinim |
|---|---|
| NFR-01 Performans | Kayıt, uygulamayı kullanıcı tarafından fark edilir şekilde yavaşlatmamalıdır. |
| NFR-02 Bellek | Halka tampon sayesinde bellek kullanımı sınırlı kalmalıdır. |
| NFR-03 Gizlilik | Hiçbir veri makine dışına gönderilmez; kayıt tamponu yalnızca tarayıcıda kalır. |
| NFR-04 Güvenlik | Alıcı yalnızca `127.0.0.1`'e bağlanır; CORS kısıtlıdır. |
| NFR-05 Uyumluluk | Node.js ≥18; Chromium tabanlı tarayıcılar; React 18/19. |
| NFR-06 Platform | Linux, Windows, macOS'ta CI'da derleme, tip denetimi, birim ve e2e testleri. |
| NFR-07 Lisans | MIT. |
| NFR-08 Ajandan bağımsızlık | Yalnızca standart MCP (stdio) kullanılır. |

## 11. Kabul kriterleri (sürüm düzeyi)

- KK-1: Demo uygulamada YAZ10 ve KIS20 hataları için olay oluşturulabilir.
- KK-2: Claude Code ile "Flashback olaylarına bak ve düzelt" komutu, kırmızı→yeşil akışını tamamlar.
- KK-3: Gizleme birim testleri ve e2e testleri üç işletim sisteminde geçer.
- KK-4: `npm run release:check` iki paketi sorunsuz paketler.

## 12. Bilinen sınırlar

- Props/state işaretleme anında canlı uygulamadan okunur; geçmişteki değer değildir.
- Bileşen bilgisi yalnızca React için.
- Canvas, video, çapraz kökenli iframe tekrar oynatılmaz.
- Gizleme bir güvenlik garantisi değildir; üretimde açılmamalıdır.

## 13. Yol haritası

- Her commit'te React state kaydı (geçmişteki gerçek props/state).
- Panelden "Testi çalıştır" düğmesi.
- İşaretlenen anın ekran görüntüsü (çok kipli ajanlar için).
- Vue ve Svelte adaptörleri.

## 14. Açık sorular

1. Bir olayda birden fazla öğe işaretlenebilmeli mi?
2. `fixed` olaylar ne kadar süre saklanmalı?
3. Birden fazla proje aynı makinede aynı anda çalışırsa port çakışması nasıl yönetilecek?
