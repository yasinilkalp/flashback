# FRD İnceleme Tartışması — Tur 1 · Ajan A (Ürün ve Güven Savunucusu)

| Alan | Değer |
|---|---|
| İncelenen | `01-FRD-v0.1-taslak.md`, `02-PM-inceleme.md` (ÖN-01…ÖN-25), `README.md` |
| Rol | Ajan A — Ürün ve Güven Savunucusu |
| Bakış | H1–H6 vaadi ve geliştiricinin güveni. Güvenlik açığı ya da **yanlış kanıt** üreten akışlara karşı tavizsiz; dolgu, örtüşme ve keyfi eşiklere karşı eleştirel. |
| Bağlam varsayımı | 1–3 kişilik ekip, MVP büyük ölçüde çalışıyor, hedef v1.0 halka açık npm sürümü |
| Formül | Bileşik = 0,4×D + 0,3×R + 0,3×U |

## Özet tablo

| Kimlik | Başlık | D | R | U | Bileşik | Karar |
|---|---|---:|---:|---:|---:|---|
| ÖN-08 | Kırmızı→yeşil kuralının bağlayıcı hale getirilmesi | 10 | 10 | 7 | **9,1** | Kabul-değiştirilmiş |
| ÖN-01 | Tehdit modeli ve localhost alıcısının sertleştirilmesi | 9 | 10 | 8 | **9,0** | Kabul-değiştirilmiş |
| ÖN-04 | H5/NFR-03 gizlilik iddiasının düzeltilmesi + gönderim önizlemesi | 9 | 9 | 8 | **8,7** | Kabul-değiştirilmiş |
| ÖN-17 | Varsayılanlar ve üretim koruması | 9 | 9 | 8 | **8,7** | Kabul-değiştirilmiş |
| ÖN-02 | `run_repro` assertions = keyfi kod çalıştırma | 9 | 9 | 6 | **8,1** | Kabul-değiştirilmiş |
| ÖN-05 | Gizleme kapsam matrisi ve ölçülebilir doğruluk | 9 | 9 | 6 | **8,1** | Kabul-değiştirilmiş |
| ÖN-03 | Prompt injection önlemleri | 8 | 8 | 8 | **8,0** | Kabul-değiştirilmiş |
| ÖN-06 | Repro başlangıç durumu ve kimlik doğrulama | 9 | 9 | 5 | **7,8** | Kabul-değiştirilmiş |
| ÖN-25 | Destek matrisi, uygulanma durumu, kapsam dışı | 8 | 6 | 9 | **7,7** | Kabul |
| ÖN-16 | Çoklu proje, port çakışması, olay klasörü | 8 | 8 | 6 | **7,4** | Kabul-değiştirilmiş |
| ÖN-12 | MCP araç sözleşmeleri | 8 | 6 | 7 | **7,1** | Kabul-değiştirilmiş |
| ÖN-13 | Kabul kriterleri ve fixture uygulamaları | 8 | 7 | 6 | **7,1** | Kabul-değiştirilmiş |
| ÖN-14 | Hata ve uç durum kataloğu | 8 | 8 | 5 | **7,1** | Kabul-değiştirilmiş |
| ÖN-15 | Öğesi olmayan hatalar ve çoklu kanıt | 8 | 6 | 7 | **7,1** | Kabul-değiştirilmiş |
| ÖN-07 | Gizlenmiş girişlerin repro'da sentetik değerle değişmesi | 7 | 7 | 7 | **7,0** | Kabul-değiştirilmiş |
| ÖN-11 | Olay JSON şeması, sürümleme, HTTP API sözleşmesi | 7 | 7 | 7 | **7,0** | Kabul |
| ÖN-20 | `reply_to_incident` iletişim döngüsü | 6 | 7 | 8 | **6,9** | Kabul-değiştirilmiş |
| ÖN-22 | Risk kaydı ve bağımlılık yönetimi | 6 | 6 | 9 | **6,9** | Kabul-değiştirilmiş |
| ÖN-10 | Sayısal NFR'ler | 7 | 7 | 6 | **6,7** | Kabul-değiştirilmiş |
| ÖN-21 | Repro belirlenimciliği, yan etkiler, flaky | 7 | 7 | 5 | **6,4** | Kabul-değiştirilmiş |
| ÖN-18 | Gerçekçi kurulum, `init`, `doctor` | 7 | 5 | 6 | **6,1** | Kabul-değiştirilmiş |
| ÖN-19 | İlk kullanım ve panel deneyimi | 7 | 5 | 6 | **6,1** | Kabul-değiştirilmiş |
| ÖN-24 | Kayıt penceresi, sayfa yenileme, erken yakalama | 6 | 5 | 7 | **6,0** | Kabul-değiştirilmiş |
| ÖN-23 | Saklama süresi, disk kotası, temizlik | 5 | 5 | 8 | **5,9** | Kabul-değiştirilmiş |
| ÖN-09 | İzlenebilirlik, ölçülebilir hedefler, ölçüm planı | 7 | 6 | 4 | **5,8** | Kabul-değiştirilmiş |
| **EK-A1** | Assertion'ın geliştiriciye görünürlüğü ve not ile bağı | 8 | 7 | 9 | **8,0** | Kabul (ek) |
| **EK-A3** | Raporun başında "Kanıt güveni" bloğu | 8 | 7 | 7 | **7,4** | Kabul (ek) |
| **EK-A2** | Yayın bütünlüğü ve tedarik zinciri (v1.0 npm) | 6 | 7 | 8 | **6,9** | Kabul (ek) |

**Genel tutum.** PM'in teşhisleri büyük ölçüde doğru; hiçbir öneriyi bütünüyle reddetmiyorum, çünkü hepsi gerçek bir boşluğa işaret ediyor. Ama önerilerin içinde küçük bir ekibin v1.0'ını boğacak **dolgu alt maddeler ve keyfi eşikler** var. Kararlarımın çoğu "Kabul-değiştirilmiş" olmasının nedeni bu: çekirdek (güvenlik, doğru kanıt, dürüst iddia) M'de kalıyor; ölçüm altyapısı, ikinci derece UX ve büyük mimari işler S'ye ya da yol haritasına iniyor.

---

## Madde madde gerekçeler

### ÖN-01 — Tehdit modeli ve localhost alıcısının sertleştirilmesi
**D 9 · R 10 · U 8 · Bileşik 9,0 · Kabul-değiştirilmiş**

Bu ürünün en büyük varoluşsal riski: herhangi bir web sitesi `text/plain` "simple request" ile sahte olay yazabilir; bu olay ajana talimat taşıyan kanıt olarak gider (ÖN-03 ile zincir). Host doğrulama, zorunlu Origin, `application/json` + özel başlıkla preflight zorlama, kimlik regex'i/yol geçişi kontrolü ve loopback dışı bağlanmayı reddetme **ucuz ve M olmalı**; tarayıcıların yerel ağ erişim kısıtlarına güvenilemez.

**Değişecekler:**
- FR-RCV-SEC-01…04, -06 ve FR-CFG-SEC-01 **M** (SEC-06 izinleri ucuz, S'den M'ye).
- FR-RCV-SEC-05: "5 MB / dakikada 30 olay" sayıları keyfi. Gereksinim "gövde ve oran sınırı vardır, varsayılanlar yapılandırılabilir" olsun; değerler ölçümle belirlensin.
- FR-RCV-SEC-07 (oturum belirteci eşleştirme) **Ertele (v1.1)**. SEC-01/02 tarayıcı kaynaklı saldırıları zaten kapatıyor. Yerel bir süreç ise `.flashback/` klasörünü doğrudan okuyabilir, belirteç bu durumda koruma sağlamaz. Üstelik bundler eklentisi ya da kod girme adımı H6'yı (basit kurulum) zedeler. Tasarım sorusu olarak açık sorulara yazılsın.
- 421 durum koduna takılmayalım; "4xx, gövdesiz" yeterli.
- Origin kontrolü yalnızca durum değiştiren uçlara değil, panelin mesaj okuduğu GET uçlarına da uygulanmalı.

### ÖN-02 — `run_repro` assertions = keyfi kod çalıştırma
**D 9 · R 9 · U 6 · Bileşik 8,1 · Kabul-değiştirilmiş**

İzin atlatma senaryosu gerçek. Kullanıcı `run_repro` aracını "test çalıştırıyor" diye otomatik onaylar; prompt injection ile birleşince bu, kabuk izni istemeden kod çalıştırma demektir. Güvenle bağdaşmaz. Ancak PM'in metni **izin listesi ile yasak listesini karıştırıyor**. `require`/`process`/`eval` yasaklamak yetersiz kalır, çünkü `({}).constructor.constructor('return process')()` gibi kaçışlar vardır.

**Değişecekler:**
- FR-REPRO-SEC-01 yalnızca **dar bir dilbilgisi izin listesi** olarak yazılsın: `await expect(<page|target|related>.<izinli locator zinciri>).<izinli matcher>(<literal>)`. Bunun dışındaki her düğüm reddedilir. `constructor`, `__proto__` ve hesaplanmış üye erişimi açıkça yasak.
- Alternatif: deklaratif JSON assertion biçimi. Tur 2'de B ile karar verilsin.
- SEC-03 (`base_url` loopback/izinli kökenler) ve SEC-05 (zaman aşımı, ayrı süreç) **M**.
- SEC-04 annotation'ları M kalsın, ama asıl güvence **açıklama metni**. Annotation'lar istemciler için yalnızca ipucu; FRD buna güvenlik denetimi gibi dayanmasın.
- SEC-02 (unsafe bayrağı) C kalabilir. Etkinse panelde ve raporda görünür olsun.
- ÖN-06'daki ajan `setup` adımları da aynı izin listesinden geçmek zorunda; aksi halde aynı açık oradan geri gelir.

### ÖN-03 — Prompt injection önlemleri
**D 8 · R 8 · U 8 · Bileşik 8,0 · Kabul-değiştirilmiş**

Çitli bloklar, "talimat değildir" uyarısı, notun tek "niyet" alanı olarak ayrılması ve MCP `instructions` alanı ucuz ve doğru; M kalsın. Ancak **kabul kriteri ürün kriteri değil**. "Claude Code ve Cursor ile 10'ar koşuda ajan talimatı yürütmez" LLM davranışını ölçer, Flashback'i değil. Ayrıca belirlenimci değil; sürüm kapısı olursa CI rastgele kırılır.

**Değişecekler:**
- Kabul kriteri: rapor şablonu snapshot testi + çit kaçışı birim testi + kırmızı takım fixture'ının **var olması**.
- Ajan koşuları bilgilendirici değerlendirme olsun, sürüm kapısı olmasın.
- FR-PKG-SEC-02'deki "eşleştirme durumu" ÖN-01 SEC-07 ertelendiği için "Origin doğrulandı / köken" olarak sadeleşsin.
- FR-PKG-SEC-04 (sezgisel talimat tespiti) **Ertele**. Yanlış pozitif üretir, güvence vermez ve sahte güvenlik hissi yaratır (R7'nin ta kendisi).

### ÖN-04 — H5/NFR-03 gizlilik iddiasının düzeltilmesi ve gönderim önizlemesi
**D 9 · R 9 · U 8 · Bileşik 8,7 · Kabul-değiştirilmiş**

"Hiçbir veri makine dışına çıkmaz" iddiası yanlış ve güven ürünü için en tehlikeli şey yanlış güvencedir. H5 yeni metni, NFR-PRIV-01 (telemetri yok) ve FR-RED-13 (`redact=false` şeridi) **neredeyse bedava, M**. README ve tanıtım sitesi aynı sürümde düzeltilmeli.

**Değişecekler:**
- FR-UI-09 önizleme M, ama **hafif sürüm**: gizlenmiş raporun salt okunur görünümü, gizlenen değerler vurgulu, "bir daha gösterme" seçeneği. Varsayılan olarak ilk gönderimde açık, sonra tek tıkla erişilebilir. H1'i (sürtünmesiz akış) bozmamak için her gönderimde zorunlu modal olmasın.
- Bölüm bazında hariç tutma **S**.
- Hash eşitliği kabul kriteri iyi, kalsın.

### ÖN-05 — Gizleme kapsam matrisi ve ölçülebilir doğruluk
**D 9 · R 9 · U 6 · Bileşik 8,1 · Kabul-değiştirilmiş**

En somut sızıntı burada. `maskAllInputs=false` iken giriş değerleri rrweb olay akışında, dolayısıyla `get_incident_events` çıktısında kalıyor. `Cookie`/`Set-Cookie` başlıkları da kapsam dışı. Alan × yöntem matrisi (RED-09), kapalı anahtar listesi (RED-10) ve ekran görüntüsü maskesi (RED-11; Playwright `mask` ile ucuz) **M**.

**Değişecekler:**
- FR-RED-12 (`data-flashback-mask` / `data-flashback-block`) **S'den M'ye**. rrweb'in `maskTextClass`/`blockClass` seçenekleriyle çok ucuz ve geliştiriciye kontrol vererek güveni doğrudan artırıyor.
- FR-RED-14'teki "en az 500 örnek, %99 duyarlılık, ≤ %1 yanlış pozitif" **keyfi**. Bunun yerine: her biçim için pozitif ve negatif örnekli, kürate edilmiş bir derlem olsun. Bilinen sır biçimlerinde %100 (belirlenimci, ucuz). Diğerlerinde CI'da **gerileme kapısı** olsun (mevcut skordan düşüş CI'ı kırar); mutlak eşikler ilk ölçümden sonra konsun.
- ÖN-07'deki RED-15 ve ÖN-04'teki RED-13 bu bölüme taşınsın (birleştirme).
- Telefon numarası açık sorusu kalsın.

### ÖN-06 — Repro başlangıç durumu ve kimlik doğrulama
**D 9 · R 9 · U 5 · Bileşik 7,8 · Kabul-değiştirilmiş**

PM'in en önemli ürün gözlemi bu. Oturumsuz açılan repro giriş sayfasına düşer ve **yanlış kırmızı** üretir. Bu doğrudan yanlış kanıttır; H3 demo dışında çöker. Ancak L eforun tamamı v1.0'a sığmaz.

**Değişecekler:**
- FR-REPRO-09 (başlangıç bağlamı: URL, viewport, locale, saat dilimi, depolama/çerez **adları**) **M**. Ucuz.
- FR-REPRO-10: v1.0 için **yalnızca (a) `FLASHBACK_STORAGE_STATE`** M. Playwright'ın yerleşik özelliği, en ucuz yol. (b) `flashback.setup.ts` kancası **Ertele**.
- FR-REPRO-11'deki "pencere öncesi durumu algılama" belirsiz ve pahalı. Şuna daralsın: oturum çerezi veya depolama anahtarı varsa ve storageState verilmemişse rapora ve repro sonucuna uyarı yazılır. Ajan `setup` adımları ÖN-02'nin izin listesi tamamlanana kadar ertelensin.
- FR-REPRO-12 (`error_precondition`) M, ama sınıflandırma kuralı somut olmalı: ilk adımdan önce URL kayıttaki başlangıç URL'sinden farklıysa ya da adım oynatma sırasında seçici bulunamazsa → `error_precondition`/`error_selector`, kırmızı sayılmaz (ÖN-08 ile birleşik taksonomi).

### ÖN-07 — Gizlenmiş giriş değerlerinin repro'da sentetik değerle değiştirilmesi
**D 7 · R 7 · U 7 · Bileşik 7,0 · Kabul-değiştirilmiş**

`[REDACTED:email]` yazısının forma yazılması, ÖN-06 gibi yanlış kırmızıya giden ikinci yol; gerçek ve ucuz kapanır. Sentetik değerlerin bazen sunucu tarafında farklı davranışa yol açabileceği (ör. kayıtlı olmayan e-posta) raporda açıkça belirtilmeli; REPRO-14 bunu zaten sağlıyor.

**Değişecekler:**
- FR-RED-15 ÖN-05'e taşınsın.
- Sentetik değer `process.env.FLASHBACK_INPUT_<n>` ile her alan için geçersiz kılınabilsin (yalnızca parola için değil). Böylece geliştirici gerçek test hesabını gizli tutarak verebilir.

### ÖN-08 — Kırmızı→yeşil kuralının bağlayıcı hale getirilmesi
**D 10 · R 10 · U 7 · Bileşik 9,1 · Kabul-değiştirilmiş**

Ürünün kalbi. H3 ile FR-LIFE-02 arasındaki çelişki, altyapı hatasının "kırmızı" sayılması ve assertion gevşetilerek yeşil üretilebilmesi, kanıt iddiasını boşa çıkarır. `ReproRun.status` taksonomisi, `assertionsHash` eşitliği ve `fixed_unverified` **tavizsiz M**.

**Değişecekler:**
- **Sınıflandırma kuralı eklensin:** Yalnızca `assertions` bloğu içindeki başarısızlık `failed_assertion` sayılır. Adım oynatma sırasındaki başarısızlıklar `error_selector`, `error_precondition` ya da `error_timeout` olur. Aksi halde "öğe kayboldu" hatası ile "seçici bozuk" ayırt edilemez.
- Durum seti v1.0 için `open`, `fixed`, `fixed_unverified`, `cannot_reproduce` olsun. `needs_info` yalnızca ÖN-20 ile birlikte gelir. `reopened` S (FR-LIFE-06).
- `flaky` durumu yalnızca ÖN-21'deki tekrar mekanizmasıyla anlamlıdır; ikisi birleşik yazılsın.
- `fixed_unverified` gerekçesi zorunlu kalsın ve panelde ✅ ile **aynı görünmesin**; ayrı rozet kullanılsın.
- EK-A1 ile birlikte: yeşilin hangi assertion'ı kanıtladığı panelde görünür olmalı.

### ÖN-09 — İzlenebilirlik matrisi, ölçülebilir hedefler, ölçüm planı
**D 7 · R 6 · U 4 · Bileşik 5,8 · Kabul-değiştirilmiş**

İki parçası çok farklı değerde. **"Hedef" sütunu ve metrik tanımları ucuz ve gerekli (M)**; FRD'nin hedeflerle bağını kurar. "%60" iddiasının n=1 olduğu her yerde açıkça yazılmalı: kanıtı aşan pazarlama iddiası bir güven sorunudur.

Öte yandan 20 tohumlanmış hata × 3 ajan × 3 tekrar × (Flashback'li/Flashback'siz) ≈ 360 koşu, 1–3 kişilik ekip için ayrı bir projedir. ≥%85, ≥%30, ≥%40, ≥%80, ≥%70 hedefleri **keyfi**; PM'in kendisi de "kalibre edilmeli" diyor.

**Değişecekler:**
- Benchmark v1.0 için **8–10 hata, 1–2 ajan** ile S olsun. Mutlak hedef değerler ilk ölçümden sonra konsun.
- "Başlangıç ölçümü v0.2 onayından önce" şartı **kaldırılsın**. Ölçüm FRD onayını bloke etmemeli, halka açık iddiaları bloke etmeli.
- `.flashback/stats.json` S; `stats --export` **Ertele**.

### ÖN-10 — Sayısal NFR'ler
**D 7 · R 7 · U 6 · Bileşik 6,7 · Kabul-değiştirilmiş**

Test edilemeyen NFR işe yaramaz, bu doğru. Ama sayıların hepsi aynı değerde değil.

**M kalsın (doğrudan H4/H5/güveni etkiliyor):**
- NFR-SIZE-01: gövde kırpma, `truncated` işareti, ikili gövdeleri saklamama.
- NFR-TOK-01: `get_incident` için bir token bütçesi **olması**. 4.000 değeri keyfi; ölçümle konsun.
- NFR-REPRO-01: zaman aşımı.
- NFR-MEM-01: tampon üst sınırı + uyarı.

**Değişecekler:**
- NFR-PERF-01'deki "INP p75 ≤ %10 ve ≤ 20 ms, 5.000 düğüm" ölçüm altyapısı pahalı ve keyfi. v1.0 için şuna daralsın: referans sayfada tam anlık görüntü süresi ve checkout dışı long task sayısı sürüm öncesi kontrol listesinde ölçülür; eşikler ilk ölçümden sonra.
- NFR-05 revize: Node ≥ 22 doğru. "Chrome, Edge, Firefox, Safari'nin son 2 sürümü" ise iddia olarak fazla. `_debugStack` ayrıştırma yığın biçimine bağlı ve Firefox/Safari biçimleri farklı. v1.0'da **Chromium "Doğrulandı", Firefox/Safari "en iyi çaba"** olarak yazılsın (ÖN-25 matrisi).
- NFR-06/07'nin taşınması doğru, ucuz.

### ÖN-11 — Olay JSON şeması, sürümleme ve HTTP alıcı API sözleşmesi
**D 7 · R 7 · U 7 · Bileşik 7,0 · Kabul**

İki paket npm'de bağımsız sürümlenecek. `schemaVersion` ve N/N-1 okuma olmazsa ilk sürüm farkında olaylar sessizce bozulur. Tek zaman tabanı (FR-PKG-06) "işaretlenen an" ile ilgili kanıtın doğruluğu için şart. Alıcıda şema doğrulaması da ÖN-01'in sahte/bozuk olay savunmasına katkı veriyor.

Olduğu gibi kabul. Tek not: şema TypeScript tiplerinden üretilsin, FRD'ye **ek olarak bağlantı** verilsin, satır satır kopyalanmasın (iki doğruluk kaynağı olmasın).

### ÖN-12 — MCP araç sözleşmeleri
**D 8 · R 6 · U 7 · Bileşik 7,1 · Kabul-değiştirilmiş**

Ajan için hata kodları + "ne yapmalısın" metni (FR-MCP-10) H2/H4 açısından çok değerli: ajan tahmin yürütmek yerine yönlendirilir. **M**. Sayfalama ve boyut sınırı (MCP-11) M; NFR-TOK ile birlikte.

**Değişecekler:**
- `outputSchema` / `structuredContent` (MCP-09) **S**. İstemci desteği tutarsız; metin çıktısı birincil kalmalı. `inputSchema` zaten protokol gereği var.
- MCP-13 (`fix-incident` prompt'u) S, ÖN-03'teki `instructions` ile birlikte yazılsın (örtüşme).
- MCP-14 (`portable` çıktı) **S**. Daha ucuz alternatif: FR-REPRO-08'in "olduğu gibi taşınabilir" iddiası "küçük uyarlamayla taşınabilir; gerekenler dosya başında yorum olarak yazılır" diye düzeltilsin. Abartılı iddia güven kaybettirir.
- ÖN-18'deki `PLAYWRIGHT_NOT_FOUND` / `BROWSER_NOT_INSTALLED` (FR-REPRO-17) bu listeye birleştirilsin.

### ÖN-13 — Eksik ve zayıf kabul kriterleri, fixture uygulamaları
**D 8 · R 7 · U 6 · Bileşik 7,1 · Kabul-değiştirilmiş**

Her M gereksinim için doğrulanabilir kriter şart; ucuz yazım işi. Burada güven ilkem şu: **doğrulanmamış destek iddiası yayımlanmaz.** Her fixture ya yazılmalı ya da iddia geri çekilmeli.

**Değişecekler:**
- `examples/next-app` ve oturum gerektiren fixture (ÖN-06) **M**.
- `examples/webpack` S. Yoksa README'deki webpack iddiası "doğrulanmadı" olarak işaretlensin.
- `examples/vue`: tek bir smoke e2e testi S. Yapılmazsa FR-MARK-06'nın kabul kriteri ve "Vue'da her şey çalışır" ifadesi kaldırılsın.
- FR-MARK-01'deki "30 seçimin ≥ %95'i" keyfi ama makul bir başlangıç; kalabilir.
- KK-5 (Cursor/Codex) elle smoke testi olarak M.
- KK-7 yalnızca M NFR'ler için.
- KK-8 (benchmark yayımı) **sürüm kapısı olmasın**. ÖN-09 ile birlikte "halka açık iddia kapısı" olsun.
- ÖN-17'deki FR-CFG-11 (resmi örnekler) bu fixture'larla birleştirilsin.

### ÖN-14 — Hata ve uç durum kataloğu
**D 8 · R 8 · U 5 · Bileşik 7,1 · Kabul-değiştirilmiş**

Bu tür aracın güvenilirliği başarısızlık anında belli olur. Katalog önemli, ama 13 satırın hepsi eşit değil. Öncelik ölçütüm: **sessizce yanlış kanıt üretenler veya kullanıcının uygulamasını bozanlar M**, gerisi S ya da yalnızca belgeleme.

**M:**
- Öğe canlı sayfada yok → `resolution: ancestor | unresolved` (yanlış dosya:satır vermek H2'yi öldürür).
- Source map çözülemedi → `resolved: false`.
- HMR satır kayması → ±3 satır kod parçası + hash. Ucuz ve ajanın doğru satırı bulmasında çok etkili.
- Akış/SSE yanıtları **bozulmamalı**. Flashback'in kullanıcının uygulamasını bozması kabul edilemez.
- CSP engelinde açık mesaj.
- Eşzamanlı `run_repro` kilidi.
- `base_url` öncelik sırası.

**S:** Alıcı kapanınca sessionStorage kuyruğu (yalnızca gizlenmiş hali, sekme ömrü), `.md` indirme fallback'i, panel açıkken "panel açıktı" işaretçisi.

**Yalnızca belgeleme / kapsam kararı:** WSL2/Docker/uzak geliştirme (ÖN-25'te "Desteklenmiyor/en iyi çaba"), çoklu sekme (`tabId` alanı yeterli), WebSocket (v1.0: kaydedilmez, kapsam dışı yazılır), portal/Shadow DOM (fiber hiyerarşisi kuralı yazılır, Shadow DOM seçici kuralı S).

"Her satırın otomatik testi" kriteri yalnızca M satırlar için geçerli olsun.

### ÖN-15 — Öğesi olmayan hatalar ve çoklu kanıt seçimi
**D 8 · R 6 · U 7 · Bileşik 7,1 · Kabul-değiştirilmiş**

KIS20 README demosunda ve KK-1'de var, ama model "öğeye tıkla" varsayımıyla bunu karşılayamıyor. "Bir şeyin olmaması" hatası çok yaygın; H1 için önemli.

**Değişecekler:**
- FR-MARK-07 (sayfa düzeyi olay, `target = null`) **M**.
- FR-MARK-08 (zaman çizelgesi işaretçisini birincil kanıt seçme) **M**; aynı UI'ı paylaştıkları için ucuz.
- FR-MARK-09 (3'e kadar ilgili öğe) **Ertele**. Açık soru 1 v1.0 için "tek birincil öğe" diye kapatılsın. Çoklu öğe assertion dilbilgisini (ÖN-02) ve raporu karmaşıklaştırır; kanıtlanmış bir ihtiyaç yok.

### ÖN-16 — Çoklu proje, port çakışması ve olay klasörü
**D 8 · R 8 · U 6 · Bileşik 7,4 · Kabul-değiştirilmiş**

Bu madde güvenlik ve kanıt meselesi. B projesinin olaylarını A projesindeki ajana vermek hem **yanlış projede düzeltme** (H2'nin tersi) hem **veri sızıntısıdır**. İki projeyi aynı anda açmak sık rastlanan bir durum.

**Değişecekler:**
- FR-RCV-07 (`projectId` + `/health` + `WRONG_PROJECT`) **M**. Sessizce okumak yerine **reddet ve açıkla**.
- FR-CFG-06 (klasör çözümleme, ev/kök dizinine yazmayı reddet) **M**; ucuz.
- FR-RCV-08 (tarayıcının proje kimliğini göndermesi) tarayıcı proje kökünü bilmediği için bundler entegrasyonu gerektiriyor; **S**. v1.0'da alıcı olayın kökenini (origin) kaydeder ve köken eşleşmezse uyarır.
- Mimari karar: v1.0 = **proje başına port** (elle `FLASHBACK_PORT` + `endpoint`), hata mesajı boş port önerir. Makine geneli tek alıcı **Ertele**.
- ÖN-19'daki "yanlış proje" rozetiyle birleştirilsin.

### ÖN-17 — Varsayılanlar ve üretim koruması
**D 9 · R 9 · U 8 · Bileşik 8,7 · Kabul-değiştirilmiş**

`enabled` varsayılanının `true` olması, prop unutulduğunda gerçek kullanıcıların tarayıcısında istek/yanıt gövdelerinin kaydedilmesi ve Flashback düğmesinin son kullanıcıya görünmesi demek. "Yalnızca dev" vaadini ihlal eden, bir kez olsa bile marka güvenini bitirecek bir hata. FR-CFG-07, -08, -09 ve -10 ucuz, **M**.

**Değişecekler:**
- FR-CFG-10'daki "README bu tablodan üretilmelidir" süreç dayatması gereksiz. "FRD tablosu ile README tutarlıdır; CI'da bir tutarlılık kontrolü olabilir (S)" yeterli.
- FR-CFG-11 ÖN-13 fixture'larına birleştirilsin.
- `allowProduction` kullanıldığında da panelde kalıcı uyarı gösterilsin (ÖN-04 RED-13 ile aynı desen).

### ÖN-25 — Destek matrisi, uygulanma durumu, kapsam dışı
**D 8 · R 6 · U 9 · Bileşik 7,7 · Kabul**

Ucuz ve görevin kendisine hizmet ediyor: "Durum" sütunu (Mevcut/Kısmi/Planlı) FRD v1.0'ın asıl amacı olan "neyin v1.0'a gireceği" sorusunu doğrudan yanıtlıyor. Matris de "her şeyle çalışır" belirsizliğini dürüst bir beyana çeviriyor. Kapsam dışı eklemeleri (sunucu logları, WebSocket içeriği, CI'da kayıt, RSC) doğru. Olduğu gibi kabul. "Doğrulandı" hücreleri ÖN-13 fixture'larına bağlanır.

### ÖN-22 — Risk kaydı ve bağımlılık yönetimi
**D 6 · R 6 · U 9 · Bileşik 6,9 · Kabul-değiştirilmiş**

Ucuz bir belgeleme işi ve R1 (React iç API'leri) gerçekten H2'nin tek dayanağı. Kayıt kalsın.

**Değişecekler:**
- R1 azaltımı v1.0 için şu olsun: React canary CI işi + çözümleme başarısızsa `resolved: false` ile **zarif düşüş** (ÖN-14). Babel/SWC eklentisiyle `data-flashback-source` yedeği **Ertele** (ayrı bir ürün parçası, kurulumu da zorlaştırır).
- R6'daki "hukuk görüşü alınır" 1–3 kişilik açık kaynak ekip için gerçekçi değil. Yerine: README'de ve ilk açılışta açık bir kullanıcı uyarısı ("paket ajanınızın model sağlayıcısına gider; gerçek kişisel veri içeren ortamlarda kullanmayın ya da `maskAllInputs` açın").
- "Sahip" alanı küçük ekipte formalite; kalsın ama tartışma konusu yapılmasın.

### ÖN-18 — Gerçekçi kurulum, `init` ve `doctor`
**D 7 · R 5 · U 6 · Bileşik 6,1 · Kabul-değiştirilmiş**

H6 metninin düzeltilmesi **M**. "İki npm paketi" demek, Playwright ve ~150 MB Chromium gerçeğini gizliyor; bu da ÖN-04 gibi bir dürüstlük sorunu.

**Değişecekler:**
- `init` (FR-CFG-12) **S, v1.0 hedefi**. Sürümü sabitlenmiş yapılandırma yazdığı için ÖN-01'in CFG-SEC-01 maddesini de taşıyor.
- `doctor` (FR-CFG-13) **Ertele (v1.1)**. v1.0'da `init` içine port, Playwright ve tarayıcı kontrolleri ile panel durum göstergesi (ÖN-19 UI-10) yeterli. CSP ve uzaktan geliştirme ortamı tespiti pahalı.
- FR-REPRO-17 ÖN-12'ye birleştirilsin.
- "Medyan ≤ 10 dk" makul bir hedef, ama ölçüm 5–8 kişilik kullanılabilirlik testine bağlı; ÖN-19'un testiyle tek oturumda yapılsın.

### ÖN-19 — İlk kullanım ve panel deneyimi
**D 7 · R 5 · U 6 · Bileşik 6,1 · Kabul-değiştirilmiş**

**M kalanlar:**
- FR-UI-10: kayıt ve alıcı durum göstergesi. Ucuz; "kaydediyor mu, gidecek mi?" sorusu güvenin temeli.
- FR-UI-11: "Ne olmalıydı?" alanı. Ajanın assertion yazabilmesi için tek gerçek girdi bu. Tek cümlelik zorunlu alan H1'le çelişmez, kanıtın niyet kısmıdır.
- FR-UI-13'ün Shadow DOM yalıtımı kısmı.

**Değişecekler:**
- FR-UI-12: `event.code` eşleştirmesi ve metin girişinde tetiklenmeme **M**; macOS'taki karakter sorununu zaten çözüyor. Ancak **PM'in örnek varsayılanı `Ctrl+Shift+Y` Firefox'ta İndirilenler penceresini açar**; bu, önerinin ne kadar test edilmeden yazıldığının göstergesi. Windows Alt+Shift dil değiştirme etkisi de araya R tuşu girdiğinde tutarlı değil. Varsayılan değişikliği yalnızca üç işletim sistemi × üç tarayıcıdaki çakışma testinden sonra yapılsın; ilk açılışta değiştirme seçeneği S.
- Erişilebilirlikte "axe kritik ihlal 0" S.
- FR-UI-14 (TR/EN locale) **S**. Halka açık npm için İngilizce varsayılan gerekli. Tema **Ertele**.
- "5 kişiden 4'ü 3 dakikada" eşiği keyfi, yönlendirici hedef olarak kalsın.

### ÖN-20 — `reply_to_incident` iletişim döngüsü
**D 6 · R 7 · U 8 · Bileşik 6,9 · Kabul-değiştirilmiş**

Bugün akış yarım; ajan soruyor ama yanıtı okuyamıyor. Daha önemlisi **FR-UI-15 (düz metin render)**: panel uygulamanın kökeninde çalışıyor. Prompt injection'dan türemiş bir ajan mesajı HTML olarak render edilirse uygulama kökeninde XSS olur. Bu madde, `reply_to_incident` S olsa bile **koşulsuz M**.

**Değişecekler:**
- `wait_seconds` üst sınırı 120 değil **60 sn** olsun. Bazı MCP istemcileri araç çağrılarında daha kısa zaman aşımı uyguluyor; bu sınır keyfi ve riskli.
- `needs_info` durumu ÖN-08'in durum setine bu maddeyle birlikte eklensin.

### ÖN-21 — Repro belirlenimciliği, yan etkiler, flaky
**D 7 · R 7 · U 5 · Bileşik 6,4 · Kabul-değiştirilmiş**

Burada PM'in görmediği bir **yanlış kanıt yolu** var. Kesintili (zamanlamaya bağlı) bir hatada kırmızı → (düzeltme etkisiz) → şans eseri yeşil, sahte bir "düzeltildi" kanıtı üretir. Bu yüzden FR-REPRO-20 S değil, şu biçimde **M** olmalı: olayı `fixed` yapacak yeşil için **ardışık 2 geçiş** gerekir. Karışık sonuç `flaky` olur ve doğrulanmış kapanış sayılmaz. Maliyet tek bir ek koşu.

**Değişecekler:**
- FR-REPRO-19 (yan etkili istek uyarısı) **M**. Ucuz ve dürüst: repro dev backend'ine tekrar POST atıyor, e-posta gönderebilir.
- FR-REPRO-18 (`recorded` ağ modu) **Ertele**. L eforu var; gizlenmiş gövdelerle doğruluğu tartışmalı ve yanlış bir "yeşil" de üretebilir (backend hatası maskelenir).

### ÖN-23 — Saklama süresi, disk kotası, temizlik
**D 5 · R 5 · U 8 · Bileşik 5,9 · Kabul-değiştirilmiş**

Veri minimizasyonu güven için iyi, ama kullanıcının açık olaylarını sessizce silmek de güveni zedeler.

**Değişecekler:**
- `prune` komutu (FR-RCV-11) **M**; ucuz.
- Otomatik saklama yalnızca kapanmış olaylar için, varsayılan 30 gün (S).
- **Açık olaylar otomatik silinmez.** 200 olay / 500 MB üst sınırı silme değil **uyarı** tetiklesin.
- 14/30/200/500 değerleri keyfi; ilk değer olarak kabul edilebilir, ama silme davranışı muhafazakâr olmalı.

### ÖN-24 — Kayıt penceresi, sayfa yenileme, erken yakalama
**D 6 · R 5 · U 7 · Bileşik 6,0 · Kabul-değiştirilmiş**

Vaat ile davranış arasındaki fark (60 sn vs 30–60 sn) bir dürüstlük sorunu ve kapatılmalı.

**Değişecekler:**
- FR-REC-10 (3 dilim, "en az `bufferSeconds`") **M**, NFR-MEM ölçümüyle birlikte. Bellek kabul edilemezse alternatif: ürün metni "son 30–60 sn" olarak düzeltilir. İkisinden biri v1.0'da zorunlu.
- FR-REC-01'in metni ile kabul kriteri hizalansın (ucuz).
- FR-REC-11 (yenilemede tamponu sessionStorage/IndexedDB'de koruma) **Ertele**. Gizlenmemiş ham tamponu diske yazmak, "tampon yalnızca bellekte" güvencesini zayıflatır; ayrıca boyut sınırları sorunlu. Önce gizleme ve şifreleme kararı gerekir.
- FR-REC-12 (erken yükleme script/eklentisi) **Ertele**; bundler entegrasyonu gerektiriyor.

---

## Birleştirilmesi gereken öneriler

| Birleşim | Gerekçe |
|---|---|
| **ÖN-01 + ÖN-02 + ÖN-03** → tek "§10.1 Tehdit modeli" bölümü | Aynı saldırı zincirinin halkaları: sahte olay → prompt injection → `run_repro` ile kod çalıştırma. Ayrı ayrı yazılırsa zincir görünmez. |
| **ÖN-08 + ÖN-06 (REPRO-12) + ÖN-21 (REPRO-20) + ÖN-07 (REPRO-14)** → tek "`ReproRun.status` ve doğrulanmış kapanış" bölümü | Sınıflandırma, `error_precondition`, `flaky` ve sentetik giriş bilgisi aynı kararın parçası: "bu kırmızı/yeşil kanıt mı?" |
| **ÖN-11 + ÖN-12** → "Ek A: Sözleşmeler" | Şema, HTTP API ve MCP araç sözleşmeleri tek ekte. ÖN-18'deki FR-REPRO-17 hata kodları buraya. |
| **ÖN-05 + ÖN-04 (RED-13) + ÖN-07 (RED-15)** | Tüm gizleme gereksinimleri tek bölümde, tek matriste. |
| **ÖN-13 + ÖN-25 + ÖN-17 (CFG-11)** | Fixture'lar, destek matrisindeki "Doğrulandı" hücrelerinin kanıtı ve resmi örnekler aynı iş. |
| **ÖN-09 + ÖN-22 (R9) + FR-PKG-03** | "%60" ve diğer iddiaların ölçüm disiplini tek yerde. |
| **ÖN-16 + ÖN-19 (UI-10 "yanlış proje")** | Yanlış proje tespiti ve kullanıcıya gösterimi. |
| **ÖN-20 (LIFE-07) + ÖN-08 (LIFE-05)** | Durum seti tek tabloda. |
| **ÖN-03 (MCP-SEC-01) + ÖN-12 (MCP-13)** | Sunucu `instructions` ve `fix-incident` prompt'u aynı iş akışı metnini paylaşır. |

---

## Ek öneriler (PM'in kaçırdıkları)

### EK-A1 — Assertion'ın geliştiriciye görünürlüğü ve not ile bağı
**D 8 · R 7 · U 9 · Bileşik 8,0 · Kabul (M)**

**Sorun.** ÖN-08 yeşilin *aynı* assertion'la elde edildiğini garanti ediyor, ama assertion'ın geliştiricinin *niyetini* doğru ifade ettiğini garanti eden hiçbir şey yok. Ajan "Toplam 1380 ₺ olmalı" notunu `expect(target).toBeVisible()` gibi zayıf bir assertion'a çevirirse kırmızı→yeşil yine üretilebilir: sayfa yüklenmeden önce kırmızı, sonra yeşil. Böylece H3 yanlış bir güvence verir. Kırmızı→yeşil yalnızca "assertion'ın kanıtladığını" kanıtlar.

**Öneri.**
> **FR-UI-16 (M):** Kayıtlar sekmesinde her olay için geliştiricinin notu ("Ne olmalıydı?") ile kırmızı ve yeşil koşuların assertion metni **yan yana** gösterilir. `fixed` rozeti assertion metni görünmeden gösterilmez.
> **FR-LIFE-08 (S):** Geliştirici panelden "Bu test beklentimi kanıtlamıyor" diyerek olayı `reopened` yapabilir; gerekçe ajana mesaj olarak iletilir (ÖN-20 kanalı).
> **FR-MCP-SEC-02 (M):** `mark_fixed` çıktısı ve rapor, kullanılan assertion'ı ve notu birlikte içerir; ajana "assertion notu doğrudan ifade etmeli" yönergesi `instructions` alanında verilir.

**Kabul kriteri.** `fixed` olayın panel görünümünde not ve assertion metni birlikte bulunur (snapshot testi). Panelden yeniden açma `reopened` durumuna geçirir ve mesaj oluşturur.

### EK-A2 — Yayın bütünlüğü ve tedarik zinciri (v1.0 npm)
**D 6 · R 7 · U 8 · Bileşik 6,9 · Kabul (M, v1.0 yayın kapısı)**

**Sorun.** v1.0'ın hedefi halka açık npm. `flashback-mcp` geliştiricinin makinesinde ajanın yanında çalışıyor, dosya yazıyor ve Playwright başlatıyor; `npx flashback-mcp` (sabitlenmemiş) her açılışta registry'den çözülüyor. PM bunu yalnızca R8 ve CFG-SEC-01 içinde dolaylı anıyor; yayın sürecinin kendisi tanımlı değil. README'de `GITHUB_KULLANICI` yer tutucusu hâlâ duruyor.

**Öneri.**
> **NFR-SUP-01 (M):** Paketler yalnızca CI'dan, npm provenance (`--provenance`) ile yayımlanır; npm hesaplarında 2FA zorunludur.
> **NFR-SUP-02 (M):** `flashback-mcp`'nin çalışma zamanı bağımlılıkları asgari tutulur ve sabitlenir. Sürüm öncesi `npm audit` (yüksek/kritik = 0) kontrol listesindedir. rrweb tam sürümle sabitlenir (R2 ile bağlı).
> **NFR-SUP-03 (S):** Paket içeriği `release:check` çıktısında beklenen dosya listesiyle karşılaştırılır (kaynak harita, test, `.env` sızıntısı yok).

**Kabul kriteri.** npm'de iki paketin de provenance rozeti görünür; KK-4 bu kontrolleri içerir.

### EK-A3 — Raporun başında "Kanıt güveni" bloğu
**D 8 · R 7 · U 7 · Bileşik 7,4 · Kabul (M)**

**Sorun.** Kanıtın ne kadar güvenilir olduğunu gösteren işaretler PM önerilerine dağılmış durumda: `resolved: false` ve `resolution: ancestor` (ÖN-14), props/state'in canlı okunması (§12), `truncated` (ÖN-10), pencere öncesi durum uyarısı (ÖN-06), sentetik girişler (ÖN-07), gizleme sayacı ve `Gizleme: KAPALI` (ÖN-04), doğrulanmamış köken (ÖN-03). Ajan bunları raporun içinde ararsa, ilk turda zayıf bir kanıta güvenip yanlış dosyayı düzenler. Bu, H2 ve H4'ün tam tersi.

**Öneri.**
> **FR-PKG-08 (M):** `get_incident` raporunun dosya:satır bilgisinden hemen sonra gelen ilk bloğu, sabit biçimli bir "Kanıt güveni" listesidir. Her madde `ok | uyarı` olarak gösterilir: kaynak çözümleme, öğe eşleme, props/state zamanı, pencere kapsamı (pencere öncesi durum var mı), kırpılan alanlar, gizleme durumu ve sayısı, köken doğrulaması. Uyarı varsa ajana ne yapması gerektiği tek satırla yazılır (ör. "satır kaymış olabilir; ±3 satırlık parçayla eşleştirin").
> Aynı blok paneldeki önizlemede (ÖN-04) geliştiriciye de gösterilir.

**Kabul kriteri.** Rapor snapshot testleri: source map çözülemeyen, öğesi unmount olmuş ve `redact=false` olan üç fixture olayında ilgili maddeler `uyarı` olarak ilk blokta yer alır.
