# Flashback: sadeleştirme

30.10.2026 · Karar verildi, `sade` dalında uygulandı

**Karar:** Öneri, Alternatif B ile kabul edildi: dosya + pano, üstüne iki araçlı mini MCP (`get_report`, `list_reports`). MCP pazarlamada değerli olduğu için kaldı. Diğer üç karar önerildiği gibi: arka planda hafif tampon (konsol, ağ, adım), `sade` dalı, ad Flashback.

**Uygulandı:** 12.900 → ~4.200 satır kaynak (çoğu kaynak satırı çözümleme ve gizleme), 3 → 2 paket (yayımlanmayan `@flashback/shared` kalktı; kullanıcı yalnızca `flashback-devtools` kurar, `flashback-mcp` isteğe bağlı), 8 → 2 MCP aracı, 14 → 2 ortam değişkeni. Kısayol `Alt+Shift+F`. Uçtan uca test: demo → seçim → not → `.flashback/*.md` + pano → `flashback-mcp` (stdio).

Aşağısı karardan önceki öneri metnidir.

## Sorun

Yola çıkış fikri tek cümleydi: **hatayı anlatma, göster.** Bugün ürün bunun çok ötesine geçti.

**Bir hatayı ajana iletmek ~11 adım sürüyor:**
● → "Bu sekme" → Kaydı başlat → hatayı tekrarla → ■ → zaman çizelgesinde geri sar → S → öğeye tıkla → not yaz → Sepete kaydet → Hepsini gönder → (ilk seferde önizleme) → paneldeki istemi ajana yapıştır.

**Kurulum 5 adım:** 3 npm paketi (`flashback-devtools`, `flashback-mcp`, `@playwright/test`), `playwright install chromium`, her ajan için ayrı MCP ayarı (Codex'te Windows yolu, `tool_timeout_sec`…), `<Flashback/>`, Vite eklentisi. Üstüne 4747 portunda sürekli çalışan bir alıcı.

**Boyut:** 12.900 satır kaynak + 7.400 satır test, 3 paket, 8 MCP aracı, 14 ortam değişkeni, 10 prop, 167 maddelik FRD, haftalık ölçüm CI'ı.

**Belirti:** Şu an çalışma ağacındaki iş, alıcı kapalıyken konsolu `ERR_CONNECTION_REFUSED` ile dolduran sağlık yoklamasını susturmak. Yani karmaşıklığın kendisini yönetmeye uğraşıyoruz.

## Geliştirici her gün ne ister?

Hata çoğu zaman **şu an ekranda**. Geliştiricinin ihtiyacı:

1. Ajana "hangi öğe, hangi dosya:satır" bilgisini vermek (ajanın en çok vakit kaybettiği yer).
2. Az önceki konsol hatalarını ve istekleri eklemek.
3. Bir cümle not yazmak.
4. Bunu 10 saniyede, düşünmeden yapmak.

Geri sarma, video, sepet, ajanla panelden yazışma ve kırmızı→yeşil kanıtı güzel ama **günlük değil**. Ajan zaten terminalde konuşuyor, test yazabiliyor, dosya okuyabiliyor.

## Önerilen ürün

> Öğeye tıkla, bir cümle yaz, ajana yapıştır.

**Günlük akış: 3 adım**

1. Kısayol (ya da köşedeki tek düğme) → seçim kipi. Üzerine gelinen öğe çerçevelenir, yanında `Cart.tsx:67 · <CartTotal>` yazar.
2. Öğeye tıkla (ya da `Enter` = sayfa geneli). Küçük bir kutu açılır: "Ne yanlış?" ve altında ekleneceklerin özeti: `3 konsol hatası · 2 başarısız istek · 8 adım`.
3. `Enter`. Rapor hazırlanır, panoya kopyalanır: "Kopyalandı, ajanına yapıştır."

**Rapor nereye gider (ayrı süreç yok):**

- Vite eklentisi varsa dev sunucusu raporu `.flashback/<id>.md` olarak yazar. Panoya kısa bir istem gider: *"`.flashback/fb-….md` dosyasını oku ve düzelt: <not>"*. Ajan dosyayı kendisi okur; MCP gerekmez.
- Eklenti yoksa (Next.js vb.) raporun tamamı panoya Markdown olarak gider.

**Rapor (tek, kısa Markdown):**

- Not
- Öğe: dosya:satır, ±3 satır kod, bileşen yığını, kısaltılmış props ve HTML
- Sayfa URL'si
- Son 60 sn: konsol hataları/uyarıları, başarısız istekler ve son birkaç başarılı istek (gövdeler kısaltılmış), adımlar
- Store değişiklikleri (`trackStore` kullanılıyorsa)
- Gizleme (mevcut kod, görünmez çalışır)

**Arka plan:** Sayfa açıkken bellekte son 60 sn'lik hafif bir tampon: yalnızca konsol, ağ ve adımlar. DOM kaydı (rrweb) ve video yok, yani performans maliyeti yok denecek kadar az. Elle kayıt başlatmaya gerek kalmaz.

**Kurulum: 2 adım**

```bash
npm i -D flashback-devtools
```

`<Flashback />` + `flashbackSource()` Vite eklentisi. Hepsi bu.

**Kalan API:** `<Flashback enabled shortcut redact ignoreUrls />`, `flashback-devtools/vite`, `trackStore` (isteğe bağlı).

## Ne kalıyor, ne çıkıyor

**Kalıyor (mevcut kod yeniden kullanılır):**

- Öğe → dosya:satır: Vite eklentisi, fiber okuma, source map çözümleme (`vite.ts`, `dom/fiber.ts`, `source/`)
- Konsol, ağ ve adım yakalama (`recorder/console.ts`, `network.ts`, `steps.ts`)
- Gizleme (`shared/redact.ts` ve fixture testleri)
- Markdown rapor ve panoya kopyalama (`draft/report.ts`, `deliverFallback`)
- `trackStore`, tr/en arayüz

**Çıkıyor:**

- Kayıt düğmesi, "Kayda başla" penceresi, ekran/mikrofon videosu, anahtar kareler
- rrweb tekrar oynatma, zaman çizelgesi, geri sarma, tekrar oynatmadan canlı öğe eşleme
- Sepet, gruplama, toplu gönderim
- Kayıtlar sekmesi: panelden ajanla yazışma, okunmadı rozetleri, yeniden açma
- `flashback-mcp` paketinin tamamı: HTTP alıcı, port, sağlık yoklaması, yanlış proje uyarısı, hız sınırı, 8 araç, 14 ortam değişkeni
- `run_repro`, assertion dilbilgisi, kırmızı→yeşil kuralı, `mark_fixed` yaşam döngüsü, taşınabilir spec, `storageState`, Playwright/Chromium kurulumu
- Kanıt güveni bölümü, zorunlu önizleme, tema düğmesi (sistem temasını izler), küçültme, `position`, `project`, `maxRecordSeconds`, `maskAllInputs`
- Süreç yükü: haftalık EK-B3 CI'ı, bench, NFR ölçümleri. FRD ve spike'lar `archive/` klasörüne taşınır.

**Tahmini sonuç:** 12.900 → ~3.000 satır kaynak, 3 → 1 paket, kurulum 5 → 2 adım, günlük akış 11 → 3 adım, çalışan süreç 1 → 0.

## Kaybettiklerimiz ve karşılığı

- **"Ajan düzeltmesini kanıtlar" (kırmızı→yeşil):** Ürünün en özgün iddiasıydı ama en ağır parçasıydı ve Playwright kurulumu istiyordu. Rapordaki adımlar, ajanın istenirse kendi Playwright testini yazmasına yeter.
- **Geçici hatalar (bir an görünüp kaybolan):** Geri saramayız. Konsol, ağ ve adım tamponu bunların çoğunu yakalar.
- **MCP ile ajandan bağımsız kanal:** Dosya + pano her ajanla zaten çalışır; MCP ayarı gerektirmez.
- **npm'deki beta.3 kullanıcıları:** Kırıcı değişiklik → `0.2.0`. `flashback-mcp` npm'de "deprecated" işaretlenir.

## Kararlar (önerilen varsayılanlar)

1. **MCP tamamen çıksın mı?** Öneri: evet, dosya + pano. Alternatif: yalnızca `get_latest_report` gibi tek araçlı mini bir MCP kalsın.
2. **Arka planda hafif tampon (konsol/ağ/adım) olsun mu?** 28.10'da sürekli kayıt kaldırılmıştı ama sebep rrweb'in maliyetiydi. Öneri: evet, DOM ve video olmadan.
3. **Nasıl yapılsın?** Öneri: `sade` dalında, mevcut koddan kalan parçalar alınarak; eskisi `v0.1` etiketinde durur.
4. **Ad ve slogan:** "Flashback" kalabilir (son 60 sn rapora gelir). Slogan: *"Hatayı anlatma; göster."*

## Uygulama sırası

1. `sade` dalı. Çalışma ağacındaki sağlık yoklaması işi alıcıyla birlikte gideceği için commit'lenmez.
2. Çekirdek: halka tampon + seçim kipi + not kutusu + Markdown rapor + pano.
3. Vite eklentisine `.flashback/` yazma ucu (dev sunucusunda, aynı köken).
4. Eski parçaları ve testlerini sil; `rrweb` bağımlılığı çıkar.
5. Tek sayfalık README (~80 satır), site güncellemesi.
6. `0.2.0` yayını, `flashback-mcp` deprecate.

**Başarı ölçütü:** Hatayı görmekten ajana yapıştırmaya < 10 sn. Kurulum < 2 dk. Konsola sıfır gürültü. Arka planda çalışan süreç yok.
