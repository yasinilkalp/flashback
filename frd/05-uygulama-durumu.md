# Rewind — Uygulama durumu (FRD v1.0'a göre)

| Alan | Değer |
|---|---|
| Tarih | 27.10.2026 |
| Kod tabanı | Sıfırdan kuruldu. GitHub deposu boştu ve yerel klasörde yalnızca README ile yapılandırma dosyaları vardı. Bu nedenle FRD'deki "Durum" sütunu (README'ye göre "Mevcut") artık geçerli değil. Bu belge onun yerini alır; AS-9 kapandı. |
| Doğrulama | 408 birim testi, 19 uçtan uca test (gerçek Chromium) yeşil. Tip denetimi temiz. `npm run release:check` geçiyor. CI üç işletim sisteminde yeşil. EK-B3 ölçümü: 4 kurulum × 2 tarayıcı, sessizce yanlış satır 0 (`spikes/ek-b3/results/summary.md`). |
| Bağımsız güvenlik incelemesi | 9 bulgu çıktı: 3 High, 3 Medium, 3 Low. Bulguların 8'i exploit ile doğrulandı, 1'i kısmen doğrulandı. **Dokuzu da düzeltildi** ve her biri için regresyon testi eklendi (§4). |

## 1. Sürüm kabul kriterleri

| # | Durum | Kanıt |
|---|---|---|
| KK-1 | ✅ | `tests/e2e/full-flow.e2e.test.ts` YAZ10 ve KIS20 senaryolarında şu akışı otomatik olarak tamamlar: panel → `rewind-mcp` (gerçek stdio + HTTP) → kırmızı → kaynak düzeltilir → yeşil ×2 → `fixed`. |
| KK-2 | ✅ | Aynı dosyadaki ACCOUNT senaryosu: `storageState` yokken sonuç `precondition` olur ve kırmızı sayılmaz. `storageState` verilince kırmızı → yeşil ×2 → `fixed`. |
| KK-3 | ✅ | FR-LIFE-04'teki dört senaryo `packages/mcp/test/lifecycle.test.ts` dosyasında test ediliyor. Tam akış e2e testinde de çalışıyor. |
| KK-4 | ✅ | Güvenlik paketi (`security.test.ts`, `security.e2e.test.ts`) ve tüm uçtan uca testler GitHub Actions'ta Ubuntu, Windows ve macOS'ta yeşil (ör. 27.10.2026 tarihli 40506650677 numaralı koşu). |
| KK-5 | ○ | Cursor ve Codex ile elle yapılacak smoke testi henüz yapılmadı. |
| KK-6 | ✅ | Gizleme fixture seti (171 test) geçiyor. Bilinen sır biçimlerinde duyarlılık %100. Korunan 91 değerde yanlış pozitif 0. |
| KK-7 | ◐ | NFR-SIZE-01, NFR-TOK-01, NFR-REPRO-01 ve NFR-PRIV-01 testli. NFR-PERF-01, NFR-LAT-01 ve NFR-MEM-01 için sürüm öncesi ölçüm yapılmadı. |
| KK-8 | ✅ | EK-B3 yapıldı (`spikes/ek-b3/`): Vite + React 18.3 ve 19, Next.js 16 App Router + Turbopack ve webpack; Chromium ve Firefox. İlk yüklemede %100 doğru, sessizce yanlış satır 0. Sonuçlar FRD §3.3, R1 ve yeni R12'ye (FRD v1.0.1) ve README'ye işlendi. |
| KK-9 | ◐ | M ve M🔒 gereksinimlerin büyük çoğunluğunun testi var. Test kimliği eşlemesi tablo olarak çıkarılmadı. |
| KK-10 | ◐ | `release:check` geçiyor. CI'dan provenance ile yayın akışı ve npm adlarının rezervasyonu henüz yapılmadı (R8). |
| KK-11 | ○ | Mini benchmark yapılmadı. "%60" iddiası README'den çıkarıldı. |

## 2. Alanlara göre durum

| Alan | Uygulanan | Atlanan veya kısmi |
|---|---|---|
| REC | 01–08, 10, 11, 14; S: 09, 12, 13 | 15 (YH) |
| UI | 01, 02, 04, 06, 07, 08, 10, 11, 12, 15, 16; S: 05, 09, 14, 17, 18 | 03 (kısayol çakışma testi), 13 kısmi (ARIA var; axe denetimi ve focus trap yok), 10'daki "yanlış proje" göstergesi yalnızca şema sürümüne bakıyor, 19 (YH) |
| MARK | 01–05, 07, 08, 10, 11, 12; S: 09. 04 EK-B3 ile doğrulandı; 05'teki eski fiber kopyası hatası düzeltildi (§3, D-11) | 06 (Vue smoke testi yok), 13 (YH) |
| PKG | 01–08, SEC-01–03 | SEC-04 (YH) |
| RED | 01–15 | Telefon numarası varsayılan olarak kapalı (AS-4) |
| RCV | 01–05, 07–11, SEC-01–06, SEC-08 | 06 (köken uyuşmazlığı uyarısı), SEC-07 (YH) |
| MCP | 01–09, 11, 12, 15, SEC-01, SEC-03 | 10 (`outputSchema`), 13 (`cursor`), 14 (`portable`), 16 (YH), SEC-02 (kırmızı takım koşusu elle yapılacak) |
| REPRO | 01–22, SEC-01, SEC-03, SEC-04, SEC-05 | SEC-02 (C, `unsafe` mod), 23 (YH) |
| LIFE | 01–06 | — |
| CFG | 01–11 | 12 (v1.1) |
| NFR | PRIV-01, SIZE-01, TOK-01, REPRO-01, COMP-01 (Node ≥ 22, Chromium) | PERF-01, LAT-01, MEM-01 ölçümü |

## 3. FRD'den sapmalar (onay ya da FRD güncellemesi gerekiyor)

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

1. **`data-rewind-source` (v1.1, R12):** Derleme anında JSX'e kaynak konumu ekleyen Vite/Babel/SWC eklentisi. React 19'da HMR sonrası `resolved:false` kalan konumları kalıcı olarak çözer. EK-B3 bu işi "yedek plan"dan öncelikli işe taşıdı.
2. **EK-B3 ölçümünü CI'a almak:** `spikes/ek-b3` haftalık ya da sürüm öncesi bir işte çalışsın; Next.js/React sürüm yükseltmelerinde regresyonu yakalasın. Firefox kayıt e2e'si de eklensin (Firefox → "Doğrulandı").
3. **Cursor ve Codex smoke testi** (KK-5) ve kırmızı takım koşusu (FR-MCP-SEC-02).
4. **Mini benchmark** (KK-11): 8–10 hata, Rewind ile ve Rewind olmadan.
5. **NFR ölçümleri:** INP, bellek, gecikme.
6. **npm adlarının rezervasyonu** ve CI'dan provenance ile yayın (§11.3).
7. §3'teki sapmaların FRD'ye işlenmesi (v1.1 belgesi).
