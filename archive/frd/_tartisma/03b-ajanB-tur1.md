# Flashback FRD v0.1 — Öneri değerlendirmesi, Tur 1

| Alan | Değer |
|---|---|
| Rol | **Ajan B: Teslimat ve Mühendislik Şüphecisi** (kıdemli staff mühendis / teslimat lideri) |
| İncelenen | `02-PM-inceleme.md` içindeki ÖN-01…ÖN-25 |
| Referanslar | `01-FRD-v0.1-taslak.md`, `README.md` |
| Tarih | 27.10.2026 |
| Bağlam varsayımı | 1–3 geliştirici, MVP büyük ölçüde çalışıyor, hedef v1.0 halka açık npm sürümü |

**Puanlama.** D = Değer, R = Risk azaltımı, U = Uygulanabilirlik (10 = ucuz/kolay). Bileşik = 0,4·D + 0,3·R + 0,3·U. **Puanlar önerinin PM'in yazdığı hâline verilmiştir.** Önerdiğim daraltmalar "Karar" ve "Değişiklik" kısmında. Bu yüzden U puanı düşük olan bir öneri, değiştirilmiş hâliyle ucuz olabilir.

---

## Özet tablo

| Kimlik | Başlık | D | R | U | Bileşik | Karar |
|---|---|---:|---:|---:|---:|---|
| ÖN-01 | Tehdit modeli ve localhost alıcısının sertleştirilmesi | 8 | 9 | 6 | **7,7** | Kabul-değiştirilmiş |
| ÖN-02 | `run_repro` assertions = keyfi kod: kısıtlama | 7 | 7 | 4 | **6,1** | Kabul-değiştirilmiş |
| ÖN-03 | Prompt injection önlemleri | 6 | 7 | 5 | **6,0** | Kabul-değiştirilmiş |
| ÖN-04 | H5/NFR-03 düzeltmesi ve gönderim önizlemesi | 8 | 7 | 6 | **7,1** | Kabul-değiştirilmiş |
| ÖN-05 | Gizleme kapsam matrisi ve ölçülebilir doğruluk | 7 | 8 | 4 | **6,4** | Kabul-değiştirilmiş |
| ÖN-06 | Repro başlangıç durumu ve kimlik doğrulama | 9 | 8 | 4 | **7,2** | Kabul-değiştirilmiş |
| ÖN-07 | Gizlenmiş girişler için sentetik değer | 6 | 5 | 6 | **5,7** | Kabul-değiştirilmiş |
| ÖN-08 | Kırmızı→yeşil kuralının bağlayıcı olması, yaşam döngüsü | 9 | 8 | 6 | **7,8** | Kabul-değiştirilmiş |
| ÖN-09 | İzlenebilirlik, ölçülebilir hedefler, ölçüm planı | 6 | 5 | 2 | **4,5** | Kabul-değiştirilmiş (benchmark kısmı Ertele) |
| ÖN-10 | Sayısal NFR'ler | 6 | 5 | 5 | **5,4** | Kabul-değiştirilmiş |
| ÖN-11 | Olay JSON şeması, sürümleme, HTTP API sözleşmesi | 7 | 6 | 7 | **6,7** | Kabul-değiştirilmiş |
| ÖN-12 | MCP araç sözleşmeleri | 7 | 6 | 6 | **6,4** | Kabul-değiştirilmiş |
| ÖN-13 | Kabul kriterleri ve fixture uygulamaları | 7 | 6 | 4 | **5,8** | Kabul-değiştirilmiş |
| ÖN-14 | Hata ve uç durum kataloğu | 7 | 6 | 4 | **5,8** | Kabul-değiştirilmiş |
| ÖN-15 | Öğesiz hatalar ve çoklu kanıt seçimi | 8 | 6 | 6 | **6,8** | Kabul-değiştirilmiş |
| ÖN-16 | Çoklu proje, port çakışması, olay klasörü | 6 | 6 | 5 | **5,7** | Kabul-değiştirilmiş |
| ÖN-17 | Varsayılanlar ve üretim koruması | 8 | 8 | 8 | **8,0** | **Kabul** |
| ÖN-25 | Destek matrisi, uygulanma durumu, kapsam dışı | 8 | 6 | 9 | **7,7** | **Kabul** |
| ÖN-22 | Risk kaydı ve bağımlılık yönetimi | 5 | 5 | 8 | **5,9** | Kabul-değiştirilmiş |
| ÖN-18 | Gerçekçi kurulum, `init` ve `doctor` | 5 | 4 | 5 | **4,7** | Kabul-değiştirilmiş (`init` Ertele) |
| ÖN-19 | İlk kullanım ve panel deneyimi | 6 | 4 | 5 | **5,1** | Kabul-değiştirilmiş |
| ÖN-20 | `reply_to_incident` döngüsünün tamamlanması | 4 | 4 | 7 | **4,9** | Kabul-değiştirilmiş |
| ÖN-21 | Repro belirlenimciliği, yan etkiler, flaky | 5 | 5 | 3 | **4,4** | Kabul-değiştirilmiş (çoğu Ertele) |
| ÖN-23 | Saklama süresi, disk kotası, temizlik | 4 | 4 | 8 | **5,2** | Kabul-değiştirilmiş |
| ÖN-24 | Kayıt penceresi garantisi, yenileme, erken yakalama | 5 | 4 | 5 | **4,7** | Kabul-değiştirilmiş (kalıcılık Ertele) |
| **EK-B1** | Repro spec üretiminde kod enjeksiyonu (veri ≠ kod) | 7 | 9 | 9 | **8,2** | Kabul (yeni) |
| **EK-B2** | v1.0 kesim çizgisi ve efor bütçesi | 9 | 7 | 9 | **8,4** | Kabul (yeni) |
| **EK-B3** | Kaynak satırı çözümleme doğrulama spike'ı (React 19 + Next) | 7 | 7 | 8 | **7,3** | Kabul (yeni) |

**Tek cümlelik özet:** PM'in tespit ettiği sorunların neredeyse hepsi gerçek. Ancak önerilen çözümlerin toplam eforu kabaca **24 kişi-hafta** (6×S + 16×M + 3×L). Bu, 1–3 kişilik bir ekip için 2–6 aylık bir gecikme anlamına geliyor. Güvenlik ve ana vaat (kırmızı→yeşil) için gereken çekirdeği tutup geri kalanı daraltmayı ya da yol haritasına almayı öneriyorum. Değiştirilmiş kesim için tahminim **~9–11 kişi-hafta** (bkz. EK-B2).

---

## Birleştirilmesi gereken öneriler

| Birleşik başlık | Kaynak öneriler | Neden |
|---|---|---|
| **G1: Güvenlik ve tehdit modeli** (tek bölüm, tek tablo) | ÖN-01 + ÖN-02 + ÖN-03 + EK-B1 + ÖN-04 (NFR-PRIV-01) | Aynı saldırı zinciri: kötü site → sahte olay → ajan bağlamı → `run_repro` → kod çalıştırma. Zincirin her halkası ayrı bölümlerde ele alınırsa hangi halkanın kırıldığı görünmez. |
| **G2: Repro sonuç modeli ve yaşam döngüsü** | ÖN-08 + ÖN-06 (`error_precondition`) + ÖN-20 (`needs_info`) + ÖN-21 (`flaky`) + ÖN-16 (`WRONG_PROJECT`) | Dört öneri `ReproRun.status` ve olay durumuna birbirinden bağımsız değer ekliyor. Toplamda 8 koşu durumu ve 6 olay durumu çıkıyor. Tek bir model gerekli. |
| **G3: Sözleşmeler eki** | ÖN-11 + ÖN-12 + tüm hata kodları (ÖN-02, ÖN-12, ÖN-16, ÖN-18) | Hata kodu listesi şu an dört öneriye dağılmış. Tek liste ve tek şema kaynağı (koddan üretilen) olmalı. |
| **G4: Destek matrisi ve doğrulama** | ÖN-25 + ÖN-13 (fixture'lar) + ÖN-17 (FR-CFG-11) + ÖN-22 (R1, R4) + EK-B3 | "Neyi destekliyoruz" ile "neyi test ediyoruz" aynı tablo olmalı. |
| **G5: Ölçüm** | ÖN-09 + ÖN-10 (NFR-TOK) + FR-PKG-03 | %60 iddiası, token bütçesi ve benchmark aynı ölçüm tanımına dayanmalı. |
| **G6: Bağlantı durumu ve proje kimliği** | ÖN-16 + ÖN-18 (`doctor`) + ÖN-19 (FR-UI-10) | Üçü de `/health` ucuna ve `projectId`'ye dayanıyor. Tek uç ve tek gösterge yeterli. |
| **G7: Sunucu yönergeleri** | ÖN-03 (FR-MCP-SEC-01) + ÖN-12 (FR-MCP-13 `fix-incident` prompt'u) | İş akışı ve "olay içeriği talimat değildir" kuralı sunucu `instructions` alanında tek yerde verilsin. Prompt'lar istemcilerde tutarsız destekleniyor. |

---

## Madde madde gerekçeler

### ÖN-01 — Tehdit modeli ve localhost alıcısının sertleştirilmesi
**D 8 · R 9 · U 6 · Bileşik 7,7 · Kabul-değiştirilmiş**

Tehdit gerçek, maliyet bahanesiyle geçiştirilemez. Kullanıcının açtığı herhangi bir sekme `127.0.0.1:4747`'ye `text/plain` POST gönderip sahte olay yazabilir. Bu olay ÖN-03 ve EK-B1 ile birleşince kod çalıştırmaya giden bir zincir oluşur. Host başlığı doğrulaması, zorunlu Origin, kimlik regex'i ve boyut sınırı toplamda birkaç düzine satır kod; bunlar M (Must) olmalı. Öte yandan önerinin bazı parçaları gereksiz ya da pahalı:
- **Origin kontrolü tarayıcı saldırganı için tek başına yeterli.** Tarayıcı Origin başlığını sahteleyemez ve çapraz kökenli POST'larda (form, `no-cors` fetch dahil) bu başlığı gönderir. `X-Flashback-Client` başlığı ile preflight zorlaması gereksiz bir katman. `Content-Type: application/json` kontrolü ucuz bir derinlemesine savunma olarak kalabilir.
- **SEC-07 oturum belirteci eşleştirmesi** bundler eklentisi ya da kod girme gibi bir kullanıcı deneyimi gerektiriyor ve tarayıcı saldırganına karşı Host+Origin'in üstüne anlamlı bir katkısı yok. Aynı kullanıcıyla çalışan yerel süreçler `.flashback/` dosyalarını zaten okuyabilir; bu tehdit kapsam dışıdır ve öyle yazılmalıdır.
- **Dakikada 30 olay oran sınırı** yerine ÖN-23'teki disk/olay sayısı üst sınırı aynı işi görür (diski doldurma saldırısı).

**Değişiklik:**
- M olarak kalanlar: SEC-01 (Host, 421), SEC-02 yalnızca "Origin zorunlu ve izin listesinde + JSON content-type", SEC-03 (loopback dışı adres yalnızca açık bayrakla, belirteç şartı olmadan uyarıyla), SEC-04 (kimlik regex'i ve yol sınırı), SEC-05 yalnızca 413 boyut sınırı.
- S: SEC-06, yalnızca POSIX (0700/0600). Windows ACL çıkarılsın; klasör zaten kullanıcı profilinde.
- Ertele: SEC-07 (eşleştirme belirteci). FR-CFG-SEC-01 ÖN-18'e taşınsın.
- Tehdit modeli tek bir tablo olsun (saldırgan × tehdit × karşılık gelen FR), uzun bir bölüm değil. "Aynı kullanıcı yerel süreci" ve "kötü niyetli npm bağımlılığı" açıkça kapsam dışı yazılsın.
- Güvenlik test paketi (curl düzeyinde 6–8 birim/entegrasyon testi) mevcut CI matrisinde koşar; ayrı bir 3 işletim sistemi altyapısı gerekmez.

### ÖN-02 — `run_repro` assertions = keyfi kod çalıştırma
**D 7 · R 7 · U 4 · Bileşik 6,1 · Kabul-değiştirilmiş**

Sorun gerçek, ama risk PM'in anlattığından biraz düşük. Dosya düzenleme izni olan bir ajan, dev sunucusunun yeniden yüklediği bir dosyayı (ör. `vite.config.ts`, API route) değiştirerek de kod çalıştırabilir. Asıl risk, kullanıcının `run_repro`'yu otomatik onaylaması ve prompt injection ile birleşmesi. Önerilen çözüm ise teknik olarak kırılgan: PM'in metni allowlist ile denylist'i karıştırıyor ("`require`, `process` … reddedilir"). Denylist JavaScript'te tutmaz. Örnekler:
- `target.constructor.constructor('return process')()`
- `expect['const'+'ructor']`
- Allowlist'te kalan güçlü Playwright API'leri: `page.context().request.get('http://intranet/…')` (SSRF), `locator.setInputFiles('/home/u/.ssh/id_rsa')` (yerel dosyayı uygulamaya yükleme), `page.exposeFunction`, `page.route`.

Sağlam bir AST allowlist'i bunların hepsini kapatmalı, sürekli bakım ister ve kenar durumlarda kırılır.

**Daha basit alternatif:** Assertion'ı kod olarak değil, **yapılandırılmış veri** olarak almak. Örnek: `assertions: [{ on: "target" | {role,name} | {text} | {css}, matcher: "toHaveText", expected: "1380 ₺", not?: false }]`. Matcher'lar kapalı bir listeden seçilir: `toHaveText`, `toContainText`, `toBeVisible`, `toBeHidden`, `toHaveValue`, `toHaveCount`, `toHaveAttribute`, `toHaveClass`, `toHaveURL`. Kod `JSON.stringify` ile üretilir. Bu yaklaşım tasarım gereği güvenli, AST ayrıştırıcısı gerektirmiyor ve ajanlar JSON'u kodla aynı kolaylıkla yazıyor. Kısıtsız kod dizesi, geliştiricinin açıkça verdiği `FLASHBACK_ALLOW_UNSAFE_ASSERTIONS=1` arkasında kalır.

**Değişiklik:**
- SEC-01 → yapılandırılmış assertion DSL'i (M). README'deki örnek, v1.0 öncesi kırıcı değişiklik olarak güncellenir.
- SEC-02 → S olarak kalır (kaçış kapısı).
- SEC-03 (`base_url` için loopback/izin listesi; `file:`, `data:`, `javascript:` reddi), SEC-04 (annotation'lar ve açıklama metni) ve SEC-05 (zaman aşımı) M olarak kalır.
- "Çalışma dizini `.flashback/repro/` ile sınırlıdır" ifadesi bir sandbox değil; bir güvence gibi yazılmasın.

### ÖN-03 — Prompt injection önlemleri
**D 6 · R 7 · U 5 · Bileşik 6,0 · Kabul-değiştirilmiş**

Tehdit gerçek, ama dürüst olmak gerekirse Flashback tarafında **güvenilir bir azaltım yok**. Elimizdeki araçlar sınırlayıcılar ve etiketleme; bunlar olasılığı azaltır ama garanti vermez. Asıl kontrol ÖN-01 (sahte olayı engellemek) ve ÖN-02/EK-B1 (enjeksiyon başarılı olsa bile `run_repro` üzerinden kod çalışmaması). Bu yüzden ucuz kısımlar M olarak alınmalı, pahalı ve belirsiz kısımlar çıkarılmalı:
- **SEC-04 sezgisel tespit** ("ignore previous instructions" kalıpları) hem kolayca atlatılır hem de yanlış bir güven duygusu yaratır. Ret.
- **Kabul kriterindeki kırmızı takım** (2 ajan × 10 koşu) bir ürün kabul kriteri değil, model davranışı ölçümü. Belirlenimci değil, Cursor'da otomatikleştirilemez ve her model sürümünde sonuç değişir.

**Değişiklik:**
- M: SEC-01 (çitli bloklar ve çit uzatma; kaçış için birim testi), SEC-03 (not ayrı başlıkta), SEC-02 sadeleştirilmiş hâliyle (köken ve Flashback sürümü; "eşleştirme durumu" SEC-07 ertelendiği için çıkar).
- FR-MCP-SEC-01 → G7 sunucu `instructions` alanı.
- Ret: SEC-04.
- Kabul kriteri: rapor şablonu snapshot testi ve çit kaçışı birim testi. Kırmızı takım denemesi yalnızca sürüm öncesi elle yapılan bir kontrol olarak bilgi amaçlı kalır.

### ÖN-04 — H5/NFR-03 düzeltmesi ve gönderim önizlemesi
**D 8 · R 7 · U 6 · Bileşik 7,1 · Kabul-değiştirilmiş**

H5 metninin düzeltilmesi neredeyse bedava ve zorunlu; yanlış bir gizlilik beyanı, halka açık bir sürümde itibar ve hukuk riski demek. NFR-PRIV-01 (telemetri yok) ve `redact=false` uyarı şeridi de ucuz. Önizleme değerli, ama önerilen biçimi (değer bazında vurgulama, bölüm bazında hariç tutma, hash eşitliği kriteri) bir haftalık UI işi. Daha ucuz biçim: gönderilecek Markdown raporu, salt okunur olarak ve gizleme sayacıyla gösterilir. Önizleme zaten gönderilecek nesneyi render ettiği için hash eşitliği testine gerek kalmaz.

**Değişiklik:**
- M: H5 yeni metni, NFR-PRIV-01, FR-RED-13 (uyarı şeridi), FR-UI-09 sade hâliyle (gönderilecek raporun salt okunur önizlemesi ve `[REDACTED:*]` sayacı; "bir daha gösterme" seçeneği).
- S: Bölüm bazında hariç tutma (ağ gövdeleri, DOM, store için onay kutuları).
- Ret: Değer bazında vurgulama ve hash eşitliği kabul kriteri.
- README ve tanıtım sitesindeki ifadeler aynı PR'da düzeltilir.

### ÖN-05 — Gizleme kapsam matrisi ve ölçülebilir doğruluk
**D 7 · R 8 · U 4 · Bileşik 6,4 · Kabul-değiştirilmiş**

Burada **gerçek bir boşluk var**. `maskAllInputs=false` (varsayılan) iken giriş değerleri rrweb olay akışında ve adımlarda duruyorsa ve gizleme yalnızca "JSON, form, URL, props" alanlarına uygulanıyorsa, `get_incident_events` H5'i doğrudan deliyor. Bu bir M. Ancak matris, alan alan uygulanan bir gizlemeyi varsayıyor. Daha basit ve daha sağlam yol iki kural:
1. **Gönderimden önce yükün tamamı üzerinde jenerik derin gezinme.** Her nesne anahtarına anahtar adı kuralı, her metin değere desen/sağlama kuralı uygulanır. Bu durumda matris "tüm metin alanları" tek satırına iner; geriye yalnızca istisnalar kalır.
2. **Giriş değerleri kayıt anında maskelenir.** Bunun için rrweb'in `maskInputFn(text, element)` kancası kullanılır. Böylece anahtar adı kuralı `element.name`, `type` ve `autocomplete` özniteliklerine uygulanabilir. Rrweb olay akışında düğüm kimliğinden alan adına sonradan eşleme yapmaya gerek kalmaz.

**500 örneklik derlem:** Kim hazırlayacak? Luhn/IBAN/TCKN pozitifleri ve sır biçimleri birkaç satırla üretilebilir. Ancak kendi ürettiğimiz sentetik veride "%99 duyarlılık" ölçmek döngüsel; yeni bir bilgi vermez. Değerli olan, gerçekçi negatifler (tutar, sipariş no, tarih, kupon) ve gerçek dünyadan gelen hata örnekleri.

**Değişiklik:**
- M: FR-RED-09 yukarıdaki iki kuralla (matris kısa bir istisna tablosuna iner: ör. ekran görüntüsü piksel düzeyinde gizlenmez, yalnızca maskelenir). FR-RED-10 (kapalı ve sürümlü liste, büyük/küçük harf ve ayraç normalizasyonu; kullanıcı eklemesi açık kalır). FR-RED-11 (Playwright `mask`, ucuz). FR-RED-12 (`data-flashback-mask/block`; rrweb'in `blockClass`/`maskTextClass` seçenekleriyle neredeyse bedava, S yerine M yapılabilir).
- FR-RED-14 → tablo güdümlü fixture testi, yaklaşık 150 örnek: üretilmiş pozitifler, elle seçilmiş negatifler ve demo değerleri. Kriter "tüm fixture'lar geçer" ve "korunan değerlerde sıfır yanlış pozitif" olsun. Yüzde eşikleri çıkarılsın. Derlem yeni hata bildirimleriyle büyür.
- Açık soru (telefon numarası) kalsın. Benim önerim: varsayılan **kapalı**, çünkü sipariş/telefon karışıklığı yüksek yanlış pozitif üretir.

### ÖN-06 — Repro başlangıç durumu ve kimlik doğrulama
**D 9 · R 8 · U 4 · Bileşik 7,2 · Kabul-değiştirilmiş**

PM'in en önemli tespiti bu. Giriş gerektiren her gerçek uygulamada `run_repro` giriş sayfasına düşer ve "kırmızı" aslında yanlış bir kanıt olur. H3, demo dışında çalışmaz. Kapsam dışı bırakılırsa ana vaat bozulur; ertelenemez. Ama L efor gerekmez:
- **`storageState`** Playwright'ın yerel özelliği. `npx playwright codegen --save-storage=.flashback/auth.json` ile tek komutta üretilir ve `FLASHBACK_STORAGE_STATE` ile verilir. Bu yaklaşık S eforunda.
- `flashback.setup.ts` kancası projeye kod yürütme yolu açar ve bakım yükü getirir. Ertele.
- FR-REPRO-11'deki "pencereden önce oluşmuş durumu algılama" sezgisel ve tanımsız. Yerine basit ve belirlenimci bir kural: başlangıç URL'sine gidildikten sonra son URL farklıysa (yönlendirme) ya da ilk adımın seçicisi zaman aşımına düşerse koşu `error` olur ve `kind: "precondition"` alır.
- Ajanın `setup` adımları geçmesi de ertelensin. Eklenirse ÖN-02'deki yapılandırılmış DSL ile sınırlanmalı, yoksa kod çalıştırma kapısı yeniden açılır.

**Değişiklik:**
- M: FR-REPRO-09 (başlangıç URL'si, viewport, `locale`, saat dilimi; storage ve çerez **adları**), FR-REPRO-10 yalnızca (a) `storageState`, FR-REPRO-12 yukarıdaki belirlenimci kuralla.
- Ertele: (b) setup kancası, FR-REPRO-11 sezgisel algılama.
- Fixture: Ayrı bir uygulama yerine **mevcut demoya basit bir giriş rotası** eklensin. Kabul kriteri PM'deki gibi kalır.
- Not: `storageState` dosyası gerçek oturum belirteci içerir. `.flashback/` altında ve gitignore'lu olmalı; dokümanda belirtilmeli.

### ÖN-07 — Gizlenmiş girişler için sentetik değer
**D 6 · R 5 · U 6 · Bileşik 5,7 · Kabul-değiştirilmiş**

Gerçek bir etkileşim hatası: `[REDACTED:email]` metni forma yazılırsa doğrulama kalır ve yanlış bir kırmızı oluşur. Ancak bu durumun en sık örneği giriş formu, o da ÖN-06'daki `storageState` ile büyük ölçüde ortadan kalkıyor. Kalan durumlar için tür bazlı küçük bir tablo yeterli.

**Değişiklik:**
- M, efor M yerine S: e-posta → `flashback+n@example.test`, kart → Luhn'a uygun test kartı, TCKN ve IBAN → algoritmaya uygun sahte numara, parola → `process.env.FLASHBACK_PASSWORD` (tek değişken; `FLASHBACK_INPUT_<n>` numaralandırması kırılgan), diğer → `"flashback-placeholder"`.
- FR-REPRO-14 (sentetik değer kullanan adımların listesi) ucuz; kalır.
- FR-RED-15, tarayıcıda gizlemenin doğal bir değişmezi. `grep` testi iyi ve ucuz; kalır.

### ÖN-08 — Kırmızı→yeşil kuralının bağlayıcı olması
**D 9 · R 8 · U 6 · Bileşik 7,8 · Kabul-değiştirilmiş**

Ürünün ana vaadi bu. `assertionsHash` fikri ucuz ve doğru; yeşil sonucun assertion gevşetilerek oyunlanmasını kapatıyor. `mark_fixed`'in reddetmek yerine `fixed_unverified` ile kapatması da doğru bir seçim; ret ajanları döngüye sokardı. Benim itirazım durum patlamasına: ÖN-08, 06, 20 ve 21 birlikte 8 koşu durumu ve 6 olay durumu, artı bir geçiş tablosu üretiyor. Hepsinin panelde, raporda ve testlerde karşılığı olmak zorunda.

**Değişiklik:**
- **Koşu sonucu:** `status: "failed_assertion" | "passed" | "error"` ve `errorKind: "precondition" | "selector" | "timeout" | "server_down" | "syntax" | "rejected"`. Yalnızca `failed_assertion` kırmızı sayılır. Ajan ve UI için 3 değer yeterli; ayrıntı `errorKind`'da.
- **Olay durumu:** `open | closed` ve `resolution: "verified" | "unverified" | "cannot_reproduce"`. "Reopen" işlemi durumu `open`'a döndürür, ayrı bir `reopened` durumu gerekmez. `needs_info` gerekli değil (bkz. ÖN-20).
- **Hash kapsamı:** Hash yalnızca assertion metnini değil, koşu imzasını kapsamalı: normalize edilmiş assertion + `strict` + adım seti sürümü. Aksi hâlde ajan kırmızıyı `strict:true`, yeşili `strict:false` ile koşarak oyunlayabilir.
- FR-REPRO-16 (ilk koşu yeşil → "yeniden üretilemedi" yorumu) ucuz; M kalır.
- Kabul kriterlerindeki dört e2e senaryosu aynen kalır.

### ÖN-09 — İzlenebilirlik, ölçülebilir hedefler, ölçüm planı
**D 6 · R 5 · U 2 · Bileşik 4,5 · Kabul-değiştirilmiş (benchmark Ertele)**

İzlenebilirlik sütunu ve metrik tanımları ucuz ve gerekli. Asıl sorun benchmark'ın maliyeti, ki PM bunu "L" diye geçiyor:
- 20 hata × 3 ajan × 3 tekrar × 2 koşul (Flashback'li/Flashback'siz) = **360 ajan koşusu**.
- Koşu başına 50–200 bin token ile kabaca **20–70 milyon token**. API maliyeti yüzlerce dolar; abonelik kotasıyla günler sürer.
- Cursor ve Codex'i başsız ve tekrarlanabilir koşturmak ayrı bir altyapı işi.
- "Flashback'li" koşuların her biri için birinin olayı işaretlemesi gerekiyor; ya bir insan yapacak ya da programatik olay üretimi yazılacak.
- 20 gerçekçi tohumlanmış hata hazırlamak tek başına 2–3 hafta.

Bunun v0.2 onayının ön koşulu yapılması sırayı tersine çeviriyor: FRD onayı ölçüme bağlanmamalı, ölçüm v1.0 öncesine bağlanmalı.

**Değişiklik:**
- M (S efor): Her FR'ye "Hedef" sütunu. M1–M8 tanımları hedef değerleriyle birlikte "kalibre edilecek" notuyla yazılır.
- v1.0 öncesi **mini benchmark**: 8–10 hata, yalnızca Claude Code (`claude -p` ile başsız), 2 koşul × 3 tekrar ≈ 60 koşu. Yalnızca M1 (ilk turda doğru dosya) ve M3 (ilk tur token'ı) ölçülür.
- "%60" iddiası mini benchmark sonucu gelene kadar pazarlama metninden çıkarılır ya da "tek demo hatasında" diye nitelenir. Bu bedava ve dürüst.
- Ertele: Tam benchmark (3 ajan, 20 hata), `.flashback/stats.json` (telemetri olmadan kimse görmeyecek; yerel istatistiğin kime faydası olduğu belirsiz), M7 için resmî kullanılabilirlik testi (3–5 kişilik gayriresmî oturum yeterli).

### ÖN-10 — Sayısal NFR'ler
**D 6 · R 5 · U 5 · Bileşik 5,4 · Kabul-değiştirilmiş**

Sayısal NFR'ler doğru bir talep, ama bazı değerlerin dayanağı yok ve bazı ölçümler CI'da güvenilir değil:
- **NFR-TOK-01 (4.000 token) neye göre?** Ne demo raporunun bugünkü boyutu ne de istemci sınırları gerekçe olarak verilmiş. Claude Code MCP çıktısında yaklaşık 10 bin token'da uyarıyor, varsayılan üst sınır 25 bin. Gerçek bir hatada yığın + adımlar + ilgili ağ kayıtları 4 bin token'a sığmazsa ajan ek araç çağrısı yapar; bu da tur sayısını artırarak H4'e ters düşer. Doğru yaklaşım: önce demo ve mini benchmark olaylarında raporun boyutunu ölçmek, sonra bütçeyi belirlemek (muhtemelen 6–8 bin token) ve belirlenimci kırpma ile devam işaretçisi zorunlu kılmak.
- **INP p75 ölçümü** paylaşımlı CI çalıştırıcılarında gürültülü ve sürekli kırmızı/yeşil arasında gidip gelir. Bunun yerine sürüm öncesi yerel bir bench betiği koşulsun: 5.000 düğümde tam anlık görüntü süresi ve heap.
- **Boyut sınırları** (gövde 64 KB, olay 5 MB, DOM 1 MB) hem ucuz hem güvenlik açısından gerekli (ÖN-01'deki 413). Bunlar M.
- **Node:** ≥22 doğru; Node 20'nin ömrü Nisan 2026'da doldu.
- **Kayıt tarayıcıları:** Chrome/Edge ve Firefox (Playwright projeleriyle e2e) doğrulanır. Safari "en iyi çaba" olarak işaretlenir; macOS CI'da WebKit ile kısmen test edilebilir. Dört tarayıcının son 2 sürümü için resmî destek beyanı küçük bir ekip için fazla.

**Değişiklik:**
- M: NFR-SIZE-01, NFR-REPRO-01, NFR-05 (revize), NFR-MEM-01 (yerel bench ile).
- S: NFR-PERF-01 yerel bench ile; INP yerine checkout süresi ve long task sayısı.
- NFR-TOK-01'in değeri ölçümle belirlenir; kırpma ve devam davranışı M.
- NFR-LAT-01 hedef olarak kalsın, otomatik ölçüm şart değil.
- NFR-06/07'nin taşınmasına katılıyorum.

### ÖN-11 — Olay JSON şeması, sürümleme, HTTP API
**D 7 · R 6 · U 7 · Bileşik 6,7 · Kabul-değiştirilmiş**

İki ayrı npm paketi arasındaki sözleşme bu. Paketler farklı sürümde kurulduğunda sessiz bozulmayı önlüyor ve alıcıda şema doğrulaması aynı zamanda güvenlik katmanı oluyor. Değeri yüksek. Ancak elle yazılmış bir JSON Schema'yı TypeScript tipleriyle senkron tutmak bakım yükü getirir.

**Değişiklik:**
- Şema **tek kaynaktan** (zod/typebox) türetilir. JSON Schema dosyası build sırasında üretilir; FRD ekinde tekrarlanmaz, bağlantıyla verilir.
- **N/N-1 uyumluluğu:** v1.0'da N-1 yok. Kural şöyle sadeleşsin: `schemaVersion` taşınır; alıcı bilinmeyen bir ana sürümü 400 ve açık bir mesajla reddeder; panel `/health` üzerinden sürüm uyumsuzluğunu gösterir. Geriye uyumluluk testi v1.1'de, ilk şema değişikliğiyle birlikte gelir.
- FR-PKG-06 (tek zaman tabanı, UTC) ve FR-RCV-10 (uç listesi) aynen kabul.

### ÖN-12 — MCP araç sözleşmeleri
**D 7 · R 6 · U 6 · Bileşik 6,4 · Kabul-değiştirilmiş**

Hata kodları ve öneri metinleri ajanın kendi kendine toparlanmasını sağlıyor. Değeri yüksek, eforu düşük. Diğer parçalar daraltılabilir:
- **`inputSchema`** MCP SDK'da zaten zorunlu.
- **`outputSchema` ve `structuredContent`** spesifikasyonda isteğe bağlı. Bildirilirse sunucu her yanıtta şemaya uymak zorunda kalır, bu da bakım yükü getirir. Ajanlar ise pratikte metni okuyor. S.
- **`cursor` sayfalaması** en fazla 200 olay (ÖN-23) için gereksiz; `limit` ve `status` filtresi yeterli.
- **FR-MCP-13 prompt'u** → G7 sunucu `instructions`.
- **FR-MCP-14 `portable` çıktısı:** S olarak kalsın. FR-REPRO-08'in "olduğu gibi taşınabilir" iddiası ise hemen yumuşatılsın: "başlangıç noktasıdır; projenin `baseURL`/`webServer` ayarlarına uyarlanması gerekebilir". Çelişki bedavaya kapanır.

**Değişiklik:**
- M: FR-MCP-10 (hata kodları, G3'te birleşik), FR-MCP-11 (yalnızca `limit` ve çıktı kırpma), FR-MCP-12 (görüntü fallback'i).
- S: FR-MCP-09 (`outputSchema`), FR-MCP-14.
- Kabul kriteri: şema snapshot testi ve MCP Inspector ile kontrol. Cursor ve Codex smoke testleri sürüm kontrol listesinde **elle** yapılır; otomasyon beklenmesin.

### ÖN-13 — Kabul kriterleri ve fixture uygulamaları
**D 7 · R 6 · U 4 · Bileşik 5,8 · Kabul-değiştirilmiş**

Her M gereksinim için kabul kriteri yazmak ucuz ve gerekli; buna tamamen katılıyorum. Pahalı olan **4 yeni fixture uygulaması**: next-app, webpack, vue ve auth. Her biri ayrı bağımlılık ağacı, ayrı e2e testi ve ayrı CI süresi demek; üç işletim sistemi matrisinde CI süresi kabaca ikiye katlanır.

**Değişiklik:**
- M: Her M gereksinim için doğrulanabilir bir kriter yazılır. Demo senaryolarının beklenen kanıtları kesinleştirilir ve README'deki karışık YAZ10/KIS20 örneği düzeltilir (bedava).
- **Fixture'lar:** (1) mevcut Vite demo + giriş rotası (ÖN-06), (2) **Next App Router** (React'te en yaygın kurulum). İkisi yeterli.
- **webpack ve Vue:** v1.0'da "doğrulanmamış / en iyi çaba" olarak işaretlenir (ÖN-25). FR-MARK-06'nın kabul kriteri, MARK-06 ile birlikte S olarak kalır; bir Vue demosu olmadan M sayılamaz.
- KK-5 elle smoke testi olur. KK-6 kabul. KK-7 yalnızca M NFR'leri kapsar. KK-8 mini benchmark'a bağlanır.
- FR-MARK-01 için "30 seçimde ≥%95" kriteri iyi; iki fixture üzerinde uygulanır.

### ÖN-14 — Hata ve uç durum kataloğu
**D 7 · R 6 · U 4 · Bileşik 5,8 · Kabul-değiştirilmiş**

Tablo bir FRD için değerli, ama "her satır bir FR ve otomatik test" kuralı 14 ayrı özellik demek. Bunları üç gruba ayırıyorum.

**v1.0 M (ucuz ve sık karşılaşılan):**
- Öğe canlı DOM'da yok → `resolution: ancestor | unresolved`.
- Source map çözülemiyor → `resolved:false`.
- CSP engeli → açık hata mesajı ve pano fallback'i (`fetch` TypeError'dan tespit edilir).
- Pano yok → `.md` indirme.
- Eşzamanlı `run_repro` → olay bazında kilit ve `BUSY` hatası.
- `base_url` öncelik sırası.
- Birden çok sekme → olaya `tabId` eklenmesi.
- **Akış yanıtları (SSE/ReadableStream) bozulmamalı.** Bu bir kenar durum değil, doğruluk hatası: Flashback uygulamanın kendi davranışını bozarsa güven sıfırlanır. Kesinlikle M.

**S:**
- HMR satır kayması için ±3 satırlık kod parçası. H2'ye doğrudan katkısı var ve ucuz.
- "Panel açıktı" işaretçisi.

**Ertele ya da yalnızca dokümantasyon:**
- Alıcı kapanınca sessionStorage kuyruğu. Pano fallback'i zaten var; ikinci bir kurtarma yolu gereksiz.
- Shadow DOM seçici kuralları.
- WebSocket: kapsam dışı yazılır.
- WSL/Docker/uzaktan geliştirme: kapsam dışı ya da "belgelenmiş geçici çözüm".

**Değişiklik:** Tablo FRD'ye girer. Her satıra "v1.0 / S / Ertele" etiketi konur ve otomatik test şartı yalnızca v1.0 satırlarına uygulanır.

### ÖN-15 — Öğesiz hatalar ve çoklu kanıt seçimi
**D 8 · R 6 · U 6 · Bileşik 6,8 · Kabul-değiştirilmiş**

Doğru tespit. KK-1 KIS20'yi istiyor ama model bunu ifade edemiyor. "Bir şeyin olmaması" türü hatalar da yaygın. `target = null` ile sayfa düzeyi olay oluşturmak ucuz ve M olmalı. "Birincil kanıt işaretçisi seçme" ise yeni bir UI etkileşimi. Daha ucuz alternatif: hedef yoksa rapor, işaretlenen ana en yakın ağ ≥400 yanıtlarını ve konsol hatalarını otomatik olarak en üste koyar. Bu çoğu durumda yeterli olur ve UI gerektirmez.

**Değişiklik:**
- M: FR-MARK-07 (assertion'larda `page`; ÖN-02 DSL'inde `on: {role…}`), otomatik birincil kanıt sıralaması.
- S: FR-MARK-08 (elle işaretçi seçimi).
- Ertele: FR-MARK-09 (çoklu ilgili öğe). Açık soru 1'in v1.0 yanıtı "hayır, tek öğe ya da öğesiz" olsun.

### ÖN-16 — Çoklu proje, port çakışması, olay klasörü
**D 6 · R 6 · U 5 · Bileşik 5,7 · Kabul-değiştirilmiş**

Risk gerçek. FR-RCV-04 port doluysa "çalışan sunucudan okur" diyor; bu, ajanın sessizce başka projenin olaylarını okuması demek. Codex'in global yapılandırması da `.flashback/`'ı ev dizinine yazdırabilir. Ancak FR-RCV-08 teknik olarak belirsiz: tarayıcı "proje adını" nereden bilecek? Bunun için bir bundler eklentisi gerekir.

**Daha basit alternatif:** Alıcı `/health` ucunda `projectId` ve proje adını döndürür. Panel bağlandığı projeyi gösterir (ÖN-19 FR-UI-10) ve geliştirici uyuşmazlığı görür. `flashback-mcp` port doluysa ve kimlik farklıysa **sessizce okumak yerine** `WRONG_PROJECT` hatasıyla başarısız olur.

**Değişiklik:**
- M: FR-RCV-07, FR-CFG-06 (yukarı doğru `package.json` arama; ev ve kök dizine yazma reddi).
- Mimari karar: **(a) proje başına port** ve `FLASHBACK_PORT` + `endpoint` ile açık yapılandırma. (b) makine genelinde yönlendirici Ertele.
- Ret/Ertele: FR-RCV-08 (bundler eklentisi gerekir).
- Kabul kriteri PM'deki gibi, iki demo örneğiyle.

### ÖN-17 — Varsayılanlar ve üretim koruması
**D 8 · R 8 · U 8 · Bileşik 8,0 · Kabul**

En iyi maliyet/fayda oranı bu öneride. `enabled` varsayılanının `true` olması, prop'u unutan herkesin rrweb'i ve gövde kaydını son kullanıcılara göndermesi demek. Son kullanıcının tarayıcısı `127.0.0.1:4747`'ye istek atmaya çalışır; Chrome'un Private Network Access uyarıları, bundle şişmesi ve gizlilik ihlali gelir. Bu açık bir risk. Uygulama notu:
- FR-CFG-08, `exports` alanının `production` koşulunu bir **yöntem** olarak dayatmamalı; gereksinim "üretim bundle'ında kaydedici kodu yoktur" olmalı. Koşullu exports Vite'ta ve webpack 5'te çalışıyor, ancak Turbopack ve bazı kurulumlarda doğrulanması gerekir.
- Daha taşınabilir bir uygulama: Bileşen içinde `if (process.env.NODE_ENV !== 'production') import('./recorder')` ile dinamik import. Bundler'lar ölü kodu eler.
- Kabul kriteri olan bundle analizi aynen kalsın.
- FR-CFG-11'deki webpack örneği yalnızca dokümantasyon olarak yer alır (ÖN-13).

### ÖN-25 — Destek matrisi, uygulanma durumu, kapsam dışı
**D 8 · R 6 · U 9 · Bileşik 7,7 · Kabul**

Kapsam şişmesine karşı en güçlü araç bu: "destekliyoruz" ile "test ediyoruz" arasındaki farkı görünür kılıyor. Hemen hemen bedava. "Durum" sütunu (Mevcut / Kısmi / Planlı) v1.0 kesim çizgisini (EK-B2) çizmenin ön koşulu. Kapsam dışı eklemelerine (sunucu logları, WebSocket içeriği, CI'da kayıt, RSC) tamamen katılıyorum. Tek uyarı: matris küçük tutulmalı. "Doğrulandı" hücresi CI işi gerektirdiği için her hücre bir maliyet; çoğu hücrenin "en iyi çaba" olması normaldir.

### ÖN-22 — Risk kaydı ve bağımlılık yönetimi
**D 5 · R 5 · U 8 · Bileşik 5,9 · Kabul-değiştirilmiş**

Risk kaydı ucuz ve faydalı. R1 (React iç API'leri) H2'nin tek dayanağı olduğu için en kritik risk; bunu EK-B3 ile somut bir doğrulamaya bağlıyorum. Azaltımdaki "Babel/SWC eklentisiyle `data-flashback-source`" kendi başına L bir özellik; yalnızca B planı olarak yazılmalı, v1.0 taahhüdü olarak değil.

**Değişiklik:**
- **R6:** MIT lisanslı, yerel çalışan bir geliştirici aracı için "hukuk görüşü" fazla. Yerine açık bir dokümantasyon uyarısı yazılsın ve ÖN-04'teki önizleme yeterli kabul edilsin.
- **R8 hemen yapılmalı:** `flashback-devtools` ve `flashback-mcp` npm adlarının uygunluğu bugün kontrol edilip adlar rezerve edilmeli (5 dakikalık iş, ama sürümü bloklayabilir). Yayında npm provenance ve 2FA zorunlu olsun.
- Risk tablosu 10 satırda kalsın. Her riske tek kişilik bir sahip atanır; bu ekip boyutunda zaten 1–3 kişi var.

### ÖN-18 — Gerçekçi kurulum, `init` ve `doctor`
**D 5 · R 4 · U 5 · Bileşik 4,7 · Kabul-değiştirilmiş (`init` Ertele)**

H6 metninin dürüstleştirilmesi bedava ve kabul. FR-REPRO-17 (Playwright veya Chromium yoksa açık hata kodu ve kurulum komutu) en sık destek talebini karşılıyor; ucuz, M. `init` ise her ajanın yapılandırma biçimini (Claude Code, Cursor, Codex; hepsi değişken) takip etmeyi gerektiriyor; kalıcı bir bakım yükü. Kopyala-yapıştır parçacıkları v1.0 için yeterli. `doctor` küçük tutulursa değerli olabilir.

**Değişiklik:**
- M: H6 yeni metni, FR-REPRO-17.
- S: `doctor` dört kontrolle (port ve `/health` projectId, Playwright sürümü, Chromium, dev sunucusuna erişim). CSP ve uzaktan ortam tespiti Ertele.
- Ertele: `init` (FR-CFG-12).
- Dokümandaki yapılandırmalarda sürüm sabitleme (FR-CFG-SEC-01) S olarak buraya taşınsın.

### ÖN-19 — İlk kullanım ve panel deneyimi
**D 6 · R 4 · U 5 · Bileşik 5,1 · Kabul-değiştirilmiş**

FR-UI-10 (kayıt ve alıcı durum göstergesi) ucuz ve sessiz başarısızlıkları görünür kılıyor; M. FR-UI-11'deki "Ne olmalıydı?" zorunlu alanı ucuz ve doğrudan assertion kalitesini besliyor; M. Kısayol: `event.code` eşlemesi ve metin girişinde tetiklenmeme ucuz, M. Windows'ta Alt+Shift'in giriş dilini değiştirmesi TR/EN klavye kullanan bir hedef kitle için gerçek bir sorun. Önerilen `Ctrl+Shift+Y` yerine tarayıcıların ayırdığı kısayollarla çakışmayan bir kombinasyon kısa bir denemeyle seçilsin.

**Değişiklik:**
- M: FR-UI-10, FR-UI-11, FR-UI-12.
- FR-UI-13: Shadow DOM yalıtımı, panel bugün yalıtılmamışsa M (stil sızıntısı ilk izlenimi bozar). Tam klavye ve ARIA S; axe'ta 0 kritik ihlal S.
- FR-UI-14: Halka açık npm sürümünde **varsayılan dil İngilizce** olmalı; TR ikinci dil olarak S. Tema S.
- Kullanılabilirlik testi: 3–5 kişiyle gayriresmî oturum. "5'ten 4'ü 3 dakikada" kriteri hedef olarak kalsın, sürüm kapısı olmasın.

### ÖN-20 — `reply_to_incident` döngüsü
**D 4 · R 4 · U 7 · Bileşik 4,9 · Kabul-değiştirilmiş**

Tespit doğru: ajan yanıtı okuyamıyor, akış yarım kalıyor. Ancak özellik ana akışın parçası değil, S öncelikli. `wait_seconds` ile uzun bekleme makul; yine de bazı MCP istemcileri uzun süren araç çağrılarını yaklaşık 60 saniyede kesiyor, bu yüzden üst sınır 60 olsun. XSS: panel React ile düz metin render ediyorsa zaten güvenli; gereksinim ve tek bir test yeterli.

**Değişiklik:**
- S: FR-MCP-15 (`wait_seconds` en fazla 60).
- M: FR-UI-15 (düz metin; ucuz güvenlik değişmezi).
- Ret: FR-LIFE-07'deki `needs_info` durumu (bkz. G2). Okunmamış mesaj bilgisi yalnızca bir rozettir.

### ÖN-21 — Repro belirlenimciliği, yan etkiler, flaky
**D 5 · R 5 · U 3 · Bileşik 4,4 · Kabul-değiştirilmiş (çoğu Ertele)**

- **`recorded` ağ modu (FR-REPRO-18):** Gizlenmiş gövdeleri geri oynatmak tanım gereği yanlış veri üretir (`[REDACTED]` içeren JSON uygulamayı bozar). Ayrıca `page.route` eşleme kuralları, sıralama ve zamanlama gibi kendi başına L bir konu. Ertele.
- **Yan etki uyarısı (FR-REPRO-19):** Kayıttaki POST/PUT/PATCH/DELETE isteklerini listelemek birkaç satır iş ve gerçek bir hasarı (çift sipariş, e-posta) önlüyor. M.
- **`repeat` (FR-REPRO-20):** Playwright'ın `repeatEach` seçeneğiyle ucuz. Ancak varsayılanın 2 olması her yeşil koşunun süresini 2–3 katına çıkarır. S, isteğe bağlı, varsayılan 1. Sonuçlar karışıksa `errorKind`/`flaky` ile doğrulanmamış sayılır (G2).

### ÖN-23 — Saklama, kota, temizlik
**D 4 · R 4 · U 8 · Bileşik 5,2 · Kabul-değiştirilmiş**

Disk birikimi ve diskte uzun süre kalan veri gerçek ama düşük bir risk. Üst sınırlar ÖN-01'deki disk doldurma saldırısını da kapatıyor. **Açık olayları 30 gün sonra otomatik silmek** ise kullanıcı açısından sürpriz bir veri kaybı.

**Değişiklik:**
- M: Sayı ve boyut üst sınırı (200 olay / 500 MB, en eski **kapalı** olaydan başlayarak silinir), kapalı olaylar için 14 günlük saklama.
- Açık olaylar otomatik silinmez; yalnızca sayı sınırı aşılırsa uyarı verilir.
- S: `prune` komutu.

### ÖN-24 — Kayıt penceresi, yenileme, erken yakalama
**D 5 · R 4 · U 5 · Bileşik 4,7 · Kabul-değiştirilmiş (kalıcılık Ertele)**

- **Pencere garantisi:** En ucuz düzeltme, son 3 dilimi tutmak. Bu bir yapılandırma değişikliği; bellek yaklaşık 1,5 katına çıkar ve NFR-MEM ile ölçülür. Alternatif olarak metin "30–60 sn" diye düzeltilebilir. Ben 3 dilimi öneriyorum, çünkü vaat zaten "60 saniye" diye yayılmış durumda. M, efor S.
- **Yenilemede kalıcılık (FR-REC-11):** sessionStorage sınırı yaklaşık 5 MB ve 60 saniyelik rrweb akışı bunu kolayca aşar. IndexedDB'ye sürekli yazmak ise performans maliyeti getirir ve NFR-PERF ile çatışır. Ertele (v1.1).
- **Erken yakalama (FR-REC-12):** Eklenti veya ayrı bir script gerekmez. `fetch`/XHR yamalaması bileşen montajında değil modül değerlendirmesinde yapılırsa ve dokümantasyon "`flashback-devtools`'u giriş dosyasında ilk import yapın" derse, ilk istekler de yakalanır. FR-REC-01 metni ve kabul kriteri buna göre hizalanır. M, efor S.

---

## Ek öneriler (PM'in kaçırdıkları)

### EK-B1 — Repro spec üretiminde kod enjeksiyonu: olay verisi asla koda gömülmez
**D 7 · R 9 · U 9 · Bileşik 8,2 · Kabul (yeni, M)**

ÖN-02 yalnızca `assertions` alanına bakıyor. Oysa `run_repro`, **olayın kendisinden gelen** adımları (seçiciler, giriş değerleri, URL'ler, tuşlar) bir `.spec.ts` dosyasına yazıp Node'da çalıştırıyor. ÖN-01'in tarif ettiği sahte olay, bu alanlara `'); require('child_process').execSync('…'); ('` gibi bir değer koyabilir. Üretici değerleri elle tırnaklıyorsa, assertion ne kadar kısıtlanırsa kısıtlansın kod çalışır. Ajan bu durumda zararsız görünen bir `run_repro` çağrısı yapmış olur. Bu, zincirin assertion'dan bağımsız ikinci bir halkası ve muhtemelen bugünkü kodda en ucuz kapatılacak açık.

> **FR-REPRO-SEC-06 (M):** Üretilen spec, olay verisini kod metnine gömmez. Adımlar ayrı bir JSON dosyasından (`.flashback/repro/<id>.steps.json`) okunur ya da her değer `JSON.stringify` ile serileştirilir. Seçiciler yalnızca `page.locator(<string>)` argümanı olarak kullanılır.
> **Kabul kriteri:** Seçici, giriş değeri ve URL alanlarına kod kaçışı denemeleri içeren bir fixture olay, `run_repro` ile çalıştırıldığında yan etki üretmez (işaret dosyası oluşmaz). `get_repro_script` çıktısı için de aynı test uygulanır.

Efor: S (1–2 gün). ÖN-01 ve ÖN-02 ile birlikte G1'e girer.

### EK-B2 — v1.0 kesim çizgisi ve efor bütçesi
**D 9 · R 7 · U 9 · Bileşik 8,4 · Kabul (yeni, FRD süreci)**

PM incelemesi "neyin eksik olduğunu" çok iyi söylüyor, ama "neyin v1.0'a girmeyeceğini" söylemiyor. Bu FRD'nin asıl işi tam olarak bu. Önerilerin PM eforlarıyla toplamı ≈ 6×S (~2,4 hafta) + 16×M (~16 hafta) + 3×L (≥6 hafta) ≈ **24 kişi-hafta**. 1–3 kişilik bir ekip için bu 2–6 ay demek ve "her şey M" yaklaşımı sürümü belirsiz bir tarihe erteler.

> **Öneri:** FRD'ye bir "§3.3 Sürüm kesimi" bölümü eklensin. Her gereksinim `v1.0 / v1.1 / Yol haritası` olarak etiketlensin (ÖN-25'teki "Durum" sütunuyla birlikte). v1.0 için bir efor tavanı konsun: **~10 kişi-hafta**. Tavanı aşan her yeni M, mevcut bir M'nin ertelenmesiyle dengelensin.

Bu turdaki kararlarıma göre v1.0 çekirdeği ve kaba eforu:

| Blok | İçerik | Efor (kaba) |
|---|---|---|
| G1 Güvenlik | ÖN-01 (değiştirilmiş), ÖN-02 (JSON DSL), ÖN-03 (çit ve instructions), EK-B1, ÖN-04 (sade önizleme) | ~3 hafta |
| Gizleme | ÖN-05 (derin gezinme, `maskInputFn`, fixture tablosu), ÖN-07 (S) | ~1,5 hafta |
| Ana vaat | ÖN-08 (sade model), ÖN-06 (`storageState` ve bağlam), ÖN-15 (`target=null`) | ~2 hafta |
| Sözleşme ve doğrulama | ÖN-11, ÖN-12 (daraltılmış), ÖN-13 (2 fixture), ÖN-14 (v1.0 satırları) | ~2,5 hafta |
| Ucuz ve yüksek getirili | ÖN-17, ÖN-25, ÖN-22, ÖN-16 (değiştirilmiş), ÖN-19 (M kısımları), ÖN-23, ÖN-24 (3 dilim, erken import), ÖN-18 (hata kodları) | ~1,5 hafta |
| Ölçüm | ÖN-09 mini benchmark, ÖN-10 M NFR'ler | ~1 hafta |
| **Toplam** | | **~11 kişi-hafta** (2 geliştiriciyle ~6 hafta) |

v1.1 / yol haritası: eşleştirme belirteci, setup kancası, `recorded` ağ modu, tam benchmark, `init`, yenilemede kalıcılık, çoklu öğe, webpack ve Vue fixture'ları, `outputSchema`, i18n.

### EK-B3 — Kaynak satırı çözümleme doğrulama spike'ı (React 19 + Next.js)
**D 7 · R 7 · U 8 · Bileşik 7,3 · Kabul (yeni, zaman kutulu 3 gün)**

H2 ("doğru dosya:satır ilk turda") tamamen FR-MARK-04'e dayanıyor. Bu gereksinim de belgelenmemiş `_debugStack` alanına ve tarayıcıda source map çözümlemesine bağlı. Bugün yalnızca Vite + React demosunda doğrulanmış. Next.js App Router (özellikle Turbopack dev sunucusu, `'use client'` sınırları ve RSC) kapsamda ilan edildi, ama orada `_debugStack` çerçevelerinin ve source map URL'lerinin aynı şekilde çözüleceği kanıtlanmadı. Çözülmüyorsa v1.0'ın en büyük vaadi en yaygın React kurulumunda çalışmıyor demektir. Bunu ÖN-25'teki matrisi doldurmadan önce öğrenmemiz gerekiyor.

> **Öneri:** v0.2 onayından önce 3 günlük zaman kutulu bir spike yapılsın. Kapsam: React 19.x güncel sürüm ve canary; Next 15/16 App Router + Turbopack; Next + webpack; Vite. Ölçüt: her kurulumda 20 rastgele öğe seçiminde doğru `dosya:satır` oranı. Sonuç destek matrisine ("Doğrulandı" ya da "Desteklenmiyor") ve R1'in olasılık değerine doğrudan yazılsın. Oran düşükse `data-flashback-source` eklentisi B planı olarak v1.1'e alınsın.

---

## PM'in onay bloklayıcıları hakkında tutumum (Tur 2 için not)

| PM bloklayıcısı | Tutumum |
|---|---|
| ÖN-01 | **Katılıyorum.** SEC-07 hariç. |
| ÖN-02 | **Katılıyorum, ama çözüm AST allowlist'i değil yapılandırılmış DSL olmalı.** EK-B1 de bloklayıcıya eklenmeli. |
| ÖN-03 | **Kısmen.** Çit ve instructions bloklayıcı; sezgisel tespit ve kırmızı takım kriteri değil. |
| ÖN-04 | **Katılıyorum.** Metin düzeltmesi bloklayıcı; önizleme sade hâliyle. |
| ÖN-08 | **Katılıyorum.** Sade durum modeliyle. |
| ÖN-06 | **Katılıyorum.** Yalnızca `storageState` ile. |
| ÖN-13 + ÖN-10 | **Kısmen.** Kabul kriterleri bloklayıcı; 4 fixture ve CI'da INP ölçümü değil. |
| ÖN-11 + ÖN-12 | **Kısmen.** Şema ve hata kodları bloklayıcı; `outputSchema` ve cursor sayfalama değil. |
| (yeni) | **EK-B2** (kesim çizgisi) ve **EK-B3** (spike) v0.2 onayından önce yapılmalı. |
