# Rewind FRD v0.1 — Öneri değerlendirmesi, Tur 2 (Ajan B)

| Alan | Değer |
|---|---|
| Rol | **Ajan B: Teslimat ve Mühendislik Şüphecisi** |
| Yanıtlanan | `03a-ajanA-tur1.md` (Ajan A, Tur 1) |
| Kendi Tur 1 dosyam | `03b-ajanB-tur1.md` |
| Tarih | 27.10.2026 |
| Formül | Bileşik = 0,4·D + 0,3·R + 0,3·U |

## 0. Yöntem düzeltmesi (önce bunu kabul ediyorum)

Tur 1'de puanları **PM'in yazdığı hâliyle** verdim, A ise büyük ölçüde **kendi değiştirilmiş kapsamına** göre puanladı. U puanlarımın sistematik olarak düşük çıkmasının ve bileşik puan farklarının çoğunun (13 öneride ≥1,0) ana nedeni bu. Nihai tablo bir v1.0 kapsam kararı olduğu için doğru yöntem A'nınki: **nihai puanlar, nihai kapsama verilmiştir.** Aşağıdaki güncellemelerin bir kısmı bu kalibrasyondan, bir kısmı A'nın gerçekten haklı olduğu içerik argümanlarından geliyor. Hangisinin hangisi olduğunu her maddede ayrıca belirttim.

---

## 1. Fark ≥1,0 olan ya da kararı farklı olan öneriler

Tablo sütunları: B1 = benim Tur 1 bileşik puanım, A1 = A'nın Tur 1 bileşik puanı, B2 = benim Tur 2 puanım.

### ÖN-01 — Localhost alıcısının sertleştirilmesi (B1 7,7 · A1 9,0 → B2 **8,7**)

**A'nın haklı olduğu yerler:**
- **GET uçlarında Origin.** Teknik ayrıntıya inince A'nın preflight/özel başlık savunması da benim "gereksiz katman" dediğim şey de yarı haklı çıkıyor. FR-RCV-04'teki ikinci `rewind-mcp` süreci (Node) alıcıya **Origin başlığı olmadan** erişiyor. Origin'i her yerde zorunlu tutarsak bu kullanım kırılır; Origin'siz isteğe izin verirsek tarayıcı dışı her şey geçer. Bunu doğru ayıran şey A'nın özel başlığı: tarayıcı, `X-Rewind-Client` gibi bir başlığı başka bir kökenden ancak CORS preflight ile gönderebilir ve biz preflight'ı reddediyoruz.
  - **Ortak kural:** (1) Her istekte Host doğrulanır. (2) Origin varsa izin listesinde olmalı; tüm uçlar için, GET dahil. (3) Origin yoksa `X-Rewind-Client` başlığı zorunlu. (4) Gövdeli isteklerde `Content-Type: application/json` zorunlu. Tur 1'deki "X-Rewind-Client gereksiz" görüşümü geri çekiyorum.
- **SEC-06 (POSIX izinleri) M olsun.** `chmod` tek satır. Kabul. Windows ACL konusundaki itirazım duruyor.
- **SEC-05 sayıları keyfi.** Kabul: "sınır vardır, yapılandırılabilir" yazılsın, değerler ölçümle belirlensin.
- **421 yerine "4xx".** Kabul.

**Savunduğum ve geliştirdiğim nokta, FR-CFG-SEC-01 (sürüm sabitleme):** A bunu M yapıyor. Katılıyorum, ama daha iyi bir yöntem var. Paket zaten devDependency olarak kuruluyor (FR-CFG-01). Dokümandaki yapılandırma `npx --no-install rewind-mcp` (ya da `node_modules/.bin/rewind-mcp`) kullanırsa sürümü **lockfile** sabitler ve registry her açılışta yeniden çözülmez. Sürümü yapılandırmaya yazmak kopyalanan snippet'lerin güncelliğini yitirmesine yol açar; bu yöntem buna gerek bırakmaz. M, efor S.

**Puan:** D 8→9 (zincirin tamamını kesiyor), R 9 (A'nın 10'una çıkmıyorum: saldırı, dev sunucusu açıkken kötü bir siteyi ziyaret etmeyi ve ajanın o olayı okumasını gerektiriyor), U 6→8 (kalibrasyon).

### ÖN-02 — `run_repro` assertions (B1 6,1 · A1 8,1 → B2 **7,4**)

A da PM metnindeki denylist hatasını tespit etmiş ve iki seçenek bırakmış: dar dilbilgisi allowlist'i ya da JSON DSL. Benim Tur 1 itirazım allowlist'in genel olarak kırılgan olmasıydı. Ancak A'nın tanımı (`await expect(<page|target>.<izinli locator zinciri>).<izinli matcher>(<literal>)` dışındaki her düğüm reddedilir) **gerçekten bir allowlist** ve böyle kapalı bir AST biçimi sağlamdır. İtirazımı daraltıyorum.

**Uzlaşma önerim:** İki biçimi birleştirmek.
1. Ajan Playwright sözdizimiyle yazar; README API'si korunur, ajanların alışkanlığı bozulmaz.
2. Sunucu metni dar dilbilgisiyle bir **ara temsile (IR, JSON)** ayrıştırır.
3. Kod **IR'den yeniden üretilir.** Ajanın yazdığı metin hiçbir zaman olduğu gibi çalıştırılmaz.
4. IR doğrudan JSON olarak da kabul edilir.

Bu yaklaşım A'nın kullanılabilirlik kaygısını ve benim "veri ≠ kod" ilkemi (EK-B1) aynı anda karşılıyor. İzin listesinde yalnızca locator döndüren yöntemler (`getByRole`, `getByText`, `getByLabel`, `getByTestId`, `locator`, `filter`, `nth`, `first`, `last`) ve kapalı bir matcher listesi bulunur. `setInputFiles`, `request`, `route`, `evaluate` ve `exposeFunction` dilbilgisi gereği hiç ifade edilemez. Nesne argümanlarında yalnızca literal değerli, hesaplanmamış anahtarlar kabul edilir ve `__proto__` reddedilir.

A'nın iki ek noktasına tamamen katılıyorum:
- Annotation'lar istemciler için yalnızca ipucudur; güvence değildir.
- Ajan `setup` adımları da aynı dilbilgisinden geçmelidir.

**Puan:** D 7→8, R 7→8 (A'nın otomatik onay ve izin atlatma argümanını kabul ediyorum; dosya düzenleme yoluyla da kod çalıştırılabildiği için R'yi 9'a çıkarmıyorum), U 4→6.

### ÖN-03 — Prompt injection (B1 6,0 · A1 8,0 → B2 **7,3**)

Kararlarımız neredeyse aynı: çitler, not ayrımı ve `instructions` M; ajan koşuları sürüm kapısı değil. İki noktada A'ya geçiyorum:
- **SEC-04:** Tur 1'de Ret demiştim, Ertele'yi kabul ediyorum. İleride bir sinyal olarak denenebilir.
- **Kırmızı takım fixture'ı:** Fixture'ın **var olması** ucuz ve EK-B1'in kod enjeksiyonu testiyle aynı dosyayı paylaşabilir.

D'yi 7'ye çıkarıyorum. Güvenilir bir azaltım olmadığı görüşümü koruyorum, ama ucuz önlemlerin olasılığı anlamlı biçimde düşürdüğünü kabul ediyorum.

### ÖN-04 — H5 düzeltmesi ve önizleme (B1 7,1 · A1 8,7 → B2 **8,4**)

**A haklı:**
- **Değer vurgulama ucuz.** `[REDACTED:*]` belirteçleri render edilen metinde bir regex ile işaretlenir; birkaç satır CSS. Tur 1'de "pahalı" dediğim yanlıştı.
- **Hash eşitliği testi.** Tur 1'de bunu totolojik bulmuştum. Ancak test, önizlemenin ileride farklı bir nesneyi (ör. gizleme öncesi hâli) render etmesine karşı bir **gerileme koruması**. Ucuz; kabul.
- **Her gönderimde zorunlu modal yerine** "ilk gönderimde açık, sonra tek tıkla erişilebilir" yaklaşımı H1 için doğru. Kabul.

**Puan:** D 9, R 8, U 8.

### ÖN-05 — Gizleme kapsamı (B1 6,4 · A1 8,1 → B2 **8,4**)

Bu bir sızıntı ve A'nın R 9'u doğru; R'yi 9'a çıkarıyorum. Derlem konusunda zaten uzlaştık: kürate edilmiş derlem, bilinen sır biçimlerinde %100, diğerlerinde gerileme kapısı, mutlak eşikler ilk ölçümden sonra.

**Kalan küçük fark:** A alan × yöntem matrisini M istiyor, ben derin gezinme öneriyorum. Bunlar birbirini dışlamıyor. **Matris FRD'de bir belge olarak kalsın; uygulama derin gezinme ve `maskInputFn` ile yapılsın.** Matris, istisnaları (ekran görüntüsü, ikili gövde) görünür kılar.

RED-12 M (ikimiz de), RED-13 ve RED-15 bu bölüme taşınır (A'nın birleştirmesi).

### ÖN-07 — Sentetik girişler (B1 5,7 · A1 7,0 → B2 **6,6**)

A'nın "yanlış kırmızıya giden ikinci yol" argümanı R'yi 7'ye çıkarmaya yetiyor; kabul. Alan bazında geçersiz kılma talebini de kabul ediyorum, yalnızca numaralandırmaya itirazım var. Ad bazlı anahtar kullanılsın: `REWIND_INPUT_<NORMALIZE_EDILMIS_ALAN_ADI>`, ör. `REWIND_INPUT_EMAIL`. `<n>` sıra numarası, kayıttaki adım sırası değiştiğinde kırılır.

D'yi 6'da tutuyorum: giriş akışlarının çoğu `storageState` ile ortadan kalkıyor.

### ÖN-08 — Kırmızı→yeşil (B1 7,8 · A1 9,1 → B2 **8,8**)

**A'ya geçtiğim nokta, durum modeli:** Benim `open|closed + resolution` önerim ile A'nın düz enum'u (`open`, `fixed`, `fixed_unverified`, `cannot_reproduce`) aynı bilgiyi taşıyor. Ancak düz enum, ajan ve panel için **tek alan** okumak demek. Kabul. `reopened` ayrı bir durum değil, `open`'a dönüş ve geçmiş kaydı olarak S.

**Sınıflandırma kuralı:** A'nın kuralı ("yalnızca `assertions` bloğundaki başarısızlık `failed_assertion` sayılır") benim `errorKind` önerimle aynı. FRD'ye bu cümleyle yazılsın.

**Benim eklemem, korunuyor:** Hash yalnızca assertion metnini değil, **koşu imzasını** kapsamalı: normalize edilmiş assertion IR'i + `strict` + adım seti sürümü. Aksi hâlde kırmızı koşu `strict:true`, yeşil koşu `strict:false` ile yapılarak sonuç oyunlanabilir.

**Puan:** D 10 (A haklı; ürünün kalbi), R 9, U 7.

### ÖN-09 — Ölçüm (B1 4,5 · A1 5,8 → B2 **6,1**)

Esasen uzlaştık: mini benchmark, mutlak hedefler ilk ölçümden sonra, onayın ölçüme bağlanmaması ve "%60" iddiasının n=1 olarak nitelendirilmesi. Puan farkı U kalibrasyonundan geliyor (2→6).

**Tek fark `.rewind/stats.json`:** A S diyor, ben Ertele. Dışa aktarma olmadan bu veriyi kimse toplayamaz ve geliştirici kendi dosyasına bakmaz. M4/M5 metriklerini mini benchmark zaten ölçüyor. Ertele görüşümü koruyorum; küçük bir fark, uzlaşmazlık listesine almıyorum.

### ÖN-10 — Sayısal NFR'ler (B1 5,4 · A1 6,7 → B2 **6,7**)

**A'nın teknik tespiti beni düzeltti:** `_debugStack` bir `Error.stack` metni ve V8, SpiderMonkey ve JavaScriptCore'da yığın biçimleri farklı. Firefox'u "Playwright ile doğrulanır" diye yazmam yanlıştı. Kayıt Firefox'ta çalışabilir, ama H2'nin çekirdeği (dosya:satır) orada ayrı bir ayrıştırıcı ister. **Chromium "Doğrulandı", Firefox/Safari "en iyi çaba"** olarak yazılsın. Kabul; bu bulgu EK-B3 spike'ının kapsamına da eklendi.

Diğer konularda uzlaştık: token bütçesi ölçümle belirlenir, INP yerine sürüm öncesi bench.

### ÖN-11 — Şema (B1 6,7 · A1 7,0; karar farkı) → B2 **7,3**, Kabul

A haklı. N/N-1 kuralını FRD'ye **politika olarak** yazmanın bugün bir maliyeti yok; testi v2 şemasıyla birlikte gelir. "Şema tiplerden üretilir, FRD'ye bağlantı verilir" notunda zaten uzlaştık. Kararımı Kabul'e çeviriyorum.

### ÖN-13 — Fixture'lar (B1 5,8 · A1 7,1 → B2 **7,1**)

Uzlaştık:
- Next App Router ve oturum fixture'ı M. Oturum fixture'ı, demoya eklenen bir giriş rotası olabilir; A bunu dışlamıyor.
- webpack S, Vue smoke testi S; yapılmazlarsa ilgili iddialar geri çekilir.
- KK-5 elle yapılır; KK-8 sürüm kapısı değil.

A'nın "doğrulanmamış destek iddiası yayımlanmaz" ilkesi benim ÖN-25 tutumumla aynı. Fark yalnızca U kalibrasyonundan geliyor.

### ÖN-14 — Uç durumlar (B1 5,8 · A1 7,1 → B2 **7,1**)

**A'ya geçtiğim nokta, HMR ±3 satır parçası M:** Ajan bir olayda birden çok düzenleme yaptığında, ya da geliştirici kodlamaya devam ettiğinde, sonraki okumalarda satırlar kayar. Parça ucuz ve H2'ye doğrudan hizmet ediyor.

**Sırayı değiştirdiğimiz noktalar:** `.md` indirme M'den S'ye (pano olmaması yalnızca güvenli olmayan bağlamda yaşanır; dar bir durum), `tabId` yalnızca bir alan. A'nın gruplamasını kabul ediyorum. sessionStorage kuyruğu S; yalnızca gizlenmiş hâli tutulduğu sürece zararsız.

### ÖN-15 — Öğesiz hatalar (B1 6,8 · A1 7,1; FR-MARK-08 M mi S mi)

Uzlaşmazlık listesinde, madde 3.

### ÖN-16 — Çoklu proje (B1 5,7 · A1 7,4 → B2 **7,0**)

**A haklı:**
- **Kökeni kaydetme ve eşleşmezse uyarma** benim Ret dediğim FR-RCV-08'in ucuz ve bundler gerektirmeyen bir hâli. S olarak kabul.
- Yanlış projede düzeltme riski R'yi 7'ye çıkarıyor.

R'yi A'nın 8'ine çıkarmıyorum: "veri sızıntısı" argümanı zayıf, çünkü iki proje de aynı kullanıcının, aynı makinenin ve büyük olasılıkla aynı ajan sağlayıcısının.

### ÖN-17 — Üretim koruması (B1 8,0 · A1 8,7; karar farkı) → B2 **8,7**, Kabul-değiştirilmiş

A'nın iki değişikliğini kabul ediyorum:
- FR-CFG-10'daki "README bu tablodan üretilir" ifadesi bir süreç dayatması; yerine "tutarlıdır; CI'da kontrol edilebilir (S)" yazılsın.
- `allowProduction` açıkken panelde kalıcı uyarı gösterilsin.

Benim "üretim koşullu exports bir yöntem olarak dayatılmasın" notum bu maddeye eklenir. R'yi 9'a çıkarıyorum: tek bir olay bile marka güvenini bitirir.

### ÖN-18 — `init` / `doctor` (B1 4,7 · A1 6,1 → B2 **6,0**)

Uzlaşmazlık listesinde, madde 2. Kararlarımız birbirinin tersi.

### ÖN-19 — Panel deneyimi (B1 5,1 · A1 6,1 → B2 **6,4**)

Uzlaştık. A'nın `Ctrl+Shift+Y` tespiti doğru; Firefox'ta İndirilenler penceresini açıyor (ben Tur 1'de bunu belirsiz bırakmıştım). Varsayılan kısayol ancak çakışma testinden sonra değiştirilsin. İngilizce varsayılan, TR ikinci dil S, tema Ertele: kabul.

### ÖN-20 — `reply_to_incident` (B1 4,9 · A1 6,9 → B2 **6,2**)

**A haklı:** Panel uygulamanın kökeninde çalışıyor. Prompt injection'dan türeyen bir ajan mesajı HTML olarak render edilirse uygulama kökeninde XSS olur. Bu, R'yi 4'ten 6'ya çıkarıyor. UI-15 koşulsuz M (Tur 1'de de M'ydi). `wait_seconds` üst sınırı 60 (uzlaştık).

`needs_info` için uzlaşmazlık listesine bakın, madde 4.

### ÖN-21 — Flaky ve yan etkiler (B1 4,4 · A1 6,4 → B2 **7,0**)

**A haklı ve bu önemli bir düzeltme.** Kesintili bir hatada "kırmızı → etkisiz düzeltme → şans eseri yeşil" yolu, H3'ün tam olarak önlemesi gereken **yanlış kanıtı** üretiyor. Maliyeti ise yalnızca kapanışı sağlayan yeşil için tek bir ek koşu (2,5–7,5 sn). Tur 1'de bunu "süre 2–3 katına çıkar" diye maliyet tarafından geçiştirmiştim; bu yanlıştı. **FR-REPRO-20 M:** `fixed` için ardışık 2 yeşil gerekir; karışık sonuç `fixed_unverified` olur.

Dürüstlük notu: Bu bir kanıt değil, olasılık azaltımı. %50 oranında tetiklenen bir hata için yanlış yeşil olasılığı %25'te kalır. Rapor ve panelde "2 ardışık geçiş" ifadesi kullanılsın, "kararlı" denmesin.

FR-REPRO-19 M ve FR-REPRO-18 Ertele konusunda uzlaştık.

### ÖN-22 — Risk kaydı (B1 5,9 · A1 6,9 → B2 **6,9**)

Uzlaştık: React canary CI işi ve zarif düşüş; Babel eklentisi Ertele; hukuk görüşü yerine açık uyarı. EK-A2 ile birleşir. Benim "npm adlarını hemen kontrol et ve rezerve et" maddem EK-A2'ye eklenir.

### ÖN-24 — Kayıt penceresi (B1 4,7 · A1 6,0 → B2 **6,0**)

Puanda uzlaştık. FR-REC-12 konusunda ise farklıyız; uzlaşmazlık listesinde, madde 5.

### Küçük farklar (<1,0, karar aynı)

- **ÖN-06:** A'nın "oturum çerezi ya da depolama anahtarı var ama `storageState` verilmemiş → uyarı" kuralı ucuz ve belirlenimci; kabul. Benim yönlendirme/seçici kuralımla birlikte uygulanır. B2: 8,1.
- **ÖN-12:** A'nın puanlarını kabul ediyorum (7,1). `list_incidents` sayfalaması: `limit` M, `cursor` S.
- **ÖN-23:** A "üst sınır silme değil uyarı tetiklesin, açık olaylar silinmez" diyor. Uzlaşma: üst sınır aşılınca **yalnızca en eski kapalı olaylar** silinir; yalnızca açık olaylar kalmışsa sınır uyarıya döner. Kapalı olaylar için saklama süresi 30 gün (A'nın değeri). `prune` M (ucuz; A'ya geçiyorum). B2: 5,9.

---

## 2. A'nın ek önerilerinin puanlanması

### EK-A1 — Assertion'ın geliştiriciye görünürlüğü ve notla bağı
**D 8 · R 7 · U 9 · Bileşik 8,0 · Kabul**

PM'in ve benim kaçırdığım gerçek bir boşluk. `assertionsHash` kırmızı ve yeşilin **aynı** testle yapıldığını kanıtlıyor; testin **doğru** olduğunu kanıtlamıyor. Gerçekçi bir oyunlama örneği: `expect(target).not.toHaveText('135030 ₺')`. Bu assertion önce kırmızı, sonra **yanlış bir düzeltmeyle de** yeşil olur (ör. toplam "0 ₺" gösterirse).

Kapsam:
- **FR-UI-16 (M):** Panelde not ile assertion yan yana gösterilir. Panelde koşu listesi zaten var; bu ucuz.
- **FR-MCP-SEC-02 (M):** `mark_fixed` çıktısında assertion ve not birlikte yer alır; `instructions` yönergesi eklenir.
- **FR-LIFE-08 (S):** Yeniden açma ve gerekçe; ÖN-20 kanalına bağlı.

**Benim eklemem (ucuz):** Assertion IR'i (ÖN-02) **olumsuzlanmış** matcher içeriyorsa (`not.toHaveText(...)`), rapor ve panel "negatif assertion: beklenen değeri doğrulamaz" uyarısı gösterir. Bu, IR üzerinde tek bir kontrol.

### EK-A2 — Yayın bütünlüğü ve tedarik zinciri
**D 6 · R 7 · U 8 · Bileşik 6,9 · Kabul (ÖN-22 R8 ile birleşik)**

Gerçekçi ve ucuz:
- CI'dan `--provenance` ile yayın (GitHub OIDC) ve 2FA: ~1 gün.
- `npm audit` sürüm kontrol listesinde.
- rrweb tam sürümle sabitlenir.
- NFR-SUP-03 (paket içeriği karşılaştırması): S. `release:check` zaten dosya listesi üretiyor; geriye beklenen listeyle karşılaştırmak kalıyor.

**Eklemelerim:** npm adlarının (`rewind-devtools`, `rewind-mcp`) hemen kontrol edilip rezerve edilmesi, `GITHUB_KULLANICI` yer tutucusunun kaldırılması ve `npx --no-install` ile lockfile sabitlemesi (bkz. ÖN-01). R 7: `rewind-mcp`, ajanın yanında dosya yazan ve tarayıcı başlatan bir süreç; ele geçirilirse etkisi yüksek.

### EK-A3 — Raporun başında "Kanıt güveni" bloğu
**D 8 · R 6 · U 8 · Bileşik 7,4 · Kabul**

H2 ve H4'e doğrudan hizmet ediyor: ajan zayıf kanıtla yanlış dosyayı düzenlemeden önce uyarıyı görür. Blok, ÖN-14/06/07/10/04'teki işaretlerin yalnızca **render edilmesi**; o işaretler zaten v1.0'da üretiliyorsa maliyeti düşük (~1–2 gün, snapshot testleriyle birlikte).

İki teknik koşulum var:
1. **Yalnızca v1.0'da gerçekten üretilen işaretler** listelensin. Boş ya da sabit "ok" satırları token israfıdır.
2. **"Köken doğrulaması" satırı çıkarılsın.** ÖN-01'den sonra alıcıya ulaşan her olay Origin kontrolünü zaten geçmiş olur; satır her zaman "ok" gösterir. Yerine yalnızca köken değeri gösterilsin.

Blok 7–8 satırı geçmemeli; NFR-TOK bütçesinden düşülür.

---

## 3. NİHAİ TABLO (Ajan B, Tur 2)

Puanlar nihai kapsama göre verilmiştir. Yerleşim: **M** = v1.0 Must, **S** = v1.0 Should, **YH** = yol haritası, **Ret**. Bir önerinin parçaları farklı yerlere düşüyorsa birincil yerleşim yazılmış, ayrıntısı kapsam sütunundadır.

| Kimlik | D | R | U | Bileşik | Nihai karar | v1.0 yerleşimi | Tek cümlelik nihai kapsam |
|---|---:|---:|---:|---:|---|---|---|
| ÖN-01 | 9 | 9 | 8 | **8,7** | Kabul-değiştirilmiş | M | Girer: Host doğrulama, "Origin varsa izin listesinde, yoksa `X-Rewind-Client` zorunlu" kuralı (GET dahil), JSON content-type, loopback dışı adres için bayrak, kimlik regex'i ve yol sınırı, yapılandırılabilir boyut/oran sınırı, POSIX 0700/0600, tek tablo tehdit modeli, dokümanda `npx --no-install`. Çıkar: eşleştirme belirteci (YH), Windows ACL. |
| ÖN-02 | 8 | 8 | 6 | **7,4** | Kabul-değiştirilmiş | M | Girer: Playwright sözdizimi dar dilbilgisiyle IR'e ayrıştırılır, kod IR'den yeniden üretilir, IR JSON olarak da kabul edilir; `base_url`/URL loopback ve izin listesi; zaman aşımı; açıklama metni ve annotation'lar; `setup` aynı dilbilgisinden geçer. Unsafe bayrağı C. |
| ÖN-03 | 7 | 7 | 8 | **7,3** | Kabul-değiştirilmiş | M | Girer: çitli bloklar ve çit uzatma, "talimat değildir" etiketi, notun ayrı başlıkta verilmesi, köken ve sürüm satırı, sunucu `instructions`, kırmızı takım fixture'ı (EK-B1 ile ortak). Çıkar: sezgisel tespit (YH), ajan koşularının sürüm kapısı olması. |
| ÖN-04 | 9 | 8 | 8 | **8,4** | Kabul-değiştirilmiş | M | Girer: H5 yeni metni (README ve site dahil), NFR-PRIV-01, `redact=false` şeridi, salt okunur önizleme (değer vurgulu, ilk gönderimde açık, sonra tek tık), hash eşitliği testi. Bölüm bazında hariç tutma S. |
| ÖN-05 | 9 | 9 | 7 | **8,4** | Kabul-değiştirilmiş | M | Girer: tüm yük üzerinde derin gezinme, kayıt anında `maskInputFn`, matris belge olarak (istisnaları gösterir), kapalı/sürümlü anahtar listesi, ekran görüntüsü maskesi, `data-rewind-mask/block`, kürate derlem (sırlarda %100, diğerlerinde gerileme kapısı). Çıkar: 500 örnek ve yüzde eşikleri. |
| ÖN-06 | 9 | 9 | 6 | **8,1** | Kabul-değiştirilmiş | M | Girer: başlangıç bağlamı (URL, viewport, `locale`, saat dilimi, depolama/çerez adları), `REWIND_STORAGE_STATE`, oturum işareti var ama `storageState` yoksa uyarı, yönlendirme/ilk seçici kuralıyla `precondition` sınıflandırması, demoya giriş rotası. Çıkar: `rewind.setup.ts` (YH). |
| ÖN-07 | 6 | 7 | 7 | **6,6** | Kabul-değiştirilmiş | M | Girer: tür bazlı geçerli sentetik değerler, `REWIND_INPUT_<ALAN_ADI>` geçersiz kılma, sentetik adım listesi; RED-15 ÖN-05'e taşınır. |
| ÖN-08 | 10 | 9 | 7 | **8,8** | Kabul-değiştirilmiş | M | Girer: yalnızca assertion bloğundaki başarısızlık kırmızı sayılır, `errorKind`, koşu imzası hash'i (IR + `strict` + adım sürümü), durumlar `open`/`fixed`/`fixed_unverified`/`cannot_reproduce`, gerekçe zorunlu, ayrı rozet. Yeniden açma S; `needs_info` durum değil. |
| ÖN-09 | 7 | 5 | 6 | **6,1** | Kabul-değiştirilmiş | S | Girer (M): "Hedef" sütunu, metrik tanımları, "%60"ın n=1 olarak nitelenmesi. Girer (S): Claude Code ile 8–10 hatalık mini benchmark, halka açık iddiaların kapısı. Çıkar: tam benchmark ve `stats.json` (YH), onayın ölçüme bağlanması. |
| ÖN-10 | 7 | 6 | 7 | **6,7** | Kabul-değiştirilmiş | M | Girer: NFR-SIZE, ölçümle belirlenen token bütçesi ve belirlenimci kırpma, repro zaman aşımı, NFR-MEM, Node ≥22, Chromium "Doğrulandı" ve Firefox/Safari "en iyi çaba". PERF ve LAT sürüm öncesi bench ile S. |
| ÖN-11 | 7 | 7 | 8 | **7,3** | Kabul | M | Girer: tiplerden üretilen şema (FRD'de bağlantı), `schemaVersion`, N/N-1 politikası, tek UTC zaman tabanı, alıcıda doğrulama, HTTP uç listesi. |
| ÖN-12 | 8 | 6 | 7 | **7,1** | Kabul-değiştirilmiş | M | Girer: birleşik hata kodu listesi ve öneri metni, `limit` ve çıktı kırpma, görüntü fallback'i, FR-REPRO-08 iddiasının yumuşatılması. S: `outputSchema`, `cursor`, `portable`, `fix-incident` (instructions'a birleşik). |
| ÖN-13 | 8 | 7 | 6 | **7,1** | Kabul-değiştirilmiş | M | Girer: her M gereksinim için test kimliğine bağlı kriter, Next App Router ve oturum fixture'ları, kesinleştirilmiş demo kanıtları, KK-5 elle. S: webpack fixture'ı ve Vue smoke testi; yapılmazlarsa iddia geri çekilir. |
| ÖN-14 | 8 | 7 | 6 | **7,1** | Kabul-değiştirilmiş | M | Girer (M): `ancestor/unresolved`, `resolved:false`, HMR ±3 satır ve hash, SSE/akış yanıtlarını bozmama, CSP mesajı, `run_repro` kilidi, `base_url` önceliği. S: `.md` indirme, sessionStorage kuyruğu, "panel açıktı" işaretçisi. Yalnızca belge: WSL/Docker, WebSocket, `tabId`. |
| ÖN-15 | 8 | 6 | 7 | **7,1** | Kabul-değiştirilmiş | M | Girer: `target=null` sayfa düzeyi olay, işaretlenen ana en yakın hataların otomatik olarak birincil kanıt sıralanması. Elle işaretçi seçimi koşullu M/S (uzlaşmazlık 3). Çoklu öğe YH. |
| ÖN-16 | 7 | 7 | 7 | **7,0** | Kabul-değiştirilmiş | M | Girer: `projectId`, `/health`, sessizce okumak yerine `WRONG_PROJECT`, klasör çözümleme ve ev/kök dizin reddi, proje başına port. S: köken kaydı ve uyuşmazlık uyarısı. Makine genelinde yönlendirici YH. |
| ÖN-17 | 9 | 9 | 8 | **8,7** | Kabul-değiştirilmiş | M | Girer: `NODE_ENV` varsayılanı, üretim bundle'ında kaydedici kodunun bulunmaması (yöntem dayatılmadan), `allowProduction` ve kalıcı uyarı, varsayılanlar tablosu ve README tutarlılığı. Resmî örnekler ÖN-13'e. |
| ÖN-18 | 6 | 5 | 7 | **6,0** | Kabul-değiştirilmiş | M | Girer (M): H6 dürüst metni, `PLAYWRIGHT_NOT_FOUND`/`BROWSER_NOT_INSTALLED`. Girer (S): başlangıçta otomatik çalışan kontroller ve `rewind-mcp check`. `init` YH (uzlaşmazlık 2). |
| ÖN-19 | 7 | 5 | 7 | **6,4** | Kabul-değiştirilmiş | M | Girer (M): durum göstergesi, zorunlu "Ne olmalıydı?" alanı, `event.code` ve metin girişinde tetiklenmeme, Shadow DOM yalıtımı. S: kısayol değişikliği (testten sonra), ARIA/axe, EN varsayılan ve TR. Tema YH. |
| ÖN-20 | 5 | 6 | 8 | **6,2** | Kabul-değiştirilmiş | S | M: ajan mesajlarının düz metin render edilmesi ve XSS testi. S: `wait_seconds` ≤60, `pendingQuestion` işareti (uzlaşmazlık 4). |
| ÖN-21 | 7 | 7 | 7 | **7,0** | Kabul-değiştirilmiş | M | Girer: `fixed` için ardışık 2 yeşil, karışık sonuçta `fixed_unverified`, yan etkili istek uyarısı. Çıkar: `recorded` ağ modu (YH). |
| ÖN-22 | 6 | 6 | 9 | **6,9** | Kabul-değiştirilmiş | M | Girer: 10 satırlık risk kaydı, R1 için canary CI ve zarif düşüş, hukuk görüşü yerine kullanıcı uyarısı. Babel/SWC yedeği YH. EK-A2 ile birleşik. |
| ÖN-23 | 5 | 5 | 8 | **5,9** | Kabul-değiştirilmiş | S | Girer: `prune` (M), kapalı olaylar için 30 günlük saklama, üst sınır aşılınca yalnızca kapalı olayların silinmesi. Açık olaylar asla otomatik silinmez; yalnızca uyarı. |
| ÖN-24 | 6 | 5 | 7 | **6,0** | Kabul-değiştirilmiş | M | Girer: 3 dilim ile "en az `bufferSeconds`" (bellek kabul edilemezse metin "30–60 sn" olur), FR-REC-01 hizalaması, import anında `NODE_ENV` korumalı yakalama (S; uzlaşmazlık 5). Yenilemede kalıcılık YH. |
| ÖN-25 | 8 | 6 | 9 | **7,7** | Kabul | M | Girer: destek matrisi, her FR için "Durum" sütunu, kapsam dışı eklemeler; "Doğrulandı" hücreleri fixture'lara ve CI'a bağlanır. |
| EK-B1 | 7 | 9 | 9 | **8,2** | Kabul | M | Girer: olay verisi (seçici, değer, URL) asla koda gömülmez; adımlar JSON'dan okunur ya da `JSON.stringify` ile yazılır; enjeksiyon fixture testi. |
| EK-B2 | 9 | 7 | 9 | **8,4** | Kabul | M (süreç) | Girer: §3.3 sürüm kesimi, her FR için v1.0/v1.1/YH etiketi, v1.0 efor tavanı ~12 kişi-hafta; tavanı aşan her yeni M bir ertelemeyle dengelenir. |
| EK-B3 | 7 | 7 | 8 | **7,3** | Kabul | M (onay öncesi) | Girer: 3 günlük spike; React 19 ve canary × Vite / Next+Turbopack / Next+webpack; Chromium ve Firefox yığın biçimleri; sonuç matrise ve R1'e yazılır. |
| EK-A1 | 8 | 7 | 9 | **8,0** | Kabul | M | Girer: not ile assertion'ın panelde yan yana gösterilmesi, `mark_fixed` çıktısında ikisinin birlikte yer alması, `instructions` yönergesi, negatif assertion uyarısı. Panelden yeniden açma ve gerekçe S. |
| EK-A2 | 6 | 7 | 8 | **6,9** | Kabul | M | Girer: CI'dan provenance ile yayın, 2FA, `npm audit` kontrolü, rrweb tam sürüm sabitleme, npm ad rezervasyonu, yer tutucunun kaldırılması. Paket içeriği karşılaştırması S. |
| EK-A3 | 8 | 6 | 8 | **7,4** | Kabul | M | Girer: dosya:satırdan sonra 7–8 satırlık "Kanıt güveni" bloğu (yalnızca v1.0'da üretilen işaretler, köken doğrulama satırı hariç); aynı blok önizlemede de gösterilir. |

**Güncellenmiş efor tahmini:** Tur 1'deki ~11 kişi-haftalık kesime şunlar ekleniyor: ardışık 2 yeşil, EK-A1, EK-A3, EK-A2, önizlemede vurgulama, köken uyarısı, `prune`, HMR parçası. Toplam ek ~1,5 hafta. **v1.0 ≈ 12–12,5 kişi-hafta.** EK-B2'deki tavanı 12'ye çekiyorum. A'nın eklemeleri tavanı zorluyor ama hepsi ucuz ve yanlış kanıtı önleyen maddeler; buna değer.

---

## 4. A ile hâlâ uzlaşamadığım maddeler ve uzlaşma önerilerim

| # | Konu | A'nın tutumu | Benim tutumum | Önerdiğim uzlaşma |
|---|---|---|---|---|
| 1 | **ÖN-02: assertion giriş biçimi** | Dar dilbilgisi allowlist'i (JSON DSL alternatif) | Yapılandırılmış JSON DSL; ajan metni asla çalıştırılmaz | **Ayrıştır → IR → yeniden üret.** Ajan Playwright sözdizimi yazar, dar dilbilgisi metni IR'e çevirir, kod yalnızca IR'den üretilir, IR doğrudan JSON olarak da kabul edilir. A'nın kullanılabilirliği ve benim "veri ≠ kod" ilkem birlikte korunur; ek maliyet ~1 gün. |
| 2 | **ÖN-18: `init` mi `doctor` mı** | `init` S (v1.0), `doctor` Ertele; kontroller `init` içinde | `doctor` S, `init` Ertele (3 ajanın yapılandırma biçimini izlemek kalıcı bakım yükü) | **Kontroller (port/projectId, Playwright, Chromium, `/health`) `rewind-mcp` her başladığında otomatik çalışır ve stderr'e yazar; aynı kontroller `rewind-mcp check` ile elle de çalıştırılır (S).** Yapılandırma dosyası yazan `init` v1.1'e. Sürüm sabitleme `npx --no-install` ile çözülür, böylece A'nın `init` gerekçesi (CFG-SEC-01) `init` olmadan karşılanır. |
| 3 | **ÖN-15: FR-MARK-08 (elle birincil kanıt seçimi)** | M ("seçimle aynı UI, ucuz") | S; otomatik sıralama yeterli | **Otomatik sıralama M. Elle seçim, FR-UI-04 işaretçileri bugün tıklanabilir ise ("Durum: Mevcut") M, değilse S.** Ucuzluk iddiası kodun mevcut durumuna bağlı; ÖN-25'teki "Durum" sütunu bunu belirler. |
| 4 | **ÖN-20/ÖN-08: `needs_info` durumu** | ÖN-20 ile birlikte durum setine eklensin | Durum değil | **Durum enum'u 4 değerde kalır; `list_incidents` ve panel `pendingQuestion: true` işareti gösterir.** Bilgi aynı, ama geçiş tablosu, `mark_fixed` kuralları ve testler büyümüyor. Ajan, yanıt bekleyen olayı yine görür. |
| 5 | **ÖN-24: FR-REC-12 (erken yakalama)** | Ertele ("bundler entegrasyonu gerekir") | S; bundler gerekmez | **`fetch`/XHR yamalaması bileşen montajından modül değerlendirmesine taşınır**, `NODE_ENV` ile korunur ve `enabled` değilse geçirgen kalır. Doküman "ilk import olarak ekleyin" der (S). Teknik gerekçe: `<App/>` ile `<Rewind/>` kardeş olduğunda React efektleri ağaç sırasıyla çalışır; App'in ilk `useEffect` fetch'i, Rewind'in montaj sırasında yaptığı yamadan **önce** gider ve kaçırılır. Ayrı bir erken yükleme script'i ya da bundler eklentisi YH'de kalır; bu noktada A ile aynı görüşteyiz. |
