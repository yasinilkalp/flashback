# Rewind FRD paketi

Onay için okunması gereken belge: **`04-FRD-v1.0.md`**. Belge §17'deki kontrol listesi ve imza tablosuyla biter.

## Süreç

| Adım | Dosya | Sonuç |
|---|---|---|
| 1. Taslak | `01-FRD-v0.1-taslak.md` | README ve proje tanımından ilk FRD çıkarıldı. |
| 2. PM incelemesi | `02-PM-inceleme.md` | **39/100** puan. Başlıca bulgular: tehdit modeli yok; kırmızı→yeşil kuralı bağlayıcı değil; repro'da oturum ve başlangıç durumu tanımsız; kabul kriterleri ve NFR'ler ölçülebilir değil; sözleşmeler eksik. **25 öneri** çıktı. |
| 3. İki ajanla tartışma | `03-oneri-tartismasi.md` (ham tutanaklar: `_tartisma/`) | Ajan A (Ürün ve Güven) ile Ajan B (Teslimat ve Mühendislik) önerileri iki turda tartıştı ve puanladı. Ortalama puan farkı 1,20'den 0,24'e indi. Hiçbir öneri reddedilmedi; 22'si daraltılarak kabul edildi. Ajanlar 6 ek öneri getirdi. Uzlaşılamayan konularda 11 moderatör kararı verildi. |
| 4. Nihai belge | `04-FRD-v1.0.md` | 167 gereksinim: 41 kilitli M, 83 M, 34 S, 9 C/v1.1/YH. v1.0 efor tavanı yaklaşık 12 kişi-hafta. |

## Onaydan önce bilinmesi gerekenler

- **"Durum" sütunu README'ye dayanıyor.** Yerel depoda `packages/` ve `examples/` klasörleri yok. Hangi gereksinimin mevcut olduğu kodla karşılaştırılarak doğrulanmalı (AS-9).
- **Next.js desteği EK-B3 spike'ında doğrulandı (27.10.2026).** Next.js App Router'da (Turbopack ve webpack) istemci bileşenleri ilk yüklemede %100 doğru çözüldü; sunucu bileşenleri (RSC) "en iyi çaba" düzeyinde. Spike, React 19'da HMR'den sonra satırın bayatlayabildiğini de gösterdi; bu R12 olarak kayda geçti (`spikes/ek-b3/README.md`).
- **"%60 daha az bağlam" iddiası tek bir demo hatasına dayanıyor (n=1).** Halka açık iddialarda kullanılmadan önce mini benchmark ile doğrulanmalı (KK-11).
- **Efor rakamları tahmin.** Ajanların ortak tahminleridir, ölçüm değildir.
