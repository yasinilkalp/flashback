# NFR ölçümleri — NFR-PERF-01, NFR-MEM-01, NFR-LAT-01 (KK-7)

| | |
|---|---|
| Tarih | 27.10.2026 |
| Kapsam | FRD v1.0 §10'da henüz ölçülmemiş üç NFR (KK-7, `05-uygulama-durumu.md`) |
| Düzenek | `scripts/bench/` (`npm run bench`), yöntem ayrıntısı: [`scripts/bench/README.md`](../scripts/bench/README.md) |
| Ham sonuçlar | `scripts/bench/results/{perf,mem,lat}-latest.json` |
| Durum | İki tur ölçüldü. §4'teki düzeltmeler uygulandıktan sonraki ikinci turda **NFR-MEM-01 ve NFR-LAT-01 tüm maddeleriyle geçti** (1x ve 4x). NFR-PERF-01 bağlayıcı profilde (1x, FRD v1.1) yalnızca 5.000 düğümlü sayfadaki INP maddesinde kaldı (§0). |

## 0. Düzeltmelerden sonra yeniden ölçüm (ikinci tur)

İlk turun (§1–§4) ardından §4'teki önerilerin hepsi uygulandı ve aynı düzenekle yeniden ölçüldü. NFR-MEM-01 değişmediği için yeniden ölçülmedi. FRD v1.1 NFR-PERF-01'e ölçüm profilini ekledi: **1x bağlayıcı, 4x bilgi amaçlı**. NFR-LAT-01 her iki profilde de karşılanıyor.

| NFR | Hedef | İlk tur (1x / 4x) | İkinci tur (1x / 4x) | Sonuç (1x / 4x) |
|---|---|---|---|---|
| NFR-PERF-01 | INP p75 artışı ≤ 20 ms (demo) | +24 / +32 ms | **+8 / +8 ms** (24→32, 48→56) | ✅ / ✅ |
| NFR-PERF-01 | INP p75 artışı ≤ 20 ms (5.000 düğüm) | +24 / +184 ms | +32 / +120 ms (264→296, 1352→1472) | ❌ / ❌ (bilgi) |
| NFR-PERF-01 | Checkout dışı > 50 ms long task yok (demo) | 0 / 2 | **0 / 0** | ✅ / ✅ |
| NFR-PERF-01 | Checkout dışı > 50 ms long task yok (5.000 düğüm) | 0 / 7 | 0 / 7 | ✅ / ❌ (bilgi) |
| NFR-PERF-01 | 5.000 düğümde tam anlık görüntü ≤ 100 ms | 62 / 268 ms | **51 / 232 ms** (p95 66 / 273) | ✅ / ❌ (bilgi) |
| NFR-LAT-01 | Panel ≤ 500 ms (demo) | p95 61 / 266 ms | p95 **41 / 106 ms** | ✅ / ✅ |
| NFR-LAT-01 | Panel ≤ 500 ms (5.000 düğüm) | p95 293 / 1.171 ms | p95 **30 / 104 ms** (tekrar oynatma hazır: medyan 136 / 569 ms) | ✅ / ✅ |
| NFR-LAT-01 | Kaydet → onay p95 ≤ 2 sn (demo) | 93 / 343 ms | **69 / 322 ms** | ✅ / ✅ |
| NFR-LAT-01 | Kaydet → onay p95 ≤ 2 sn (5.000 düğüm) | 872 / 3.661 ms | **514 / 1.608 ms** | ✅ / ✅ |
| NFR-LAT-01 | Ajan sorusu ≤ 5 sn | p95 2.773 / 2.791 ms | p95 2.769 / 2.965 ms | ✅ / ✅ |

**Uygulanan düzeltmeler**

| Bölüm | Değişiklik | Etki |
|---|---|---|
| §4.1 | Başlatıcıdaki sonsuz "kayıt" animasyonu kaldırıldı | Demo INP artışı +24/+32 → +8/+8 ms |
| §4.2 | `nthOfType` kardeş gezinmesiyle (tüm çocukları dizmek yerine) | Satır tıklaması başına seçici maliyeti düştü |
| §4.3 | rrweb `checkoutEveryNms` yerine kendi zamanlayıcı + `requestIdleCallback` → `takeFullSnapshot(true)`; boyut tahmini `JSON.stringify` yerine ağaç gezinmesi | Checkout etkileşim içine düşmüyor; 1x 62 → 51 ms |
| §4.4 | Replayer bir kare sonra kuruluyor, `useVirtualDom: false`; panel yükleniyor durumunu gösteriyor; `focus({ preventScroll: true })` | 5.000 düğüm 4x panel p95 1.171 → 104 ms |
| §4.5 | Gönderilen geçmiş `bufferSeconds` ile sınırlı (`trimToHistory`); olaylar bir kez serileştiriliyor; son boyut denetimi olayları yeniden serileştirmiyor (üst sınır + gizleme payı, gerekirse kesin hesap); UTF-8 boyutu uzun metinlerde yerel `TextEncoder`; önizleme tembel (önizlemesiz yolda gövde yeniden ayrıştırılmıyor); gizleyicide ön süzgeç ve kural başına ucuz ön koşul; `withoutOwnUi` değişmeyen alt ağaçları kopyalamıyor | 5.000 düğüm 4x kaydet → onay p95 3.661 → 1.608 ms |
| §4.5 | **POST gövdesi `Blob`** (düz metin yerine) | Aşağıdaki deney: en büyük tek kazanç |

**Gövde türü deneyi.** Aynı 3,8 MB'lık gerçek yük (5.000 düğüm), yerel bir sunucuya `fetch` ile 3'er kez gönderildi. Değerler hazırlık + `fetch`'in tamamlanma süresidir (ms).

| Gövde | 1x | 4x |
|---|---|---|
| Düz metin (`string`) | 0 + 229–255 | 0 + 929–1.106 |
| `Uint8Array` (`TextEncoder`) | 21–26 + 244–274 | 60–107 + 870–1.034 |
| **`Blob`** | 21–32 + 17–77 | **84–117 + 21–66** |
| gzip (`CompressionStream`) | 62–71 + 26–32 | 246–270 + 99–104 |

Chromium düz metin ve dizi gövdeyi sayfa iş parçacığında kopyalıyor. Bu iş CPU kısmasıyla birlikte yavaşlıyor. `Blob` gövde ise tarayıcı sürecine tek seferde devrediliyor. gzip aktarılan baytı ~11 kat küçültüyor ancak sıkıştırmanın maliyeti kazancı yiyor; alıcıda da ek kod gerektireceği için uygulanmadı.

**Kalanlar (yalnızca 5.000 düğüm)**

- **INP +32 ms (1x).** Etkileşimlerin p75 gecikmesi değişmiyor (0 ms). INP'yi belirleyen etkileşim, uygulamanın binlerce `hidden` özniteliğini değiştiren filtre işlemi. Bu etkileşimin ek maliyeti rrweb'in mutasyon gözlemcisinden geliyor (öznitelik başına kayıt). Rewind tarafında olası azaltma: rrweb'in `blockSelector` seçeneğini bir prop olarak açıp büyük listeleri kayıttan çıkarmak. Bu kanıt kaybı demek. Bu yüzden yapılmadı, v1.1 sonrasına aday. Öneri: sürüm notunda "çok büyük DOM'larda toplu öznitelik değişiklikleri INP'ye ~30 ms ekleyebilir" uyarısı.
- **4x maddeleri** (checkout 232 ms, 7 long task, INP +120 ms) FRD v1.1'e göre bilgi amaçlıdır. rrweb'in tam görüntü serileştirmesi 4x'te tek başına ~200 ms sürüyor.

Ham sonuçlar: `scripts/bench/results/perf-latest.json` ve `lat-latest.json` (5.000 düğüm ve demo koşularının birleşimi). İlk turun ham dosyaları yerelde kaldı. `node scripts/bench/report.mjs` bu tabloyu yeniden üretir.

## 1. İlk tur özeti (düzeltmelerden önce)

"1x" kısmasız, "4x" Chromium CPU kısma (`Emulation.setCPUThrottlingRate: 4`, orta seviye dizüstü profili). "Demo" `examples/demo`, "5.000 düğüm" `scripts/bench/fixture` (5.000 `<li>`; rrweb'de 10.039 düğüm).

| NFR | Hedef | Ölçülen (1x / 4x) | Sonuç (1x / 4x) | Not |
|---|---|---|---|---|
| NFR-PERF-01 | INP p75 artışı ≤ 20 ms (demo) | +24 ms (24→48) / +32 ms (72→104) | ❌ / ❌ | Etkileşim başına ortalama +4,6 / +15,5 ms. Ana neden başlatıcı düğmesindeki sonsuz animasyon (§4.1). |
| NFR-PERF-01 | INP p75 artışı ≤ 20 ms (5.000 düğüm) | +24 ms (256→280) / +184 ms (1296→1480) | ❌ / ❌ | INP'yi uygulamanın kendi filtre etkileşimi (binlerce `hidden` değişimi) belirliyor. Checkout'lu etkileşimler hariç tutulunca 4x'te artış +112 ms. |
| NFR-PERF-01 | Checkout dışında kayıttan kaynaklanan > 50 ms long task yok (demo) | 0 / 2 | ✅ / ❌ | 4x: boştayken 1 adet (54 ms) ve 1 sayfa geçişi etkileşimi. |
| NFR-PERF-01 | Checkout dışında kayıttan kaynaklanan > 50 ms long task yok (5.000 düğüm) | 0 / 7 | ✅ / ❌ | 4x: 7 satır seçme etkileşimi kapalıyken < 50 ms, açıkken > 50 ms. Koşu başına long task medyanı 47'ye karşı 37. |
| NFR-PERF-01 | 5.000 düğümde tam anlık görüntü ≤ 100 ms | medyan 62 ms (p95 71) / medyan 268 ms (p95 342) | ✅ / ❌ | Sürenin ~%75'i rrweb'in serileştirmesi. Rewind'in boyut tahmini (`JSON.stringify`) ~%15 ekliyor (§4.3). |
| NFR-MEM-01 | Tampon ≤ 50 MB ve sınırlı (180 sn, varsayılan ayarlar) | demo 4,9 MB · liste 15,8 MB · stres 22,5 MB (en çok, açık − kapalı) | ✅ | 90. saniyeden sonra büyüme yok (+0,1 / +0,2 / −1,2 MB). Bellek uyarısı tetiklenmedi. |
| NFR-LAT-01 | Panel ≤ 500 ms'de açılır (demo, dolu tampon) | medyan 24 / p95 61 ms · medyan 146 / p95 266 ms | ✅ / ✅ | |
| NFR-LAT-01 | Panel ≤ 500 ms'de açılır (5.000 düğüm, dolu tampon) | medyan 256 / p95 293 ms · medyan 938 / p95 1.171 ms | ✅ / ❌ | Panel, tekrar oynatma kurulana kadar ekrana gelmiyor. Bu kurulumun büyük kısmı rrweb'in sanal DOM'u (§4.4). |
| NFR-LAT-01 | Kaydet → alıcı onayı p95 ≤ 2 sn (demo) | p95 93 ms / p95 343 ms | ✅ / ✅ | |
| NFR-LAT-01 | Kaydet → alıcı onayı p95 ≤ 2 sn (5.000 düğüm) | p95 872 ms / p95 3.661 ms | ✅ / ❌ | Yük birkaç kez baştan serileştiriliyor ve tüm rrweb olayları derinlemesine gizleniyor (§4.5). |
| NFR-LAT-01 | Ajanın sorusu panelde ≤ 5 sn | p95 2.773 / en çok 2.773 ms · p95 2.791 / en çok 2.791 ms | ✅ / ✅ | 3 sn'lik yoklama aralığı belirliyor (medyan 1,7–1,8 sn) |

**Karar önerisi**

- **KK-7:** M kesimindeki NFR-MEM-01 eşiğin içinde. S kesimindeki NFR-PERF-01 ve NFR-LAT-01'in sonuçları bu belgeyle sürüm notuna girebilir.
- **AS-2 (tampon belleği):** 3 dilimli tampon varsayılan ayarlarda en kötü stres senaryosunda bile 50 MB'ın çok altında kaldı (toplam ek yük ≤ 22,5 MB). Ürün metni **"son 60 saniye" olarak kalabilir**. "30–60 sn" düzeltmesine gerek yok.
- **NFR-PERF-01, INP:** Kaçırılan hedefin büyük kısmı ucuz bir arayüz düzeltmesiyle kapanıyor: başlatıcıdaki sonsuz animasyon (§4.1). Bu düzeltme demo'da 1x'te artışın tamamını, 4x'te ~%60'ını geri alıyor.
- **5.000 düğüm, 4x hedefleri** (checkout ≤ 100 ms, panel ≤ 500 ms, kaydet ≤ 2 sn): §4.3–4.5'teki değişiklikler yapılmadan karşılanmıyor.
  - Checkout: rrweb'in tam görüntüsü 4x'te tek başına ~200 ms sürdüğü için yalnızca Rewind tarafındaki iyileştirmeyle 100 ms'ye inmiyor.
  - Öneri: NFR-PERF-01'deki 100 ms eşiğinin **1x referans profiline** bağlı olduğu FRD'ye yazılsın, 4x için ayrı bir bilgi değeri verilsin. Ayrıca checkout etkileşimlerin dışına taşınsın (§4.3).

## 2. Yöntem (özet)

Tüm ölçümler headless Chromium 153'te ve React 19 geliştirme kipinde yapıldı. Rewind yalnızca geliştirme ortamında çalıştığı için gerçek kullanım koşulu budur. Kayıt kapalıyken `rewind-devtools`, `dist/noop.js`'e yönlendirilir; bu, üretimdeki durumun aynısıdır, yani kaydedici hiç yüklenmez. Alıcı olarak gerçek `rewind-mcp` (`packages/mcp/dist/cli.js`, stdio + HTTP) kullanıldı. Kayıt açıkken panel alıcıyı 3 sn'de bir yokladı.

- **NFR-PERF-01**
  - Her sayfa × kısma için kayıt açık ve kapalı **5'er koşu**, sıra her koşuda değişti. Her koşuda 50 belirlenimci etkileşim 700 ms tempoda yapıldı (koşu ≈ 35 sn).
  - Böylece her kayıt açık koşu `bufferSeconds/2 = 30 sn`'de gelen bir **doğal checkout** içerdi (koşu başına medyan 1).
  - Etkileşim gecikmesi Event Timing'den alındı (`interactionId`, 16 ms eşiği). INP, web-vitals tanımıyla hesaplandı (her 50 etkileşimde en kötü 1 tanesi atlanır). **INP p75** = 5 koşunun INP değerlerinin 75. yüzdeliği.
  - Long task'lar checkout yoklayıcısıyla ayrıldı: `record.mirror.getMeta(document)` nesne kimliği 50 ms'de bir kontrol edildi.
  - "Kayıttan kaynaklanan" iki grupta sayıldı: (a) kayıt açıkken etkileşim dışında görülen long task'lar; (b) etkileşim sırası bazında, açık koşuların çoğunluğunda olup kapalıların çoğunluğunda olmayanlar.
  - Checkout süresi, canlı kayıtta `record.takeFullSnapshot(true)` ile koşu başına 3 kez ölçüldü (toplam 15 örnek). Bu süreye Rewind'in emit → halka tampon → boyut tahmini yolu dahildir.
- **NFR-MEM-01**
  - Varsayılan ayarlarla **gerçek 180 sn** ölçüldü (zaman sıkıştırma yok).
  - Kayıt açık ve kapalı oturumlar aynı anda, ayrı Chromium süreçlerinde, ~700 ms tempoda sürekli etkileşimle çalıştı.
  - 10 sn'de bir iki kez `HeapProfiler.collectGarbage` → `Runtime.getHeapUsage` alındı.
  - Fark (açık − kapalı), Rewind'in **toplam** JS heap ek yüküdür: rrweb kodu, mirror, tampon, ağ/konsol/adım kayıtları ve panel kökü. Tampon bu farkın içinde olduğundan fark tampon için bir üst sınırdır.
  - Senaryolar: demo, 5.000 düğüm ve stres (5.000 düğüm + 100 ms'de bir 50 satır güncellemesi ≈ 500 metin mutasyonu/sn + etkileşim).
- **NFR-LAT-01**
  - Tampon önce 65 sn etkileşimle dolduruldu. Ardından 8 döngü yapıldı: 5 sn etkileşim → `Alt+Shift+R` → sayfa düzeyi olay → beklenen davranış → Kaydet → onay → kapat.
  - **Panel açılışı:** keydown zaman damgasından, panelin görünür olduğu kareden sonraki ilk rAF'e kadar.
  - **Kaydet → onay:** Kaydet tıklamasından `incident-id`'nin DOM'a girmesine kadar. Önizlemesiz yolda 7 örnek alındı; oturumdaki ilk gönderimin önizlemeli yolu ayrıca ölçüldü.
  - **Ajan sorusu:** Panel Kayıtlar sekmesindeyken 10 örnek alındı. Her örnekte 0–3 sn rastgele beklendi, ardından MCP `reply_to_incident` çağrıldı ve mesajın panel DOM'una girdiği an ölçüldü.

İstatistik: yüzdelikler en yakın sıra yöntemiyle hesaplandı. Küçük örneklemde p95 ≈ en büyük değerdir (muhafazakâr).

**Ortam**

- CPU: Intel Xeon @ 2,10 GHz × 2 (sanal makine), 7,8 GB RAM, Linux 6.18 (x64)
- Node v22.23.4, Chromium 153.0.8010.12 (headless), Playwright 1.63.0, rrweb 2.2.0
- rewind-devtools 0.1.0, git `05218f8` + çalışma ağacı

## 3. Ayrıntılı sonuçlar

### 3.1 NFR-PERF-01 — etkileşim gecikmesi

| Sayfa · kısma | INP p75 kapalı → açık | Checkout'lu etkileşimler hariç INP p75 (açık) | Etkileşim gecikmesi p75 kapalı → açık | Ortalama kapalı → açık |
|---|---|---|---|---|
| demo · 1x | 24 → 48 ms | 48 ms | 16 → 24 ms | 16,7 → 21,3 ms |
| demo · 4x | 72 → 104 ms | 104 ms | 32 → 48 ms | 25,9 → 41,4 ms |
| 5.000 düğüm · 1x | 256 → 280 ms | 280 ms | 24 → 48 ms | 57,9 → 79,8 ms |
| 5.000 düğüm · 4x | 1.296 → 1.480 ms | 1.408 ms | 112 → 128 ms | 283,4 → 334,1 ms |

Eylem türüne göre etkileşim gecikmesi p75 (kapalı → açık):

| Eylem | demo 1x | demo 4x | 5.000 düğüm 1x | 5.000 düğüm 4x |
|---|---|---|---|---|
| tıklama (sepete ekle / satır seç) | 16 → 32 | 32 → 56 | 24 → 40 | 80 → 112 |
| tuş / odak | 16 → 24 | 24 → 40 | 16 → 32 | 24 → 40 |
| 100 satır güncelle | — | — | 24 → 32 | 104 → 120 |
| filtre (binlerce `hidden`) | — | — | 248 → 280 | 1.256 → 1.376 |
| sayfa geçişi / fetch | 24 → 32 | 56 → 88 | — | — |

Doğal checkout'un denk geldiği etkileşimler:

- Demo: 1x'te 16–40 ms, 4x'te 48–72 ms.
- 5.000 düğüm, 1x: 80–104 ms.
- 5.000 düğüm, 4x: 1.040–1.760 ms. Checkout çoğu koşuda filtre etkileşiminin içine düştü.
  - rrweb checkout'u süre dolduktan sonraki **ilk kayıt olayında** alır (`record()` içindeki `checkoutEveryNms`). Bu olay çoğu zaman bir etkileşimdir.

### 3.2 NFR-PERF-01 — long task ve checkout

| Sayfa · kısma | Checkout dışı long task/koşu (medyan) kapalı → açık | En uzun kapalı → açık | Kayıttan kaynaklanan |
|---|---|---|---|
| demo · 1x | 0 → 0 | — | 0 |
| demo · 4x | 2 → 4 | 90 → 95 ms | 2 (1 boşta 54 ms, 1 sayfa geçişi) |
| 5.000 düğüm · 1x | 10 → 10 | 411 → 589 ms | 0 |
| 5.000 düğüm · 4x | 37 → 47 | 1.283 → 1.449 ms | 7 (satır seçme) |

Checkout süresi (`takeFullSnapshot`, 15 örnek):

- Demo (105 düğüm): medyan 2,6 ms (1x) / 12,8 ms (4x).
- 5.000 düğüm (10.039 rrweb düğümü, tam görüntü ≈ 1,4 MB UTF-16):
  - 1x: medyan **62 ms**, p95 71 ms
  - 4x: medyan **268 ms**, p95 342 ms

Maliyet dökümü (5.000 düğüm, 7 örnek medyanı, `perf.mjs` inceleme adımı):

| Parça | 1x | 4x |
|---|---|---|
| rrweb-snapshot `snapshot()`, Rewind seçenekleriyle | 42,7 ms | 204,6 ms |
| aynısı, seçicisiz (`blockSelector`/`maskTextSelector` yok) | 37,7 ms | 197,8 ms |
| tam görüntünün `JSON.stringify`'ı (Rewind `estimateEventBytes`) | 10,5 ms | 43,4 ms |
| canlı checkout (hepsi + emit + mutasyon arabelleği) | 67,9 ms | 282,7 ms |

Bu tabloya göre:

- Rewind'in seçicileri küçük bir maliyet ekliyor (%3–13).
- Boyut tahmini toplamın ~%15'i.
- Geri kalan maliyet rrweb serileştirmesi.

Uzun oturumda (NFR-MEM-01, 180 sn, 1x, iki oturum aynı anda çalıştığı için CPU paylaşımlı) 5 doğal checkout'un long task medyanı şöyleydi:

- 5.000 düğüm: 102 ms (en çok 272 ms)
- Stres: 97 ms (en çok 483 ms)

### 3.3 NFR-MEM-01

Fark (açık − kapalı JS heap, GC sonrası, MB):

| t (sn) | 0 | 30 | 60 | 90 | 120 | 150 | 180 |
|---|---|---|---|---|---|---|---|
| demo | 3,9 | 4,3 | 4,5 | 4,7 | 4,8 | 4,8 | 4,9 |
| 5.000 düğüm | 7,2 | 8,8 | 12,2 | 15,7 | 15,7 | 15,6 | 15,8 |
| stres | 7,1 | 11,6 | 16,2 | 22,5 | 18,2 | 17,2 | 17,0 |

- Fark ilk 90 sn'de, yani 3 dilim dolana kadar büyüyor, sonra sabitleniyor. Stres senaryosunda dilim atıldıkça biraz düşüyor.
- **Halka tampon sınırlı.** 50 MB sınırına (`MEMORY_LIMIT_BYTES`) hiç yaklaşılmadı. Paneldeki bellek uyarısı tetiklenmedi.
- Kayıt kapalıyken heap: demo 6,4 MB, liste 21,0 MB. Kayıt açıkken: 11,3 MB ve 36,8 MB.

### 3.4 NFR-LAT-01

| Sayfa · kısma | Panel açılışı medyan / p95 | Kaydet → onay medyan / p95 (n=7) | İlk gönderim: kaydet → önizleme · gönder → onay |
|---|---|---|---|
| demo · 1x | 24 / 61 ms | 70 / 93 ms | 90 · 63 ms |
| demo · 4x | 146 / 266 ms | 268 / 343 ms | 290 · 140 ms |
| 5.000 düğüm · 1x | 256 / 293 ms | 801 / 872 ms | 472 · 290 ms |
| 5.000 düğüm · 4x | 938 / 1.171 ms | 3.181 / 3.661 ms | 2.182 · 1.484 ms |

- Panelin görünür olduğu an ile tekrar oynatmanın hazır olduğu an her örnekte aynı kareydi. Panel, Replayer kurulup tamponun sonuna sarılana kadar ekrana çizilmiyor (§4.4).
- Ajan sorusu → panel (demo, 10'ar örnek):
  - 1x: medyan 1.680 ms, en az 833, en çok 2.773 ms
  - 4x: medyan 1.835 ms, en az 757, en çok 2.791 ms
  - Panelin 3 sn'lik yoklama aralığıyla tutarlı. Hedefe ≥ 2,2 sn pay kalıyor.

## 4. Nedenler ve iyileştirme önerileri

Kaynak dosyaları değiştirilmedi. Nedenler iki yolla bulundu:

- `scripts/bench/investigate.mjs` deneyleri (ayrıştırma ve Replayer).
- `scripts/bench/profile.mjs` CDP örnekleyici profilleri.

Satır numaraları ölçüm günündeki çalışma ağacına göredir.

### 4.1 Başlatıcıdaki sonsuz "kayıt" animasyonu → INP artışının ana nedeni

`packages/rewind/src/ui/styles.ts:35–36`:

```css
.rw-dot.rw-rec { animation: rw-pulse 1.6s infinite; }
@keyframes rw-pulse { 50% { opacity: .35; } }
```

Kanıt: demo'da ayrıştırma (`investigate.mjs ablate`). 1x: 3 koşu × 50 etkileşim, 700 ms tempo. 4x: 4 koşu × 40 etkileşim, 350 ms tempo. Aynı Rewind'de yalnızca bu animasyon sayfa içinden kapatıldı.

| Değişken | 1x ort. (3 koşu) | 1x p75 | 4x ort. (4 koşu, 350 ms tempo) | 4x p75 |
|---|---|---|---|---|
| kayıt kapalı | 16,4 ms | 16 | 20,9 ms | 24 |
| yalnızca rrweb (Rewind'in seçenekleriyle) | 16,2 ms | 16 | 22,6 ms | 24 |
| tam Rewind | 19,7 ms | 24 | 30,8 ms | 40 |
| tam Rewind, animasyon kapalı | **16,6 ms** | **16** | **24,9 ms** | **32** |

Aynı deney 5.000 düğümde, 4x (3 koşu × 50 etkileşim, 700 ms tempo):

| Değişken | ortalama | medyan | p75 | INP p75 |
|---|---|---|---|---|
| kayıt kapalı | 268,6 ms | 80 | 104 | 1.256 |
| yalnızca rrweb | 286,9 ms | 80 | 96 | 1.344 |
| tam Rewind | 312,2 ms | 104 | 128 | 1.392 |
| tam Rewind, animasyon kapalı | 297,5 ms | 96 | 120 | 1.368 |

Sonuç:

- rrweb çekirdeğinin demo'daki etkileşim başına maliyeti küçük: 1x'te ölçülemiyor, 4x'te ~2 ms.
- Büyük listede ek yük üç parçaya ayrılıyor:
  - rrweb: +18 ms ortalama. Ağırlıklı olarak filtrenin binlerce öznitelik mutasyonunu işliyor.
  - Rewind'in animasyon dışı eklentileri: +11 ms ortalama, medyanda +16 ms. Aday nedenler §4.2'deki seçici üretimi ve §4.3'teki olay başına `JSON.stringify`.
  - Animasyon: +15 ms ortalama.
- Rewind'in ek yükünün çoğu bu animasyondan geliyor: 1x'te tamamı, 4x'te ~%60'ı.
- Sürekli animasyon her karede çizim istiyor ve etkileşimin bir sonraki boyamasını geciktiriyor.

Öneri:

- Nabız animasyonunu kaldırın (sabit kırmızı nokta). Ya da birkaç döngüden sonra durdurun ve `prefers-reduced-motion`'a uyun.
- En azından kompozitörde çalışacak biçimde ayrı katmana alın (`will-change: opacity`).
- Bu davranış yazılımla kompozit yapan headless Chromium'da ölçüldü. GPU'lu gerçek Chrome'da etkisi daha küçük olabilir. Düzeltme sonrası `investigate.mjs ablate` ile yeniden ölçün.

### 4.2 Tıklama yolunda eşzamanlı seçici üretimi (büyük listelerde)

`packages/rewind/src/recorder/steps.ts:109–119`, her tıklamada `buildSelectors` çağırıyor. `packages/rewind/src/dom/selector.ts:137–138` iki yapısal yol üretiyor: `structuralPath(el, doc, true/false)`. Her düzeyde `nthOfType` (`selector.ts:89`) şunu yapıyor:

```ts
Array.from(parent.children).filter(...)
```

- 5.000 kardeşli listede bu, tıklama başına iki kez 5.000 elemanlı dizi kurmak demek. Buna ek olarak birden çok `querySelectorAll` çalışıyor.
- Profilde (5.000 düğüm, 4x, 21 sn) `nthOfType` öz süresi 98 ms. Bu, satır tıklaması başına ≈ 6 ms ve 4x'te satır seçmelerin 50 ms eşiğini aşmasına katkı veriyor (§3.2, 7 etkileşim).

Öneri:

- `nthOfType` içinde `previousElementSibling` ile sayın (dizi kurmadan).
- `absolutePath`'i yalnızca gerektiğinde üretin.
- Seçici hesabını olay işleyicisinden çıkarın: öğe referansını ve zamanı saklayın, seçiciyi `requestIdleCallback`/`scheduler.postTask({priority:'background'})` ile ya da en geç `freeze()` anında üretin.
- Bunlar yapılınca 5.000 düğüm 4x için `investigate.mjs ablate --page=list --throttle=4` ile yeniden ölçün.

### 4.3 Checkout: etkileşimin içine düşüyor; boyut tahmini her olayda tam `JSON.stringify`

Etkileşimin içine düşmesi:

- `packages/rewind/src/recorder/recorder.ts:71`, `checkoutEveryNms: bufferSeconds*1000/2` kullanıyor. rrweb tam görüntüyü süre dolduktan sonraki ilk kayıt olayının işleyicisinde, eşzamanlı alıyor.
- Sonuç: 4x'te 5.000 düğümde ~270 ms'lik iş bir kullanıcı etkileşiminin içine biniyor (§3.1: checkout'lu etkileşimler 1,0–1,8 sn).

Boyut tahmini:

- `packages/rewind/src/recorder/ring.ts:18–21` (`estimateEventBytes`) her olayı `JSON.stringify` ediyor. Tam görüntüde bu ~1,4 MB'lık bir metin üretmek demek: 1x'te 10 ms, 4x'te 43 ms.

Öneriler:

1. `checkoutEveryNms`'i kaldırın; checkout'u Rewind yönetsin.
   - Süre dolunca `requestIdleCallback(() => record.takeFullSnapshot(true), { timeout: 5000 })` çağırın. Böylece checkout etkileşim dışında, boşta alınır.
   - Tamponun "≥ bufferSeconds" garantisi için zaman aşımı yeterli.
   - Bu değişiklik süreyi kısaltmaz, ama INP'den ve "etkileşim içi long task"tan çıkarır.
2. Tam görüntünün boyutunu `JSON.stringify` etmeden tahmin edin: düğüm sayısı × ortalama bayt ya da serileştirilmiş ağaçta tek geçişli sayaç. Artımlı olaylarda tahmin olduğu gibi kalabilir. Kazanç: checkout'un ~%15'i.
3. Seçenek: dilim aralığını `bufferSeconds/2` yerine `bufferSeconds` yapıp 2 dilim tutun.
   - Checkout sıklığı yarıya iner. Pencere [B, 2B] olur.
   - Bellek ek yükü artar, ama ölçülen 22,5 MB'lık stres değerine göre sınırın altında kalması beklenir.
4. 100 ms eşiği: rrweb `snapshot()` 4x'te tek başına ~200 ms sürüyor. Bu yüzden 4x için eşik Rewind tarafında karşılanamaz. FRD NFR-PERF-01'e ölçüm profili (1x referans, 4x bilgi amaçlı) yazılmalı.

### 4.4 Panel açılışı: Replayer eşzamanlı kuruluyor; rrweb sanal DOM'u büyük DOM'da pahalı

Mevcut akış:

- `packages/rewind/src/ui/Timeline.tsx:267`, `new Replayer(events, {...})` ve `r.pause(total)` çağrılarını bir `useEffect` içinde yapıyor.
- Kısayol ayrık (discrete) bir olay olduğu için React efektleri aynı görevde çalıştırıyor. Bu yüzden panel, son dilim yeniden kurulup sona sarılmadan çizilmiyor (§3.4).
- rrweb'in hızlı ileri sarma yolu varsayılan `useVirtualDom: true` ile çalışıyor. İlk eşzamanlı mutasyonda iframe'deki **tüm** DOM'u sanal DOM'a kopyalıyor, sonra geri diff'liyor.
- Profilde (5.000 düğüm, 4x) rrweb `buildFromNode` 580 ms öz süre aldı.

Deney (`investigate.mjs replay`, 5.000 düğüm, 4x, ~25 sn'lik dilim, Timeline.tsx'teki seçeneklerle, 6'şar örnek):

| Replayer | sona sarma medyanı |
|---|---|
| `useVirtualDom: true` (bugünkü) | **587 ms** |
| `useVirtualDom: false` | **144 ms** |

Öneriler:

1. `Timeline.tsx:267`'deki seçeneklere `useVirtualDom: false` ekleyin (4x'te ~4 kat hızlanma).
   - Geri sarmada büyük mutasyon yığınlarıyla doğruluğu `panel.e2e` testleriyle denetleyin.
2. Panel iskeletini önce çizin. Replayer'ı bir sonraki karede kurun (`requestAnimationFrame` → `setTimeout`) ve bu sürede yükleniyor göstergesi gösterin. Böylece "panel görünür" süresi tampon boyutundan bağımsızlaşır.
3. `Shell.tsx:79`'daki `focus()` ve iframe yerleşimi de bu karede çalışıyor. Profilde 4x'te ~70 ms'lik `focus` görüldü. `focus({ preventScroll: true })` kullanılabilir.

### 4.5 Kaydet → onay: yük defalarca baştan serileştiriliyor

5.000 düğümde 4x profilin (kaydet → onay arası) dağılımı şöyle:

- Rewind toplamı: 1,45 sn.
- Yerel `TextEncoder.encode`: 282 ms.
- `fetch`: 467 ms (çok MB'lık gövdenin gönderimi).

Sıcak noktalar:

- `packages/rewind/src/draft/build.ts:107` — `byteLength = new TextEncoder().encode(s).length`. Çok MB'lık metinleri yalnızca bayt saymak için kopyalıyor. `report.ts:60` da aynısını yapıyor.
- `build.ts:113–124` `fitEvents`: her döngüde tüm olay dizisini `JSON.stringify` ediyor.
- `build.ts:126–139` `fitBodies`: tüm taslağı yeniden `JSON.stringify` ediyor.
- `build.ts:287`: bütçe için bir kez daha `JSON.stringify` yapılıyor.
- `report.ts:182–184` `prepareSubmission`: bir kez daha `JSON.stringify`, ardından `previewFromBody` içinde tüm gövdeyi `JSON.parse`.
- `draft/events.ts:24` (`withoutOwnUi`) ve `:56` (`redactEvents`): 3 tam görüntü × 10.000 düğümün her metnini ve özniteliğini kopyalayıp gizliyor. Profilde `strip`, `value`, `text`, `redactNode` ve `redactAttributes` toplamı ≈ 0,6 sn.

Öneriler:

1. Gövdeyi **bir kez** serileştirin. Bütçe hesabında halka tamponun zaten tuttuğu dilim boyutlarını (`ring.ts` `Slice.bytes`) kullanın.
2. Bayt uzunluğu için ayırmasız bir UTF-8 sayacı kullanın (döngüyle kod birimi sayımı), ya da tek bir `TextEncoder.encodeInto` arabelleği.
3. Olayları gizlemeden önce gerekmeyen en eski dilimi atın: işaretlenen anın `bufferSeconds` öncesini kapsayan ilk tam görüntüden öncesini. Gizleme maliyeti dilim sayısıyla orantılı.
4. Uzun adımlar arasında ana iş parçacığına yol verin (`await scheduler.yield?.()` ya da `setTimeout(0)`). Panel bu sırada yanıt verir. İsteğe bağlı olarak serileştirme ve gizlemeyi bir Worker'a taşıyın.

### 4.6 Düşük öncelik: denetleyici her saniye ve her yoklamada yeniden çiziyor

`packages/rewind/src/controller.ts:119` (`set`) her çağrıda yeni durum nesnesi üretip dinleyicileri bilgilendiriyor:

- 1 sn'lik zamanlayıcı (`:129–131`) panel kapalıyken bile başlatıcıyı yeniden çizdiriyor.
- 3 sn'lik yoklama (`:127`) değişiklik olmasa da `incidents` dizisini değiştiriyor.

Ayrıştırma bunun ölçülebilir bir payı olmadığını gösterdi. Yine de değişmeyen alanlarda bildirimi atlamak (sığ karşılaştırma) ucuz bir iyileştirme.

## 5. Uyarılar ve sınırlar

- **Ortam:** 2 çekirdekli sanal makine, headless Chromium (yazılımla kompozit, GPU yok). Mutlak süreler gerçek dizüstünden farklıdır. Kayıt açık/kapalı farkları aynı koşullarda alındığı için karşılaştırılabilir. 4x kısma yalnızca sayfa sürecini yavaşlatır; alıcı, Vite ve Node etkilenmez.
- **Geliştirme kipi:** React 19 geliştirme kipi öğe başına ek maliyet getirir (owner stack). 5.000 düğümlü listede uygulamanın kendi filtre etkileşimi kayıt kapalıyken bile 1x'te ~250 ms, 4x'te ~1,3 sn sürer. Bu nedenle bu sayfada INP'yi uygulama belirliyor.
- **Event Timing:** süreler 8 ms'ye yuvarlanır. 16 ms altındaki etkileşimler 16 ms sayıldı (iki kipte de aynı şekilde).
- **İstatistik:** INP p75 5 koşudan hesaplandı ve koşular arası oynaklık ±8–24 ms. Demo'daki +24/+32 ms'lik artış ayrıştırma deneyiyle de doğrulandı (§4.1).
- **Bellek:** fark, Rewind'in toplam ek yüküdür (tampon için üst sınır). Tamponun kendi payı ayrıca ölçülmedi. Açık ve kapalı oturumlar aynı anda çalıştığı için etkinlik hızı CPU paylaşımından etkilenebilir; heap ölçümü süreç başınadır.
- **Eşzamanlı geliştirme:** `packages/rewind/dist`, ölçüm sırasında (09:27 UTC) başka bir çalışma tarafından yeniden derlendi.
  - Değişiklik yalnızca kaynak çözümleme ve taslak kodundaydı: `controller.ts`, `draft/*`, `source/*`, `Compose.tsx`.
  - Kayıt yolu değişmedi: `recorder/*`, `ui/Shell.tsx`, `ui/Timeline.tsx`, `ui/styles.ts`.
  - NFR-LAT-01 ölçümleri 09:27 derlemesiyle yeniden yapıldı (`lat-latest.json` → `env.rewindDistBuiltAt`).
- **Referans sayfa:** 5.000 düğümlü liste sentetiktir (100'lük memo'lu parçalar). Gerçek uygulamalarda mutasyon deseni farklı olabilir.

## 6. Yeniden üretme

```bash
npm run build && npm run setup:browsers
npm run bench                                   # ~55 dk (2 çekirdek): perf → lat → mem + tablo
node scripts/bench/report.mjs                   # son sonuçlardan tablo
node scripts/bench/investigate.mjs ablate --page=demo --throttle=1 --runs=3 --pace=700
node scripts/bench/investigate.mjs replay --throttle=4
node scripts/bench/profile.mjs --page=list --throttle=4 --scenario=save   # interactions | panel | save
```

§4'teki düzeltmelerden sonra aynı komutlarla yeniden ölçüp bu belgeyi güncelleyin.
