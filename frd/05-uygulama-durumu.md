# Rewind — Uygulama durumu (FRD v1.1'e göre)

| Alan | Değer |
|---|---|
| Tarih | 27.10.2026 (ikinci güncelleme) |
| Kod tabanı | Sıfırdan kuruldu. GitHub deposu boştu ve yerel klasörde yalnızca README ile yapılandırma dosyaları vardı. Bu nedenle FRD'deki "Durum" sütunu (README'ye göre "Mevcut") artık geçerli değil. Bu belge onun yerini alır; AS-9 kapandı. |
| Doğrulama | 444 birim testi ve 34 uçtan uca test (gerçek Chromium) yeşil. Tip denetimi temiz. CI üç işletim sisteminde yeşil (birleştirmeden önceki son koşu). EK-B3 ölçümü: 4 kurulum × 2 tarayıcı, sessizce yanlış satır 0 (`spikes/ek-b3/results/summary.md`). |
| Bağımsız güvenlik incelemesi | 9 bulgu çıktı: 3 High, 3 Medium, 3 Low. Bulguların 8'i exploit ile doğrulandı, 1'i kısmen doğrulandı. **Dokuzu da düzeltildi** ve her biri için regresyon testi eklendi (§4). |
| FRD | §3'teki D-1…D-10 sapmaları [`08-FRD-v1.1.md`](08-FRD-v1.1.md) belgesine işlendi. |

## 1. Sürüm kabul kriterleri

| # | Durum | Kanıt |
|---|---|---|
| KK-1 | ✅ | `tests/e2e/full-flow.e2e.test.ts` YAZ10 ve KIS20 senaryolarında şu akışı otomatik olarak tamamlar: panel → `rewind-mcp` (gerçek stdio + HTTP) → kırmızı → kaynak düzeltilir → yeşil ×2 → `fixed`. |
| KK-2 | ✅ | Aynı dosyadaki ACCOUNT senaryosu: `storageState` yokken sonuç `precondition` olur ve kırmızı sayılmaz. `storageState` verilince kırmızı → yeşil ×2 → `fixed`. |
| KK-3 | ✅ | FR-LIFE-04'teki dört senaryo `packages/mcp/test/lifecycle.test.ts` dosyasında test ediliyor. Tam akış e2e testinde de çalışıyor. |
| KK-4 | ✅ | Güvenlik paketi (`security.test.ts`, `security.e2e.test.ts`) ve tüm uçtan uca testler GitHub Actions'ta Ubuntu, Windows ve macOS'ta yeşil (ör. 27.10.2026 tarihli 40506650677 numaralı koşu). |
| KK-5 | ○ | Cursor ve Codex ile elle yapılacak smoke testi henüz yapılmadı. |
| KK-6 | ✅ | Gizleme fixture seti (173 test) geçiyor. Bilinen sır biçimlerinde duyarlılık %100. Korunan 91 değerde yanlış pozitif 0. |
| KK-7 | ✅ | NFR-SIZE-01, NFR-TOK-01, NFR-REPRO-01 ve NFR-PRIV-01 testli. NFR-PERF-01, NFR-LAT-01 ve NFR-MEM-01 iki tur ölçüldü ([`07-nfr-olcumleri.md`](07-nfr-olcumleri.md) §0). MEM ve LAT geçti. PERF bağlayıcı profilde (1x) yalnızca 5.000 düğümdeki INP maddesinde kaldı (+32 ms, hedef ≤ 20 ms). Bu sonuç sürüm notuna yazılacak. |
| KK-8 | ✅ | EK-B3 yapıldı (`spikes/ek-b3/`): Vite + React 18.3 ve 19, Next.js 16 App Router + Turbopack ve webpack; Chromium ve Firefox. İlk yüklemede %100 doğru, sessizce yanlış satır 0. Sonuçlar FRD §3.3, R1 ve R13'e işlendi. `examples/next-app`, `examples/react18` ve `examples/vue` uçtan uca testleri regresyon olarak koşar; Vue smoke testi geçti. |
| KK-9 | ◐ | M ve M🔒 gereksinimlerin büyük çoğunluğunun testi var. Test kimliği eşlemesi tablo olarak çıkarılmadı. |
| KK-10 | ◐ | `release:check` geçiyor. CI'dan provenance ile yayın akışı ve npm adlarının rezervasyonu henüz yapılmadı (R8). |
| KK-11 | ○ | Mini benchmark yapılmadı. "%60" iddiası README'den çıkarıldı. |

## 2. Alanlara göre durum

| Alan | Uygulanan | Atlanan veya kısmi |
|---|---|---|
| REC | 01–08, 10, 11, 14; S: 09, 12, 13 | 15 (YH) |
| UI | 01, 02, 04, 06, 07, 08, 10, 11, 12, 15, 16; S: 05, 09, 10 (yanlış proje göstergesi), 13 (axe denetiminde kritik/ciddi ihlal 0, odak tuzağı), 14, 17, 18 | 03 (kısayol çakışma testi: işletim sistemi ve giriş dili bazında elle denenmeli, AS-3), 19 (YH) |
| MARK | 01–05, 07, 08, 10, 11, 12; S: 06 (Vue smoke testi), 09. 04 EK-B3 ile doğrulandı; 05'teki eski fiber kopyası hatası düzeltildi (§3, D-11) | 13 (YH) |
| PKG | 01–08, SEC-01–03 | SEC-04 (YH) |
| RED | 01–15 | Telefon numarası varsayılan olarak kapalı (AS-4) |
| RCV | 01–11, SEC-01–06, SEC-08 | SEC-07 (YH) |
| MCP | 01–15, SEC-01, SEC-03 | 16 (YH), SEC-02 (kırmızı takım koşusu elle yapılacak) |
| REPRO | 01–22, SEC-01, SEC-03, SEC-04, SEC-05 | SEC-02 (C, `unsafe` mod), 23 (YH) |
| LIFE | 01–06 | — |
| CFG | 01–11 | 12 (v1.1) |
| NFR | PRIV-01, SIZE-01, TOK-01, REPRO-01, COMP-01, MEM-01, LAT-01 | PERF-01: 5.000 düğümde INP +32 ms (1x) |

### Bu turda eklenenler

- **FR-MCP-10:** Araçlar `outputSchema` ve yapılandırılmış çıktı döndürüyor.
- **FR-MCP-13:** `list_incidents` sayfalı (`cursor`). Geçersiz cursor `invalid_cursor` hatası verir.
- **FR-MCP-14:** `get_repro_script({ portable: true })`. Projenin kendi `playwright.config` dosyasıyla çalışan, `.rewind/`'a bağımlı olmayan tek dosyalık spec üretir.
- **FR-RCV-06:** `project` prop'u. Tarayıcı `x-rewind-project` başlığını gönderir. Alıcı yanlış projeye gelen olayı 409 ile reddeder; panel "yanlış proje" şeridini gösterir. Alıcı, kaynak yollarını proje köküne göre göreli hâle getirir (Windows sürücü harfi ve `file:///` dahil).
- **FR-UI-13:** Odak panelin içinde tutuluyor (`aria-modal`). axe denetimi e2e testinde. Tekrar oynatma iframe'ine başlık eklendi.
- **FR-MARK-06:** `examples/vue` ile smoke testi.
- **EK-B3 regresyon testleri:** `examples/next-app`, `examples/react18` ve `examples/vue` örnek uygulamaları ve uçtan uca testleri. Kaynak çözümleme kodu `spikes/ek-b3` çalışmasından (güncel fiber, HMR bayatlık sinyali, webpack `eval` haritaları, RSC); bu testler o kodun üstünde koşar. Konum öğenin atasından geldiğinde panel ve Kanıt güveni bunu belirtir (`fromAncestor`).
- **Birleştirmede düzeltilen kaynak çözümleme açıkları:** (1) React 19'un sahip yığını sınırında (~1 sn'de 10 000'den fazla öğe) paylaşılan `UnknownOwner` yığını Turbopack'te sessizce yanlış satıra çözülüyordu. Artık bu yığın atlanıyor, konum en yakın atadan "ata öğe" olarak veriliyor. (2) `_debugStack`'te `react_stack_bottom_frame` sonrasındaki modül yükleme çerçeveleri aday olmaktan çıktı. (3) React 18'de `_debugSource` için yol dev sunucusu köküne göreli yazılıyor ve kod parçası ekleniyor (Kanıt güveni artık "uyarı" değil). (4) RSC öğelerinde ajana "bileşen yığını yalnızca istemci bileşenlerini içerir" notu gidiyor.
- **NFR düzeltmeleri** ([`07`](07-nfr-olcumleri.md) §0): animasyon kaldırıldı, checkout boşta alınıyor, Replayer gecikmeli ve sanal DOM'suz kuruluyor. Kaydet yolunda tek serileştirme, tembel önizleme ve `Blob` gövde kullanılıyor. 5.000 düğümde 4x kaydet → onay p95 3,7 sn → 1,6 sn.
- **Gizleme:** Gizleme işaretleri olayları 5 MB'ın üstüne çıkarırsa olaylar kesin boyutla yeniden sığdırılıyor (önceden yük 413 alabiliyordu). Bunun için regresyon testi eklendi.

## 3. FRD'den sapmalar

Aşağıdakilerin hepsi FRD v1.1'e işlendi (D-11…D-14, v1.0.1'den taşındı). D-5 açık bir karar olarak AS-10'a taşındı.

| # | Konu | Uygulama | Öneri |
|---|---|---|---|
| D-1 | HTTP API (§9.3) | `GET /incidents` ve `GET /incidents/:id` eklendi. Panelin Kayıtlar sekmesi bunları kullanıyor. | §9.3'e eklenmeli. |
| D-2 | Hata kodları (§9.6) | Yeni kodlar: `base_url_rejected`, `invalid_transition`, `selector`, `internal`. | §9.6'ya eklenmeli. |
| D-3 | Ortam değişkenleri (§9.4) | Yeni değişkenler: `REWIND_NO_IMAGES`, `REWIND_RATE_LIMIT_PER_MIN` (30), `REWIND_INPUT_<ALAN>`. | §9.4'e eklenmeli. |
| D-4 | FR-CFG-09 `allowProduction` | `NODE_ENV=production` olan bir build'de kaydedici pakete hiç girmez (FR-CFG-08 🔒). Bu yüzden `allowProduction` yalnızca `NODE_ENV`'nin production olmadığı build'lerde (ör. staging) işe yarar. | Kilitli FR-CFG-08 öncelikli kabul edilsin. FR-CFG-09 metni buna göre düzeltilmeli. |
| D-5 | FR-UI-08 önizleme | Önizleme her **tarayıcı oturumunun** ilk gönderiminde zorunlu. FRD'nin kabul kriteri "her olayın ilk gönderiminde" diyor. | Karar verilmeli. Her olayda zorunlu önizleme daha güvenli, ama daha fazla sürtünme yaratır. |
| D-6 | Kanıt güveni (FR-PKG-08) | Güvenlik incelemesinden sonra sunucu, maddelerin metnini sabit şablonlardan yeniden kuruyor. Tarayıcıdan yalnızca anahtar ve seviye alınıyor. Olaydan gelen metin ayrı ve çitli bir "Kanıt ayrıntıları" bloğunda gösteriliyor. | FR-PKG-08'e eklenmeli (prompt injection önlemi). |
| D-7 | `get_incident` raporu (FR-PKG-02) | Bölüm 6'ya "İşaretlenen andan önceki son başarılı istekler" alt bölümü eklendi. YAZ10'daki `"fee": "30"` gibi hata olmayan ama yanlış değer taşıyan yanıtlar ajana ilk turda ulaşsın diye. | FR-PKG-02'ye eklenmeli. |
| D-8 | Ortam değişkeniyle doldurulan alanlar | Ajan, `REWIND_PASSWORD` gibi ortam değişkeninden doldurulan bir alanın değerini `toHaveValue` ile okuyamaz. Okumaya çalışırsa `assertion_rejected` döner. Belirsiz semantik konumlayıcılarla yazılan değer okumaları da reddedilir. | FR-REPRO-SEC-01'e eklenmeli (parola sızıntısı önlemi). |
| D-9 | Repro köken kilidi | Her adımdan ve assertion'dan önce köken denetleniyor. İzin verilmeyen kökenlere giden üst düzey gezinmeler iptal ediliyor. | FR-REPRO-SEC-03'e eklenmeli. |
| D-10 | `REWIND_PROJECT_ROOT` varsayılanı | `cwd`'den yukarı doğru bulunan ilk `package.json` klasörü. Boşsa `cwd`. | §9.4 güncellenmeli. |
| D-11 | Güncel fiber (FR-MARK-03/04/05) | DOM düğümündeki fiber, öğe oluşturulduğundaki kopyadır ve çift tampon yüzünden eski olabilir. Bu kopya eski props/state ve eski konum taşır. Artık React'in `findCurrentFiberUsingSlowPath` algoritmasıyla güncel kopya okunuyor. Atalar da güncel kopyadan yürünüyor. EK-B3'te bulundu. | FR-MARK-05'e eklenmeli ("canlı" iddiasının koşulu). |
| D-12 | HMR'de bayat konum (FR-MARK-11) | React 19'da Fast Refresh ile değişen bileşenin eski öğeleri ve RSC yükü yenilendikten sonraki sunucu öğeleri `resolved:false` döner. Turbopack HMR modülleri (`chunk.js?id=`) ve React 18'de çelişen fiber kopyaları da öyle. Dosya adı verilir, kod parçası verilmez. Gerekçe panelde ve raporda görünür. | FR-MARK-11'in "çözülemiyorsa" koşuluna "HMR yüzünden doğrulanamıyorsa" eklenmeli (R12). |
| D-13 | Kaynak yolu (FR-PKG-02) | Alıcı, `target.file` ve konsol kaynaklarındaki mutlak yolları proje köküne göre kısaltır. React 18 `_debugSource`, Turbopack ve webpack haritaları mutlak yol verir; kısaltma kullanıcı adının pakete girmesini de önler. | §9.3'e eklenmeli. |
| D-14 | Tarayıcının yeni istekleri (NFR-PRIV-01) | webpack `eval` modüllerinin haritası için sayfanın yüklediği chunk'lar, RSC için Next.js'in `/__nextjs_source-map` ucu getirilir. İkisi de sayfanın kendi kökeninde; NFR-PRIV-01 korunuyor. | Bilgi; FRD değişikliği gerekmez. |

## 4. Güvenlik incelemesi bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| 1 | High | Ajanın assertion'ı Playwright hata metni üzerinden `REWIND_PASSWORD`'ü okuyup diske ve yanıta sızdırabiliyordu | ✅ Gizli değerler her çıktıda temizleniyor. Playwright çıktı dosyaları siliniyor. Değer okuyan assertion'lar reddediliyor. |
| 2 | High | Repro tarayıcısı başka bir kökene yönlenip parolayı oraya yazabiliyordu | ✅ Tam köken denetimi yapılıyor ve izinsiz üst düzey gezinmeler engelleniyor. |
| 3 | High | Store değişikliklerinde anahtar adına göre gizleme atlanıyordu (`auth.token`) | ✅ `Redactor.pathType` ile düzeltildi. |
| 4 | Medium | Güvenilmeyen içerik çit dışına çıkıyordu (`run_repro` hata metni, `get_repro_script`, Kanıt güveni) | ✅ |
| 5 | Medium | Yedek Markdown çitsizdi; `\r` ile yeni başlık açılabiliyordu | ✅ |
| 6 | Medium | Gizleme açıkları: `user[password]`, `#access_token=`, rrweb Meta `href`, DOM öznitelikleri, metin içindeki JSON, `anahtar: değer` çiftleri | ✅ |
| 7 | Low | Koşu sınıflandırması sayfa içeriğiyle manipüle edilebiliyordu | ✅ Sınıflandırma artık faz eki ile yapılıyor; mesaj önekine güvenilmiyor. |
| 8 | Low | Source map çözümleyici üçüncü taraf adreslere istek atıyordu | ✅ Yalnızca sayfanın kendi kökeni ve loopback adresleri çözülüyor. |
| 9 | Low | Bundler `production` koşulunu desteklemezse kaydedici üretim bundle'ına giriyordu | ✅ `NODE_ENV` dalı ve dinamik import ile çözüldü; esbuild testi eklendi. |

## 5. Sıradaki işler (öneri sırası)

1. **Cursor ve Codex smoke testi** (KK-5) ve kırmızı takım koşusu (FR-MCP-SEC-02).
2. **Mini benchmark** (KK-11): 8–10 hata, Rewind ile ve Rewind olmadan. Sitedeki "%60" ifadesi o zamana kadar "n=1" notuyla verilmeli (FRD §2.3).
3. **npm adlarının rezervasyonu** ve CI'dan provenance ile yayın (§11.3, KK-10).
4. **Ürün kararları:** AS-3 (kısayol), AS-4 (telefon), AS-5 (arayüz dili), AS-10 (önizleme olay başına mı, oturum başına mı).
5. **Kısayol çakışma testi** (FR-UI-03, AS-3): Windows, macOS ve Linux'ta; TR-Q, TR-F ve US düzenlerinde; IME açıkken `Alt+Shift+R`. Kısayol fiziksel tuşa (`KeyboardEvent.code`) bağlı olduğu için düzen değişse de aynı tuşla tetiklenir. Asıl risk, Windows'ta `Alt+Shift` ile dil değiştirme.
6. **`data-rewind-source` (v1.1, R13):** Derleme anında JSX'e kaynak konumu ekleyen Vite/Babel/SWC eklentisi. React 19'da HMR sonrası `resolved:false` kalan konumları kalıcı olarak çözer. EK-B3 bu işi "yedek plan"dan öncelikli işe taşıdı.
7. **EK-B3 ölçümünü CI'a almak:** `spikes/ek-b3` haftalık ya da sürüm öncesi bir işte çalışsın. Firefox kayıt e2e'si de eklensin (Firefox → "Doğrulandı").
8. **Sürüm notu:** NFR-PERF-01'in 5.000 düğümdeki INP sonucu (07 §0) ve HMR sınırı (R13).
