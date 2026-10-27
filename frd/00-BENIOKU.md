# Rewind FRD paketi

Güncel belge: **`08-FRD-v1.1.md`**. Belge §17'deki kontrol listesi ve imza tablosuyla biter. `04-FRD-v1.0.md` (v1.0.1) onaya sunulan sürüm olarak kalır.

## Süreç

| Adım | Dosya | Sonuç |
|---|---|---|
| 1. Taslak | `01-FRD-v0.1-taslak.md` | README ve proje tanımından ilk FRD çıkarıldı. |
| 2. PM incelemesi | `02-PM-inceleme.md` | **39/100** puan. Başlıca bulgular: tehdit modeli yok; kırmızı→yeşil kuralı bağlayıcı değil; repro'da oturum ve başlangıç durumu tanımsız; kabul kriterleri ve NFR'ler ölçülebilir değil; sözleşmeler eksik. **25 öneri** çıktı. |
| 3. İki ajanla tartışma | `03-oneri-tartismasi.md` (ham tutanaklar: `_tartisma/`) | Ajan A (Ürün ve Güven) ile Ajan B (Teslimat ve Mühendislik) önerileri iki turda tartıştı ve puanladı. Ortalama puan farkı 1,20'den 0,24'e indi. Hiçbir öneri reddedilmedi; 22'si daraltılarak kabul edildi. Ajanlar 6 ek öneri getirdi. Uzlaşılamayan konularda 11 moderatör kararı verildi. |
| 4. Nihai belge | `04-FRD-v1.0.md` | 167 gereksinim: 41 kilitli M, 83 M, 34 S, 9 C/v1.1/YH. v1.0 efor tavanı yaklaşık 12 kişi-hafta. v1.0.1'de EK-B3 sonuçları işlendi. |
| 5. Uygulama durumu | `05-uygulama-durumu.md` | Kabul kriterleri, alanlara göre durum, FRD'den sapmalar (D-1…D-14), güvenlik incelemesi, sıradaki işler. |
| 6. NFR ölçümleri | `07-nfr-olcumleri.md` | İki tur ölçüm; bellek ve gecikme geçti, performansta 5.000 düğümdeki INP maddesi kaldı. |
| 7. Güncel FRD | `08-FRD-v1.1.md` | Sapmalar, EK-B3 sonuçları, NFR ölçüm profili ve yeni açık sorular (AS-10) işlendi. |

## Onaydan önce bilinmesi gerekenler

- **"Durum" sütunu v1.0'daki hâliyle kaldı.** Kod sıfırdan yazıldı; güncel durum `05-uygulama-durumu.md`'de (AS-9 kapandı).
- **Next.js desteği EK-B3 spike'ında doğrulandı (27.10.2026).** Next.js App Router'da (Turbopack ve webpack) istemci bileşenleri ilk yüklemede %100 doğru çözüldü; sunucu bileşenleri (RSC) "en iyi çaba" düzeyinde. Spike, React 19'da HMR'den sonra satırın bayatlayabildiğini de gösterdi; bu v1.1'de R13 olarak kayda geçti (`spikes/ek-b3/README.md`).
- **"%60 daha az bağlam" iddiası tek bir demo hatasına dayanıyor (n=1).** Halka açık iddialarda kullanılmadan önce mini benchmark ile doğrulanmalı (KK-11).
- **Efor rakamları tahmin.** Ajanların ortak tahminleridir, ölçüm değildir.
