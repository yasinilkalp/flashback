# FRD İnceleme Tartışması — Tur 2 · Ajan A (Ürün ve Güven Savunucusu)

| Alan | Değer |
|---|---|
| Girdi | `03a-ajanA-tur1.md` (A, Tur 1), `03b-ajanB-tur1.md` (B, Tur 1) |
| Rol | Ajan A — Ürün ve Güven Savunucusu |
| Tarih | 27.10.2026 |

## 0. Yöntem notu: puan farklarının bir kısmı ölçüm farkından geliyor

B, Tur 1'de **önerileri PM'in yazdığı hâliyle** puanladı, daraltmalarını yalnızca kararına yazdı. Ben ise Tur 1'de puanlarımı kısmen kendi değiştirilmiş kapsamıma göre verdim. Bu yüzden U (uygulanabilirlik) farklarının çoğu gerçek bir anlaşmazlık değil.

**Tur 2'de tüm nihai puanlarım "nihai kapsam" sütunundaki hâle aittir.** Bu nedenle bazı U puanlarım yükseldi: kapsam daraldıkça öneri ucuzladı. D ve R'deki farkları ise aşağıda tek tek tartışıyorum.

B'nin genel çerçevesine katılıyorum:
- G1–G7 birleştirmeleri benimkiyle neredeyse birebir örtüşüyor.
- EK-B2 ile bir efor tavanı konması gerekiyor.
- Öneri metinlerinde sonuç (outcome) tanımlanmalı, yöntem dayatılmamalı.

---

## 1. Fark ≥ 1,0 olan veya kararı farklı olan öneriler

> Biçim: **A Tur 1 → B Tur 1 → A nihai**. "Kabul ediyorum" B'yi haklı bulduğum yer, "Savunuyorum" ise itirazımı koruduğum yer.

### ÖN-01 — Localhost alıcısı (9,0 → 7,7 → **9,0**)

**Kabul ediyorum: `X-Rewind-Client` ile preflight zorlaması gereksiz katman.** Tarayıcılar çapraz kökenli her POST'ta (form ve `no-cors` fetch dahil) Origin gönderir ve bu başlık sahtelenemez. DNS rebinding senaryosunda da Origin `http://evil.test:4747` olur ve izin listesine takılır. Origin'siz gelen aynı-köken GET'leri Host doğrulaması yakalar. Host + Origin ikilisi yeterli. Özel başlık en fazla C düzeyinde derinlemesine savunma olabilir.

**Ek şart: `Origin: null` açıkça reddedilmeli.** Sandbox'lı iframe, `file:` ve bazı yönlendirmeler `null` gönderir. Bu satır FR'ye yazılmazsa uygulamada atlanır.

**Diğer kabullerim:**
- Oran sınırı yerine ÖN-23'teki disk/olay üst sınırı. Bu kabulün bir sonucu var: üst sınır artık bir güvenlik kontrolü, dolayısıyla ÖN-23'ün sınır kısmı **M** olmak zorunda (aşağıda).
- Windows ACL kaldırılsın.
- SEC-03'te belirteç olmadan, açık bayrak + yüksek sesli uyarıyla dışa açma.

R'yi 10'da tutuyorum. Sahte olay, zincirin (sahte olay → injection → `run_repro`) giriş kapısı ve kapatılması ucuz. Daraltılmış kapsamda U = 8.

### ÖN-02 — Assertions = kod (8,1 → 6,1 → **8,7**)

**B'yi tamamen haklı buluyorum; yapılandırılmış assertion DSL'i benim önerdiğim dar dilbilgisi izin listesinden daha iyi.** Benim Tur 1 önerim `constructor` ve hesaplanmış üye erişimini kapatıyordu. Ama B'nin gösterdiği **izinli Playwright API'lerinin kendisi** de yetki taşıyor:
- `page.context().request.get('http://intranet/…')` → SSRF,
- `locator.setInputFiles('~/.ssh/id_rsa')` → yerel dosya sızdırma,
- `page.route` ve `exposeFunction`.

Bunları bir AST izin listesinde sürekli kapalı tutmak kırılgan bir bakım işi. JSON DSL ise tasarım gereği güvenli ve ucuz.

**DSL için şartlarım (ifade gücü kaybı H3'ü zayıflatmasın):**
- `on`: `target` | `{role, name}` | `{text}` | `{testId}` | `{css}`. Sayfa düzeyi assertion'lar için `page` (ÖN-15).
- Matcher listesine `toHaveURL` ve `toHaveCount` dahil. `expected` alanı `{ "regex": "…" }` biçimini kabul etmeli; "1.380 ₺" ile "1380 ₺" gibi biçim farklarında aksi hâlde ajan zayıf bir `toContainText`'e kaçar.
- Dizi hâlinde birden fazla assertion ve `not` desteği.
- `REWIND_ALLOW_UNSAFE_ASSERTIONS` kaçış kapısı S olabilir (B ile uzlaşıyorum). Etkinse sonuç `unsafe: true` taşır, panelde ve raporda görünür ve **o koşu `verified` kapanışa sayılmaz**.

U 6 → 8.

### ÖN-03 — Prompt injection (8,0 → 6,0 → **7,6**)

**Kısmen kabul ediyorum.** Sınırlayıcılar olasılığı azaltır ama garanti vermez; asıl kontrol ÖN-01, ÖN-02 ve EK-B1. D'yi 8'den 7'ye, R'yi 8'den 7'ye indiriyorum.

SEC-04 (sezgisel talimat tespiti) için kararımı Ertele'den **Ret**'e çeviriyorum. İkimiz de aynı gerekçeyi gösteriyoruz: sahte güvenlik hissi yaratır. Yol haritasında tutmanın anlamı yok.

U'yu 9 veriyorum, çünkü kalan kısım (çit, ayrı not başlığı, köken satırı, `instructions`) birkaç günlük iş.

### ÖN-04 — Gizlilik iddiası ve önizleme (8,7 → 7,1 → **8,7**)

**Kabul ediyorum:** bölüm bazında hariç tutma S, hash eşitliği testi kaldırılsın.

**Savunuyorum: önizleme dürüst olmalı, yalnızca Markdown'u göstermek yetmez.** B'nin "gönderilecek Markdown raporu gösterilir" önerisinde bir güven açığı var. Alıcıya giden yük Markdown değil, **tüm olay JSON'u**: rrweb olay akışı, DOM anlık görüntüsü, ağ gövdeleri. Ajan bunları `get_incident_events` ve `get_dom_snapshot` ile okuyor. Yalnızca raporu gösteren bir önizleme, gönderilenin bir alt kümesini "gönderilen" gibi sunar. Bu da düzelttiğimiz H5 hatasının küçük bir tekrarı olur.

**Uzlaşma:**
- Markdown önizlemesi kalır.
- Altına zorunlu bir "Ayrıca gönderilenler" satırı eklenir: olay sayısı, DOM boyutu, ağ girdisi sayısı, türe göre gizleme sayacı.
- `[REDACTED:*]` belirteçlerinin vurgulanması yalnızca CSS, maliyeti yok; kalsın.
- Hash testi yerine birim testi: önizleme ve gönderim **aynı gizlenmiş nesneden** üretilir (tek kaynak değişmezi).

### ÖN-05 — Gizleme kapsamı (8,1 → 6,4 → **8,4**)

**B'nin mühendislik önerisini tamamen kabul ediyorum.** İki kural öneriyor:
1. Gönderimden önce yükün tamamı üzerinde jenerik derin gezinme.
2. Giriş değerlerini kayıt anında rrweb `maskInputFn` ile maskeleme; `name`, `type` ve `autocomplete` özniteliklerine göre.

Bu, alan × yöntem matrisini kısa bir istisna tablosuna indiriyor ve **benim önerdiğim matristen daha sağlam**: yeni bir alan eklendiğinde unutulma riski yok.

Bunlara da katılıyorum:
- Yaklaşık 150 örneklik tablo güdümlü fixture seti.
- "Korunan değerlerde sıfır yanlış pozitif" kriteri; benim önerdiğim "gerileme kapısı" ile aynı ruhta.
- Telefon numarası varsayılan olarak **kapalı**.

Tek ekim: derin gezinme NFR-SIZE sınırları uygulandıktan sonra çalışmalı. Aksi hâlde 5 MB'lık bir rrweb akışında gönderim gecikmesi NFR-LAT'ı bozar.

U 6 → 7.

### ÖN-07 — Sentetik girişler (7,0 → 5,7 → **6,6**)

**Kabul ediyorum.** En sık durum olan giriş formunu `storageState` (ÖN-06) zaten emiyor; bu yüzden D'yi 7'den 6'ya indiriyorum. `REWIND_INPUT_<n>` numaralandırması adım sırası değişince kırılır. v1.0 için tek bir `REWIND_PASSWORD` ve tür tablosu yeterli. Alan adına göre geçersiz kılma yol haritasına.

### ÖN-08 — Kırmızı→yeşil (9,1 → 7,8 → **9,4**)

**Sadeleştirilmiş modeli kabul ediyorum:**
- Koşu: `status: failed_assertion | passed | error` + `errorKind`.
- Olay: `open | closed` + `resolution: verified | unverified | cannot_reproduce`.
- `needs_info` ve ayrı bir `reopened` durumu yok.

Anlam kaybı yok, test yüzeyi yarıya iniyor.

**B'nin "hash = koşu imzası" yakalaması önemli ve ben kaçırmıştım.** Hash yalnızca assertion metnini kapsarsa ajan kırmızıyı `strict:true`, yeşili `strict:false` ile koşarak doğrulamayı oyunlayabilir. İmza şunları kapsamalı: normalize edilmiş assertion + `strict` + adım seti sürümü + `base_url` + `storageState` kullanımı (var/yok). Son ikisini ben ekliyorum: oturumsuz koşulan kırmızı ile oturumlu koşulan yeşil aynı kanıt değildir.

Benim Tur 1'deki "adım oynatma hatası `failed_assertion` sayılmaz" kuralım B'nin `errorKind` modeliyle örtüşüyor.

D ve R 10'da kalıyor. Sade model sayesinde U 7 → 8.

### ÖN-09 — Ölçüm (5,8 → 4,5 → **6,4**)

**B'nin maliyet analizini kabul ediyorum.** 360 koşu, 20–70 milyon token ve olay işaretlemenin insan emeği, tam benchmark'ı v1.0 dışına itiyor.

Kabul ettiklerim:
- **Mini benchmark:** 8–10 hata, yalnızca Claude Code (`claude -p`), ~60 koşu, yalnızca M1 ve M3.
- `stats.json` ertelensin. Telemetri olmadan kimse görmeyecek; haklı.

Savunduğum ve B'nin de katıldığı nokta: **"%60" iddiası mini benchmark sonucu gelene kadar her yerde "tek demo hatasında" diye nitelenir.** Bu bir pazarlama değil güven gereksinimi.

### ÖN-10 — NFR'ler (6,7 → 5,4 → **7,0**)

Kabul ettiklerim:
- **Token bütçesi:** Değer ölçümle belirlenir (B'nin 6–8 bin tahmini makul). Kırpma ve devam işaretçisi M. 4.000 token dar bir bütçe ve ek araç çağrısı, yani ek tur üretir. Bu H4'e ters, B haklı.
- **Firefox:** Tur 1'de Firefox'u "en iyi çaba" demiştim. Gerekçem yığın biçimi farkıydı. B'nin önerisi bu riski doğrudan test ediyor: Firefox'u Playwright e2e projesi olarak koşmak. Uzlaşma: Firefox e2e yalnızca Linux CI'da koşar. Geçiyorsa "Doğrulandı", geçmiyorsa "en iyi çaba". Safari en iyi çaba.
- INP yerine yerel bench betiği.

### ÖN-13 — Fixture'lar (7,1 → 5,8 → **7,4**)

**Kabul ediyorum:** ayrı bir auth uygulaması yerine mevcut demoya giriş rotası eklensin; Next App Router ikinci fixture olsun. Benim tek şartım (B de dolaylı olarak katılıyor): webpack ve Vue için test yoksa **README'deki iddialar da aynı sürümde yumuşatılır** ("Vue'da her şey çalışır" → "doğrulanmadı"). Fixture'ı ertelemek kabul; doğrulanmamış iddiayı yayında tutmak değil.

### ÖN-14 — Uç durumlar (7,1 → 5,8 → **7,4**)

Kabul ettiklerim:
- `tabId` M; bedava.
- sessionStorage yeniden deneme kuyruğu Ertele; pano ve `.md` fallback'i yeterli.

**Savunuyorum: HMR için ±3 satırlık kod parçası M kalmalı, S değil.** Gerekçelerim:
1. Ürünün ana akışında geliştirici olayı kaydettikten sonra kodla oynamaya devam ediyor; ajan da olayı genellikle dakikalar sonra okuyor. Satır kayması istisna değil, olağan durum. Yanlış satır ise H2'nin tam tersi.
2. Maliyet çok düşük: tarayıcı zaten source map'i çözüyor ve dev sunucularının source map'leri çoğunlukla `sourcesContent` taşıyor. Parça bu içerikten **ek istek olmadan** kesilir.

`sourcesContent` yoksa parça atlanır ve EK-A3'teki "Kanıt güveni" bloğunda uyarı çıkar. Uzlaşma için §4'e bakın.

### ÖN-16 — Çoklu proje (7,4 → 5,7 → **7,7**)

Kararlarımız aynı: RCV-07 ve CFG-06 M, proje başına port, RCV-08 ertelenir. RCV-08 için Tur 1'deki S kararımı **Ertele** olarak güncelliyorum; bundler eklentisi gerektirdiği konusunda B haklı.

**Savunduğum şey R puanı (8'e karşı 6).** Varsayılan port sabit (4747). İki projeyi aynı anda çalıştıran herkes çakışmayı **kesin** yaşar; bu bir olasılık değil, bir garanti. Sonuç da çift yönlü bir zarar:
- **Gizlilik:** B projesinin verisi A'nın ajanına gider.
- **Yanlış kanıt:** Ajan yanlış projede düzeltme yapar.

Tespit ve reddetme ucuz olduğu için U = 7.

### ÖN-18 — Kurulum (6,1 → 4,7 → **6,0**)

Tur 1'de `init` S, `doctor` Ertele demiştim; B tam tersini önerdi. **B'nin gerekçesini kabul ediyorum:** `init` üç farklı ve değişken ajan yapılandırma biçimini (JSON, JSON, TOML) izlemek zorunda; kalıcı bir bakım yükü. Dört kontrollü `doctor` ise mevcut `/health` ucunu kullanıyor ve en sık destek sorularını karşılıyor. Yeni karar: `init` Yol haritası, `doctor` (4 kontrol) S.

**Savunuyorum:** dokümandaki yapılandırma parçacıklarında sürüm sabitleme (FR-CFG-SEC-01) S değil **M**. Yalnızca dokümantasyon değişikliği, maliyeti sıfır ve v1.0 halka açık npm sürümünün tedarik zinciri riskini (T-16) kapatıyor.

### ÖN-20 — `reply_to_incident` (6,9 → 4,9 → **6,2**)

Kabul ettiklerim:
- `needs_info` Ret (sade durum modeli). Yerine okunmamış mesaj rozeti.
- `wait_seconds` en fazla 60 sn.
- MCP-15 S.

D'yi 6'dan 5'e, R'yi 7'den 6'ya indiriyorum. Panel React ile düz metin render ediyorsa XSS riski zaten düşük. Yine de FR-UI-15 **M** kalıyor: bir satırlık değişmez ve tek bir test. İleride biri `dangerouslySetInnerHTML` ya da Markdown render eklerse bu gereksinim koruma sağlar.

### ÖN-21 — Flaky ve yan etkiler (6,4 → 4,4 → **7,0**)

Kabul ettiklerim: `recorded` ağ modu Ertele; FR-REPRO-19 (yan etki uyarısı) M. `repeat` parametresi isteğe bağlı ve varsayılanı 1 olabilir.

**Savunuyorum: kesintili hatada sahte "doğrulandı" kanıtı engellenmeli.** Zamanlamaya bağlı bir hatada şu sıra mümkün: kırmızı → (etkisiz düzeltme) → şans eseri yeşil. ÖN-08'in imza kuralı bunu yakalamaz, çünkü imza aynıdır. Bu doğrudan **yanlış kanıt** üreten bir akış.

B'nin maliyet itirazı her koşuda tekrar için geçerli. Benim önerim ise yalnızca kapanışta tek bir ek koşu: `resolution: verified` için aynı imzayla **en az 2 `passed` koşu** gerekir. Bunlar ardışık iki `run_repro` çağrısı da olabilir, `repeat: 2` ile tek çağrı da. Ara koşular etkilenmez. Maliyet yalnızca kapanışta tek bir ek koşu (demoda ~2,5 sn). Uzlaşma için §4'e bakın.

### ÖN-22 — Risk kaydı (6,9 → 5,9 → **6,9**)

Kararlarımız aynı. B'nin R8 notunu (npm adlarını bugün rezerve et; provenance ve 2FA) kabul ediyorum; benim EK-A2'mle aynı şey. EK-A2'yi R8 azaltımının **gereksinim hâli** olarak birleştiriyorum.

### ÖN-24 — Kayıt penceresi (6,0 → 4,7 → **6,3**)

**B'nin erken yakalama önerisini kabul ediyorum:** eklenti olmadan, modül değerlendirme anında `fetch`/XHR yamalaması ve "giriş dosyasında ilk import" dokümantasyonu. Benim Ertele kararımdan daha iyi ve ucuz.

**Ancak ÖN-17 ile çakışan bir teknik şart var.** Modül değerlendirme anında, bileşenin `enabled` prop'u henüz bilinmiyor. Yama koşulsuz yapılırsa:
- `enabled={false}` verilen bir ortamda bile `fetch` yamalanır ve gövdeler belleğe alınır.
- Üretim no-op koruması da (FR-CFG-08) delinebilir.

Bu yüzden şu şartlar FR'ye yazılmalı:
- Modül düzeyindeki yama yalnızca `process.env.NODE_ENV !== 'production'` koşulunda yapılır.
- Bileşen `enabled=false` ile monte olursa yama geri alınır ve tamponlanan veri silinir.
- Bileşen hiç monte olmazsa erken tampon kısa bir süre (ör. 10 sn) sonra atılır.

3 dilim (pencere garantisi) M; buna ikimiz de katılıyoruz.

### Farkı < 1,0 olup kararı hafifçe farklı olanlar

| Öneri | Sonuç |
|---|---|
| ÖN-06 | Aynı kapsam. B'nin notunu bir FR'ye çeviriyorum: **`storageState` dosyası hiçbir MCP aracı tarafından okunmaz ve rapora girmez.** Yalnızca Playwright'a yol olarak verilir. Gerçek oturum belirteci taşıdığı için yanlışlıkla ajana gitmesi kabul edilemez. |
| ÖN-11 | B'nin "v1.0'da N-1 yok; bilinmeyen ana sürüm 400 + açık mesaj + panelde sürüm uyumsuzluğu" önerisini kabul ediyorum. |
| ÖN-12 | `cursor` sayfalaması kaldırılsın; `limit` + `status` yeterli. Kabul. |
| ÖN-15 | B'nin "birincil kanıtı otomatik sırala" önerisini kabul ediyorum (M). Elle işaretçi seçimi S. Benim Tur 1'deki M kararımdan daha ucuz ve çoğu durumda yeterli. |
| ÖN-17 | B "Kabul", ben "Kabul-değiştirilmiş" demiştim. B'nin "sonuç tanımlansın, yöntem (koşullu `exports`) dayatılmasın" notunu kabul ediyorum; nihai karar **Kabul**. README'nin tablodan otomatik üretilmesi şart değil. |
| ÖN-19 | Aynı kapsam. Kısayol varsayılanı, çakışma testinden sonra seçilir. |
| ÖN-23 | ÖN-01'de oran sınırını üst sınırla değiştirdiğimiz için sınırlar artık güvenlik kontrolü; **M** olmalı. Silme yalnızca kapalı olaylarda; açık olaylarda yalnızca uyarı. Saklama süresi B'nin önerdiği gibi 14 gün, yapılandırılabilir. `prune` S. |

---

## 2. B'nin ek önerileri

### EK-B1 — Repro spec üretiminde kod enjeksiyonu
**D 8 · R 10 · U 9 · Bileşik 8,9 · Kabul (M, v0.2 bloklayıcısı)**

Tur 1'de kaçırdığım, en ucuz kapatılacak ve en tehlikeli açık bu olabilir. ÖN-02 ne kadar sıkılaşırsa sıkılaşsın, sahte bir olaydaki seçici, giriş değeri ya da URL alanı spec dosyasına elle tırnaklanarak yazılırsa, ajanın "zararsız" `run_repro` çağrısı kod çalıştırır.

**Genişletme önerim:** Aynı kural `get_repro_script` çıktısı için de geçerli olmalı ve bu kısım daha da kritik. O dosya "kalıcı regresyon testi" olarak geliştiricinin deposuna taşınıyor. Enjekte edilmiş bir spec, depoya ve oradan CI'a **kalıcı** olarak girer. Kabul kriteri her iki çıktıyı da kapsamalı; B bunu kısmen yazmış, ben açıkça "taşınabilir çıktı dahil" diye netleştiriyorum.

### EK-B2 — v1.0 kesim çizgisi ve efor bütçesi
**D 8 · R 6 · U 9 · Bileşik 7,7 · Kabul-değiştirilmiş**

FRD v1.0'ın asıl işi bu ve PM'in en büyük eksiği. "§3.3 Sürüm kesimi" ve gereksinim başına `v1.0 / v1.1 / Yol haritası` etiketi aynen kabul.

**Değişiklik:** Efor tavanı (~10–11 kişi-hafta) bir planlama aracı olarak kabul. Ama "tavanı aşan her yeni M, bir M'nin ertelenmesiyle dengelenir" kuralı tüm M'lere uygulanırsa, güvenlik ve kanıt bütünlüğü takas malzemesi olur. Önerim:
- G1 (güvenlik: ÖN-01/02/03/04 çekirdeği, EK-B1) ve G2'nin kanıt bütünlüğü kısmı (ÖN-08 imza ve sınıflandırma, ÖN-06 `storageState`, ÖN-21 kapanış kuralı) **"kilitli M"** olarak işaretlenir ve takasa girmez.
- Tavan aşılırsa önce S'ler, sonra kilitli olmayan M'ler (ör. ÖN-14'ün S'ye inebilecek satırları, ÖN-19'un a11y ve dil kısımları) kayar.

Benim eklerimle (EK-A1 ~2 gün, EK-A3 ~2–3 gün, EK-B1 1–2 gün, EK-B3 3 gün) tahmin **~12 kişi-hafta**. Tavanı korumak için ÖN-19'un a11y kısmı S'de kalır, ÖN-15 MARK-08 S'de kalır.

### EK-B3 — Kaynak satırı çözümleme spike'ı
**D 8 · R 8 · U 8 · Bileşik 8,0 · Kabul**

H2'nin tek dayanağı belgelenmemiş bir React iç alanı ve bu yalnızca Vite demosunda doğrulanmış. Next App Router + Turbopack'te çalışmıyorsa ürünün birinci vaadi en yaygın React kurulumunda yok demektir. Bunu destek matrisini doldurmadan önce öğrenmek, tam benim güven ilkemin gereği: **ölçülmemiş destek iddiası yayımlanmaz.**

İki ekleme:
- Spike'a React 18.3 (`_debugSource`) ve Firefox'ta yığın ayrıştırma da eklensin (ÖN-10 tartışmasıyla bağlantılı).
- Çözümleme başarısız olduğunda `resolved: false` yolunun doğru çalıştığı (sessizce yanlış satır vermediği) da ölçülsün. Yanlış satır vermek, satır vermemekten daha kötüdür.

---

## 3. Nihai tablo

Puanlar nihai kapsama aittir. "v1.0 yerleşimi" önerinin çekirdeğinin yeridir; dışarıda kalan parçalar son sütunda yazılıdır. 🔒 = EK-B2'deki "kilitli M" (takasa girmez).

| Kimlik | D | R | U | Bileşik | Nihai karar | v1.0 yerleşimi | Nihai kapsam (girer / çıkar) |
|---|---:|---:|---:|---:|---|---|---|
| ÖN-01 | 9 | 10 | 8 | **9,0** | Kabul-değiştirilmiş | M 🔒 | Girer: Host doğrulaması, zorunlu Origin (`null` reddi), JSON content-type, kimlik regex'i ve yol sınırı, 413 boyut sınırı, loopback dışına yalnızca bayrak ve uyarıyla, POSIX 0700/0600 (S). Çıkar: `X-Rewind-Client` başlığı, oran sınırı (ÖN-23 üst sınırına devredildi), Windows ACL, SEC-07 eşleştirme belirteci (yol haritası). |
| ÖN-02 | 9 | 9 | 8 | **8,7** | Kabul-değiştirilmiş | M 🔒 | Girer: yapılandırılmış JSON assertion DSL'i (`on`, kapalı matcher listesi, `regex`, `not`, dizi), `base_url` için loopback/izin listesi, zaman aşımı, dürüst araç açıklaması. Unsafe kaçış kapısı S, `verified` kapanışa sayılmaz. Çıkar: AST izin listesi, `.rewind/repro` dizinini sandbox gibi sunan ifade. |
| ÖN-03 | 7 | 7 | 9 | **7,6** | Kabul-değiştirilmiş | M 🔒 | Girer: çitli bloklar ve çit uzatma, notun ayrı "niyet" başlığı, köken + Rewind sürümü satırı, sunucu `instructions` (G7), snapshot ve kaçış testleri. Çıkar: SEC-04 sezgisel tespit (Ret), kırmızı takım koşularının sürüm kapısı olması. |
| ÖN-04 | 9 | 9 | 8 | **8,7** | Kabul-değiştirilmiş | M 🔒 | Girer: H5 yeni metni (README ve site aynı PR'da), NFR-PRIV-01, `redact=false` şeridi, Markdown önizlemesi + "Ayrıca gönderilenler" özeti + `[REDACTED]` vurgusu, tek kaynak birim testi. Çıkar: hash eşitliği testi. Bölüm bazında hariç tutma S. |
| ÖN-05 | 9 | 9 | 7 | **8,4** | Kabul-değiştirilmiş | M 🔒 | Girer: tüm yük üzerinde derin gezinme, `maskInputFn` ile kayıt anında maskeleme, kapalı ve sürümlü anahtar listesi, ekran görüntüsü `mask`, `data-rewind-mask/block`, ~150 örneklik fixture ve korunan değerlerde sıfır yanlış pozitif. Çıkar: 500 örnek ve yüzde eşikleri. Telefon numarası varsayılan kapalı. |
| ÖN-06 | 9 | 9 | 7 | **8,4** | Kabul-değiştirilmiş | M 🔒 | Girer: başlangıç bağlamı (URL, viewport, locale, saat dilimi, depolama/çerez adları), `REWIND_STORAGE_STATE` (MCP'den okunamaz), belirlenimci `precondition` kuralı, demoya giriş rotası. Çıkar: `rewind.setup.ts`, sezgisel durum algılama, ajan `setup` adımları (yol haritası). |
| ÖN-07 | 6 | 6 | 8 | **6,6** | Kabul-değiştirilmiş | M | Girer: tür bazlı sentetik değer tablosu, tek `REWIND_PASSWORD`, sentetik adım listesi, `grep` testi (FR-RED-15 → ÖN-05 bölümüne). Çıkar: `REWIND_INPUT_<n>` (alan bazlı geçersiz kılma yol haritasında). |
| ÖN-08 | 10 | 10 | 8 | **9,4** | Kabul-değiştirilmiş | M 🔒 | Girer: `failed_assertion / passed / error` + `errorKind`, `open/closed` + `resolution`, koşu imzası (assertion + strict + adım sürümü + base_url + storageState), ilk koşu yeşilse "yeniden üretilemedi", dört e2e senaryosu. Çıkar: 6 olay durumu, `needs_info`, `reopened` durumu (yeniden açma `open`'a döner). |
| ÖN-09 | 7 | 6 | 6 | **6,4** | Kabul-değiştirilmiş | M | Girer: her FR'ye "Hedef" sütunu, M1–M8 tanımları ("kalibre edilecek" notuyla), "%60" iddiasının niteliklendirilmesi. Mini benchmark (8–10 hata, Claude Code, M1 ve M3) S ama halka açık iddialardan önce zorunlu. Çıkar: tam benchmark, `stats.json`/export, ölçümün v0.2 onayını bloklaması. |
| ÖN-10 | 7 | 7 | 7 | **7,0** | Kabul-değiştirilmiş | M | Girer: NFR-SIZE, NFR-REPRO zaman aşımı, NFR-MEM (yerel bench), Node ≥ 22, token bütçesi (değer ölçümle) + belirlenimci kırpma ve devam işareti, Firefox e2e (Linux). NFR-PERF yerel bench S. Çıkar: INP p75 CI ölçümü, 4.000 token sabiti, dört tarayıcı için resmî destek beyanı. |
| ÖN-11 | 7 | 7 | 8 | **7,3** | Kabul-değiştirilmiş | M | Girer: tek kaynaktan üretilen şema (bağlantıyla), `schemaVersion`, bilinmeyen ana sürüm → 400 + panel uyarısı, tek UTC zaman tabanı, HTTP uç listesi. Çıkar: N-1 okuma ve geriye uyumluluk testi (v1.1). |
| ÖN-12 | 8 | 6 | 8 | **7,4** | Kabul-değiştirilmiş | M | Girer: birleşik hata kodları ve öneri metni (G3, FR-REPRO-17 dahil), `limit` + kırpma, görüntü fallback'i, FR-REPRO-08 metninin yumuşatılması. `outputSchema` ve `portable` S. Çıkar: `cursor` sayfalaması, `fix-incident` prompt'u (→ `instructions`). |
| ÖN-13 | 8 | 7 | 7 | **7,4** | Kabul-değiştirilmiş | M | Girer: her M gereksinim için kriter, demo + giriş rotası, Next App Router fixture'ı, kesin YAZ10/KIS20 kanıtları, KK-5 elle, KK-6, KK-7 (M NFR'ler). Çıkar: webpack ve Vue fixture'ları (iddialar README'de "doğrulanmadı" olarak yumuşatılır), KK-8 sürüm kapısı. |
| ÖN-14 | 8 | 8 | 6 | **7,4** | Kabul-değiştirilmiş | M | Girer: `ancestor/unresolved`, `resolved:false`, ±3 satır parça (`sourcesContent`'ten), SSE/stream bozulmaması, CSP mesajı, `.md` indirme, `run_repro` kilidi, `base_url` önceliği, `tabId`. "Panel açıktı" işaretçisi S. Çıkar: sessionStorage kuyruğu, Shadow DOM seçici kuralları, WebSocket ve WSL (kapsam dışı/doküman). |
| ÖN-15 | 8 | 6 | 8 | **7,4** | Kabul-değiştirilmiş | M | Girer: `target = null` sayfa düzeyi olay, DSL'de `page`/rol hedefi, birincil kanıtın otomatik sıralanması. Elle işaretçi seçimi S. Çıkar: çoklu ilgili öğe (açık soru 1 = "tek öğe ya da öğesiz"). |
| ÖN-16 | 8 | 8 | 7 | **7,7** | Kabul-değiştirilmiş | M | Girer: `projectId` + `/health`, port doluysa ve kimlik farklıysa `WRONG_PROJECT` (sessiz okuma yok), klasör çözümleme ve ev/kök dizini reddi, proje başına port. Çıkar: FR-RCV-08 tarayıcı proje kimliği ve makine geneli yönlendirici (yol haritası). |
| ÖN-17 | 9 | 9 | 8 | **8,7** | Kabul | M 🔒 | Girer: `enabled` varsayılanı = üretim dışı, üretim bundle'ında kaydedici kodu yok (yöntem serbest), üretimde reddetme + `allowProduction` uyarısı, tek varsayılanlar tablosu, bundle analizi kriteri. Çıkar: README'nin otomatik üretilmesi zorunluluğu. |
| ÖN-18 | 6 | 5 | 7 | **6,0** | Kabul-değiştirilmiş | M | Girer: H6 dürüst metni, FR-REPRO-17 hata kodları (→ ÖN-12), dokümanda sürümü sabitlenmiş yapılandırmalar (M). 4 kontrollü `doctor` S. Çıkar: `init` (yol haritası), CSP ve uzak ortam tespiti. |
| ÖN-19 | 7 | 5 | 7 | **6,4** | Kabul-değiştirilmiş | M | Girer: kayıt/alıcı/proje durum göstergesi, zorunlu "Ne olmalıydı?" alanı, `event.code` eşlemesi ve girişte tetiklenmeme, Shadow DOM yalıtımı. Tam a11y/axe, İngilizce varsayılan + TR, ilk açılışta kısayol değiştirme S. Çıkar: test edilmemiş `Ctrl+Shift+Y` varsayılanı, tema (yol haritası), kullanılabilirlik eşiğinin sürüm kapısı olması. |
| ÖN-20 | 5 | 6 | 8 | **6,2** | Kabul-değiştirilmiş | S | Girer: `wait_seconds` (en fazla 60) + `NO_REPLY_YET` (S), **düz metin render FR-UI-15 (M)**, okunmamış rozeti. Çıkar: `needs_info` durumu (Ret). |
| ÖN-21 | 7 | 7 | 7 | **7,0** | Kabul-değiştirilmiş | M 🔒 | Girer: yan etkili istek uyarısı, `verified` için aynı imzayla en az 2 `passed` koşu (yalnızca kapanışta), isteğe bağlı `repeat` (varsayılan 1). Çıkar: `recorded` ağ modu (yol haritası). |
| ÖN-22 | 6 | 6 | 9 | **6,9** | Kabul-değiştirilmiş | M | Girer: 10 satırlık risk tablosu, R1 = canary CI + zarif düşüş (EK-B3 ile beslenir), R6 = kullanıcı uyarısı, R8 = npm adlarının hemen rezervasyonu (+EK-A2). Çıkar: hukuk görüşü, v1.0 taahhüdü olarak `data-rewind-source` eklentisi. |
| ÖN-23 | 5 | 5 | 8 | **5,9** | Kabul-değiştirilmiş | M | Girer: olay sayısı ve boyut üst sınırı (güvenlik kontrolü; yalnızca kapalı olaylar silinir, açıklarda uyarı), kapalı olaylar için 14 gün (yapılandırılabilir). `prune` S. Çıkar: açık olayların otomatik silinmesi. |
| ÖN-24 | 6 | 5 | 8 | **6,3** | Kabul-değiştirilmiş | M | Girer: 3 dilim (≥ `bufferSeconds` garantisi), modül değerlendirmesinde erken yama (yalnızca üretim dışı; `enabled=false` ise geri alınır ve tampon silinir), FR-REC-01 hizalaması. Çıkar: yenilemede kalıcılık ve bundler eklentisi (yol haritası). |
| ÖN-25 | 8 | 6 | 9 | **7,7** | Kabul | M | Girer: küçük destek matrisi (hücreler EK-B3 ve fixture'larla doldurulur), FR başına "Durum" sütunu, kapsam dışı eklemeleri. Çıkar: yok. |
| EK-A1 | 8 | 7 | 9 | **8,0** | Kabul | M 🔒 | Girer: panelde not ↔ kırmızı/yeşil assertion yan yana, `verified` rozeti assertion görünmeden gösterilmez, "beklentimi kanıtlamıyor" ile yeniden açma (`open`'a döner, ajana mesaj), `instructions`'ta yönerge. Çıkar: ayrı `reopened` durumu. |
| EK-A2 | 6 | 7 | 8 | **6,9** | Kabul (ÖN-22 R8 ile birleşik) | M | Girer: yalnızca CI'dan yayın, npm provenance, 2FA, sabitlenmiş runtime bağımlılıkları ve rrweb, `npm audit` (yüksek/kritik 0), paket içeriği kontrolü, `GITHUB_KULLANICI` temizliği. Çıkar: yok. |
| EK-A3 | 8 | 7 | 7 | **7,4** | Kabul | M | Girer: raporun dosya:satır bilgisinden hemen sonra sabit biçimli "Kanıt güveni" bloğu (çözümleme, eşleme, props zamanı, pencere kapsamı, kırpma, gizleme, köken, sentetik giriş, parça yok) ve önizlemede aynı blok. Çıkar: yok. |
| EK-B1 | 8 | 10 | 9 | **8,9** | Kabul | M 🔒 | Girer: olay verisi spec koduna asla gömülmez (ayrı JSON ya da `JSON.stringify`), `run_repro` **ve** `get_repro_script`/taşınabilir çıktı için enjeksiyon fixture testi. Çıkar: yok. |
| EK-B2 | 8 | 6 | 9 | **7,7** | Kabul-değiştirilmiş | M (süreç) | Girer: §3.3 sürüm kesimi, gereksinim başına `v1.0 / v1.1 / Yol haritası` etiketi, ~10–12 kişi-hafta tavanı, 🔒 kilitli M'lerin takasa girmemesi. Çıkar: tüm M'lerin serbestçe takas edilebilmesi. |
| EK-B3 | 8 | 8 | 8 | **8,0** | Kabul | M (v0.2 öncesi, 3 gün) | Girer: React 19 + canary, React 18.3, Next App Router + Turbopack, Next + webpack, Vite, Firefox yığın ayrıştırma; 20 seçimde doğru oran ve `resolved:false` yolunun doğruluğu; sonuçlar matrise ve R1'e yazılır. Çıkar: B planı eklentisinin v1.0'a alınması. |

**Özet:** 31 maddenin hiçbiri bütünüyle reddedilmiyor. Alt düzeyde reddedilenler: SEC-04, `needs_info`, hash eşitliği testi, `X-Rewind-Client`. Yol haritasına gidenler: SEC-07, `setup` kancası, `recorded` modu, tam benchmark, `init`, yenilemede kalıcılık, çoklu öğe, RCV-08, N-1 uyumluluğu, webpack ve Vue fixture'ları, tema. Ortak v1.0 çekirdeği B'nin ~11 kişi-hafta tahminine eklerimle birlikte **~12 kişi-hafta**.

---

## 4. B ile hâlâ uzlaşamadığım maddeler ve önerdiğim uzlaşma

| # | Konu | A'nın tutumu | B'nin tutumu | Önerilen uzlaşma |
|---|---|---|---|---|
| 1 | **ÖN-21 / ÖN-08: kesintili hatada sahte "doğrulandı"** | `verified` için 2 geçiş zorunlu; aksi hâlde şans eseri yeşil sahte kanıt olur. | `repeat` isteğe bağlı, varsayılan 1; her koşuyu 2–3 kat yavaşlatmasın. | İkinci geçiş **yalnızca kapanışta** zorunlu: `mark_fixed` → `verified` için aynı imzayla ≥ 2 `passed` (iki çağrı ya da `repeat: 2`). Ara koşular tek. Karışık sonuç → `unverified` (`errorKind: flaky`). Maliyet olay başına tek ek koşu. |
| 2 | **ÖN-14: HMR ±3 satır parçası** | M; satır kayması olağan durum, H2'yi doğrudan etkiliyor ve `sourcesContent`'ten bedava. | S. | Parça `sourcesContent` mevcutsa M (ek istek yok, 1 günlük zaman kutusu). Mevcut değilse parça atlanır ve EK-A3 bloğunda uyarı çıkar. Zaman kutusu aşılırsa S'ye iner. |
| 3 | **EK-B2: efor tavanında takas kuralı** | Güvenlik ve kanıt bütünlüğü M'leri takasa girmemeli. | Tavanı aşan her M, bir M'nin ertelenmesiyle dengelenir. | Tavan ~10–12 kişi-hafta kabul. 🔒 işaretli kalemler (ÖN-01/02/03/04/05/06/08/17/21 kapanış kuralı, EK-A1, EK-B1) kilitli; kayma sırası önce S, sonra kilitsiz M. Tavan kilitli kalemler yüzünden aşılırsa tarih kayar, kapsam değil. |
| 4 | **ÖN-04: önizleme ne göstermeli** | Önizleme gönderilen her şeyi temsil etmeli; yalnızca Markdown göstermek gizlilik iddiasını yeniden yanıltıcı yapar. | Markdown'un salt okunur önizlemesi ve gizleme sayacı yeterli; vurgu ve hash testi gereksiz. | Markdown önizlemesi + zorunlu "Ayrıca gönderilenler" satırı (olay sayısı, DOM boyutu, ağ girdisi, türe göre gizleme) + yalnızca CSS ile vurgu. Hash testi yerine tek kaynak birim testi. Ek efor ≤ 1 gün. |
| 5 | **ÖN-18: dokümandaki sürüm sabitleme** | M; sıfır maliyetli doküman değişikliği ve halka açık npm'in tedarik zinciri riskini kapatıyor. | S. | M olarak doküman parçacıklarında `rewind-mcp@<sürüm>`. Sürüm numarası `release` betiğiyle README'de otomatik güncellenir; elle güncelleme yükü olmaz. `init` ertelendiği için bu tek yol. |

**Not (anlaşmazlık değil, B'ye teknik soru):** ÖN-24'teki modül düzeyi erken yama ile ÖN-17'deki üretim koruması arasındaki etkileşim (yamanın yalnızca üretim dışında yapılması, `enabled=false` ise geri alınması ve tamponun silinmesi) B'nin önerisinde yazılı değil. B'nin bu şartı kabul edeceğini varsayıyorum. Kabul etmezse 6. uzlaşmazlık maddesi olur.
