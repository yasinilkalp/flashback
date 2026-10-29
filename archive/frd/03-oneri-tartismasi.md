# Flashback FRD — Öneri Tartışması ve Puanlama

| Alan | Değer |
|---|---|
| Girdi | `02-PM-inceleme.md` (ÖN-01…ÖN-25) |
| Tartışanlar | **Ajan A — Ürün ve Güven Savunucusu** · **Ajan B — Teslimat ve Mühendislik Şüphecisi** |
| Moderatör | Claude (uzlaşamayan maddelerde karar) |
| Tarih | 27.10.2026 |
| Ham tutanaklar | `_tartisma/03a-ajanA-tur1.md`, `03b-ajanB-tur1.md`, `03c-ajanA-tur2.md`, `03d-ajanB-tur2.md` |

## 1. Yöntem

1. **Tur 1:** İki ajan, birbirini görmeden 25 öneriyi puanladı ve her biri en fazla 3 ek öneri getirdi.
2. **Tur 2:** Her ajan karşı tarafın tutanağını okudu. Arada 1,0 puandan fazla fark olan ya da kararların ayrıştığı maddelerde ya karşı tarafın haklı olduğunu kabul etti ya da gerekçesiyle savundu. Ardından nihai puanını ve v1.0'daki yerini verdi.
3. **Moderasyon:** Uzlaşamayan maddeleri moderatör karara bağladı (bkz. §4). Uzlaşı puanı, iki ajanın Tur 2 bileşik puanlarının ortalamasıdır.

**Puanlama**

- Bileşik puan = 0,4 × Değer + 0,3 × Risk azaltımı + 0,3 × Uygulanabilirlik (her biri 1–10).
- Uygulanabilirlik puanında 10 en ucuz, 1 en pahalı anlamına gelir. Küçük bir ekip (1–3 geliştirici) varsayıldı.

> **Not:** Tur 1'de B, önerileri PM'in yazdığı hâliyle puanladı. A ise kendi daralttığı kapsama göre puanladı. Tur 1'deki farkların bir kısmı bu yöntem farkından geliyor. Tur 2'de iki ajan da nihai (daraltılmış) kapsamı puanladı.

## 2. Sonuç özeti

- **Hiçbir öneri reddedilmedi.** 25 önerinin 22'si **daraltılarak**, 3'ü (ÖN-11, ÖN-17, ÖN-25) **olduğu gibi** kabul edildi. Ajanların getirdiği 6 ek öneri de kabul edildi.
- **Görüşler büyük ölçüde birleşti.** İki ajan arasındaki ortalama puan farkı Tur 1'de **1,20** iken Tur 2'de **0,24**'e indi. Tur 2'de farkı 1,0'ın üstünde kalan tek madde ÖN-02.
- **PM'in önerdiği bazı sayılar ve mekanizmalar keyfi ya da pahalı bulunup değiştirildi:**
  - 500 örneklik gizleme derlemi → yaklaşık 150 örneklik, kürate edilmiş bir fixture seti
  - AST izin listesi → ayrıştırılıp yeniden üretilen ara temsil (IR)
  - 6 durumlu yaşam döngüsü → 4 durum
  - Tam benchmark (20 hata × 3 ajan × 3 tekrar) → mini benchmark
  - Sabit 4.000 token sınırı → ölçümle belirlenecek bütçe
- **Ajanların PM'in kaçırdığı bulduğu kritik açık:** **EK-B1.** Olay verisi (seçici, değer, URL) üretilen spec koduna gömülürse kod enjeksiyonu mümkün oluyor. Bu iki aracı da etkiliyor: `run_repro` çalıştırırken, `get_repro_script` ise üretilen dosya kalıcı test olarak depoya girdiğinde.
- **v1.0 efor tahmini:** Yaklaşık **12 kişi-hafta** (iki ajanın ortak tahmini; EK-B3 spike'ından sonra güncellenecek).

## 3. Puan tablosu (uzlaşı sırasına göre)

| # | Kimlik | Başlık | A-T1 | B-T1 | A-T2 | B-T2 | **Uzlaşı** | Fark T1 → T2 | v1.0 yerleşimi |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| 1 | ÖN-08 | Kırmızı→yeşil kuralının bağlayıcı hale getirilmesi | 9,1 | 7,8 | 9,4 | 8,8 | **9,10** | 1,3 → 0,6 | M 🔒 |
| 2 | ÖN-01 | Tehdit modeli, alıcının sertleştirilmesi | 9,0 | 7,7 | 9,0 | 8,7 | **8,85** | 1,3 → 0,3 | M 🔒 |
| 3 | ÖN-17 | Varsayılanlar ve üretim koruması | 8,7 | 8,0 | 8,7 | 8,7 | **8,70** | 0,7 → 0,0 | M 🔒 |
| 4 | ÖN-04 | Gizlilik iddiasının düzeltilmesi, gönderim önizlemesi | 8,7 | 7,1 | 8,7 | 8,4 | **8,55** | 1,6 → 0,3 | M 🔒 |
| 5 | EK-B1 | Spec üretiminde kod enjeksiyonu (veri ≠ kod) | — | 8,2 | 8,9 | 8,2 | **8,55** | — → 0,7 | M 🔒 |
| 6 | ÖN-05 | Gizleme kapsamı ve ölçülebilir doğruluk | 8,1 | 6,4 | 8,4 | 8,4 | **8,40** | 1,7 → 0,0 | M 🔒 |
| 7 | ÖN-06 | Repro başlangıç durumu ve kimlik doğrulama | 7,8 | 7,2 | 8,4 | 8,1 | **8,25** | 0,6 → 0,3 | M 🔒 |
| 8 | ÖN-02 | `run_repro` assertion'larında keyfi kod çalıştırma | 8,1 | 6,1 | 8,7 | 7,4 | **8,05** | 2,0 → 1,3 | M 🔒 |
| 9 | EK-B2 | v1.0 kesim çizgisi ve efor bütçesi | — | 8,4 | 7,7 | 8,4 | **8,05** | — → 0,7 | M (süreç) |
| 10 | EK-A1 | Assertion'ın geliştiriciye görünmesi ve notla bağı | 8,0 | — | 8,0 | 8,0 | **8,00** | — → 0,0 | M 🔒 |
| 11 | ÖN-25 | Destek matrisi, durum sütunu, kapsam dışı | 7,7 | 7,7 | 7,7 | 7,7 | **7,70** | 0,0 → 0,0 | M |
| 12 | EK-B3 | Kaynak satırı çözümleme spike'ı | — | 7,3 | 8,0 | 7,3 | **7,65** | — → 0,7 | Onaydan önce |
| 13 | ÖN-03 | Prompt injection önlemleri | 8,0 | 6,0 | 7,6 | 7,3 | **7,45** | 2,0 → 0,3 | M 🔒 |
| 14 | EK-A3 | Raporun başında "Kanıt güveni" bloğu | 7,4 | — | 7,4 | 7,4 | **7,40** | — → 0,0 | M |
| 15 | ÖN-16 | Çoklu proje, port, olay klasörü | 7,4 | 5,7 | 7,7 | 7,0 | **7,35** | 1,7 → 0,7 | M |
| 16 | ÖN-11 | Olay şeması, sürümleme, HTTP API | 7,0 | 6,7 | 7,3 | 7,3 | **7,30** | 0,3 → 0,0 | M |
| 17 | ÖN-12 | MCP araç sözleşmeleri | 7,1 | 6,4 | 7,4 | 7,1 | **7,25** | 0,7 → 0,3 | M (+S) |
| 18 | ÖN-13 | Kabul kriterleri, fixture uygulamaları | 7,1 | 5,8 | 7,4 | 7,1 | **7,25** | 1,3 → 0,3 | M (+S) |
| 19 | ÖN-14 | Hata ve uç durum kataloğu | 7,1 | 5,8 | 7,4 | 7,1 | **7,25** | 1,3 → 0,3 | M (+S) |
| 20 | ÖN-15 | Öğesi olmayan hatalar, birincil kanıt | 7,1 | 6,8 | 7,4 | 7,1 | **7,25** | 0,3 → 0,3 | M (+S) |
| 21 | ÖN-21 | Kararsız (flaky) sonuçlar ve yan etkiler | 6,4 | 4,4 | 7,0 | 7,0 | **7,00** | 2,0 → 0,0 | M 🔒 |
| 22 | ÖN-22 | Risk kaydı | 6,9 | 5,9 | 6,9 | 6,9 | **6,90** | 1,0 → 0,0 | M |
| 23 | EK-A2 | Yayın bütünlüğü ve tedarik zinciri | 6,9 | — | 6,9 | 6,9 | **6,90** | — → 0,0 | M |
| 24 | ÖN-10 | Sayısal NFR'ler | 6,7 | 5,4 | 7,0 | 6,7 | **6,85** | 1,3 → 0,3 | M (+S) |
| 25 | ÖN-07 | Gizlenmiş girişler için sentetik değer | 7,0 | 5,7 | 6,6 | 6,6 | **6,60** | 1,3 → 0,0 | M |
| 26 | ÖN-19 | İlk kullanım ve panel deneyimi | 6,1 | 5,1 | 6,4 | 6,4 | **6,40** | 1,0 → 0,0 | M (+S) |
| 27 | ÖN-09 | İzlenebilirlik, metrikler, ölçüm planı | 5,8 | 4,5 | 6,4 | 6,1 | **6,25** | 1,3 → 0,3 | M (+S) |
| 28 | ÖN-20 | `reply_to_incident` iletişim döngüsü | 6,9 | 4,9 | 6,2 | 6,2 | **6,20** | 2,0 → 0,0 | S (XSS kısmı M) |
| 29 | ÖN-24 | Kayıt penceresi ve erken yakalama | 6,0 | 4,7 | 6,3 | 6,0 | **6,15** | 1,3 → 0,3 | M (+S) |
| 30 | ÖN-18 | Gerçekçi kurulum, kontrol komutu | 6,1 | 4,7 | 6,0 | 6,0 | **6,00** | 1,4 → 0,0 | M (+S) |
| 31 | ÖN-23 | Saklama süresi ve disk kotası | 5,9 | 5,2 | 5,9 | 5,9 | **5,90** | 0,7 → 0,0 | M (üst sınır) / S |

**Gösterim:**

- 🔒 **Kilitli M:** Güvenlik ya da kanıt bütünlüğüyle ilgili gereksinim. Efor tavanı aşılsa bile kapsamdan çıkarılmaz (bkz. §4, K-6).
- **"(+S)":** Önerinin bir kısmı M, kalanı S olarak v1.0'a girdi.

## 4. Uzlaşamayan maddeler ve moderatör kararları

| # | Konu | Ajan A | Ajan B | **Moderatör kararı** | Gerekçe |
|---|---|---|---|---|---|
| K-1 | ÖN-02: assertion giriş biçimi | Yapılandırılmış JSON assertion | Ajanın Playwright metni dar bir dilbilgisiyle ara temsile (IR) ayrıştırılsın, kod yalnızca IR'den yeniden üretilsin; IR doğrudan JSON olarak da kabul edilsin | **B'nin önerisi.** Ajan alışık olduğu `expect(...)` biçiminde yazar. Bu metin hiçbir zaman çalıştırılmaz; yalnızca IR'den yeniden üretilen kod çalışır. | İki ajanın ilkesini de koruyor: kullanılabilirlik ve "veri kod değildir". Ek maliyeti yaklaşık 1 gün. |
| K-2 | ÖN-01: özel `X-Flashback-Client` başlığı ve oran sınırı | İkisi de çıkarılsın | Başlık zorunlu olsun, oran sınırı yapılandırılabilir olsun | **Origin başlığı varsa izin listesine karşı denetlenir; yoksa `X-Flashback-Client` başlığı zorunludur.** Oran sınırı S. Boyut ve olay sayısı sınırları M. | Tarayıcı dışı istemcileri (ör. ikinci `flashback-mcp` süreci) ayırt etmenin en ucuz yolu bu başlık. Oran sınırının işini büyük ölçüde olay sayısı sınırı görüyor. |
| K-3 | ÖN-18: `init` mi, `doctor` mı? | `init` S | Kontroller başlangıçta otomatik çalışsın; `flashback-mcp check` S olsun; `init` ertelensin | **B'nin önerisi.** Dokümandaki yapılandırma örnekleri `npx --no-install flashback-mcp` kullanır; böylece sürüm, projenin lock dosyasından gelir. | Sürüm sabitleme ihtiyacını `init` yazmadan karşılıyor. |
| K-4 | ÖN-15: birincil kanıtın elle seçilmesi | M | S (otomatik sıralama yeterli) | **Otomatik sıralama M, elle seçim S.** | Elle seçim arayüz işi gerektiriyor; otomatik sıralama KIS20 senaryosunu zaten karşılıyor. |
| K-5 | `needs_info` durumu | Ayrı bir durum olsun | Durum değil, işaret olsun | **`pendingQuestion: true` işareti.** Durum seti 4 değerde kalır. | Ajan aynı bilgiyi alıyor, ama durum geçiş tablosu ve testler büyümüyor. A da Tur 2'de buna yaklaştı. |
| K-6 | EK-B2: efor tavanını aşınca ne olacak? | Kilitli M'ler takasa girmez; aşım olursa tarih kayar | Tavanı aşan her yeni M bir ertelemeyle dengelenir | **İkisi birden.** Aşımda önce S'ler, sonra kilitsiz M'ler v1.1'e kayar. Tavan yalnızca kilitli M'ler yüzünden aşılırsa tarih kayar. | Güvenlik ve kanıt bütünlüğü takas konusu yapılmaz. |
| K-7 | ÖN-21/08: doğrulanmış kapanış için kaç yeşil koşu? | Aynı imzayla en az 2 geçiş | Ardışık 2 yeşil | **Aynı koşu imzasıyla ardışık 2 yeşil.** Karışık sonuç `fixed_unverified` sayılır. | İki ajan özünde aynı şeyi söylüyor. Olay başına maliyet tek ek koşu. |
| K-8 | ÖN-24: erken yakalama | M (modül yüklenirken yama) | S | **S.** Yama yalnızca üretim dışında kurulur; `enabled=false` ise geri alınır ve tampon silinir. | Değerli ama kanıt bütünlüğünü bozan bir eksik değil. A'nın getirdiği güvenlik şartı korunuyor. |
| K-9 | ÖN-23: saklama süresi ve kotanın önceliği | M, kapalı olaylar 14 gün saklanır | S, kapalı olaylar 30 gün saklanır | **Kota M, süre S.** Kota: 200 olay / 500 MB; dolduğunda yalnızca kapalı olaylar silinir, yine yer açılmazsa yeni olay 507 ile reddedilir. Kapalı olaylar 30 gün saklanır. Açık olaylar hiçbir zaman otomatik silinmez. | Kota, ÖN-01'deki disk doldurma saldırısına karşı güvenlik kontrolü işlevi görüyor; saklama süresi ise yalnızca konfor. |
| K-10 | ÖN-10: tarayıcı desteği | Firefox e2e testi (yalnızca Linux) | Chromium "Doğrulandı", Firefox ve Safari "en iyi çaba" | **B'nin önerisi.** EK-B3 spike'ı Firefox'ta yığın ayrıştırmanın güvenilir çıktığını gösterirse Firefox "Doğrulandı"ya yükseltilir. | Destek iddiası ölçüme dayanmalı. |
| K-11 | ÖN-14: `.md` olarak indirme | M | S | **M.** | Pano API'si güvenli olmayan bağlamlarda (LAN IP üzerinden HTTP) çalışmıyor. O durumda kanıtın kaybolmamasının tek yolu bu ve maliyeti düşük. |

## 5. Nihai FRD'ye etkisi

Kabul edilen her önerinin hangi gereksinimlere dönüştüğü `04-FRD-v1.0.md` dosyasının **Ek B — Öneri → Gereksinim izlenebilirliği** bölümünde listelenmiştir.
