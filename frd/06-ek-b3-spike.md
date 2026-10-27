# EK-B3 — Kaynak çözümleme spike'ı (sonuç raporu)

| Alan | Değer |
|---|---|
| Tarih | 27.10.2026 |
| FRD bağlantısı | §3.3 (destek matrisi), §3.5 (EK-B3), KK-8, FR-MARK-04/06/11, FR-CFG-07, R1, AS-7 |
| Kapsam | React 19 ve 18.3; Vite, Next.js App Router (Turbopack ve webpack); Chromium ve Firefox; Vue smoke testi |
| Ölçüt (§3.5) | Her kurulumda en az 20 öğede dosya:satır **≥ %90 doğru** ve **0 yanlış**. Çözülemeyen her durum `resolved:false` olmalı. |
| Sonuç | **Ölçülen dört React kurulumunun hepsinde %100 doğru, 0 yanlış.** Firefox ölçülemedi (tarayıcı indirilemedi). Vue smoke testi geçti. `data-rewind-source` yedeğine v1.0 için gerek yok. |

## 1. Sonuç tablosu

Değerler, panelin gerçek seçim yolundan (tekrar oynatmada öğeye tıklama) panelin gösterdiği `dosya:satır` ile alındı (yöntem: §2).

| # | React | Geliştirme sunucusu | Tarayıcı | Öğe | Doğru | `resolved:false` | Ata öğe | **Yanlış** | Düzeltmeden önce (HEAD) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 19.3.1 | Vite 8.3.5 + @vitejs/plugin-react 6.1.2 (demo) | Chromium | 24 | 24 (%100) | 0 | 0 | **0** | Kod yolu değişmedi; önceki e2e testi de bu kurulumu doğruluyordu. |
| 2 | 18.3.1 | Vite 8.3.5 + @vitejs/plugin-react 6.1.2 | Chromium | 25 | 25 (%100) | 0 | 0 | **0** | Satırlar doğruydu, ancak yol mutlaktı ve kod parçası yoktu. Bu yüzden Kanıt güveni "uyarı" veriyordu. |
| 3 | 19.3.0-canary-278794d7-20261002 (Next'in paketlediği) | Next.js 16.4.3 App Router, **Turbopack** | Chromium | 24 istemci + 4 RSC | 24 + 4 (%100) | 0 | 0 | **0** | İstemci öğeleri 24/24 doğruydu. **RSC öğelerinin 4/4'ü YANLIŞTI**: `node_modules/next/dist/compiled/react-server-dom-turbopack/…client.browser.development.js:3642`, `resolved:true`. |
| 4 | aynı | Next.js 16.4.3 App Router, **webpack** (`next dev --webpack`) | Chromium | 24 istemci + 4 RSC | 24 + 4 (%100) | 0 | 0 | **0** | İstemci öğelerinin 0/24'ü doğruydu (23'ünde kaynak yoktu, 1'i `resolved:false`). RSC öğelerinin 0/4'ü doğruydu (kaynak yoktu). |
| 5 | 19.3.1 | Vite 8.3.5 (demo) | **Firefox** | — | **ölçülmedi** | — | — | — | Playwright Firefox indirilemedi: ağ politikası `cdn.playwright.dev` ve `playwright.download.prss.microsoft.com` adreslerini 403 ile engelledi. |
| 6 | — (panel için React 19.3.1) | Vue 3.5.44 + Vite 8.3.5 + @vitejs/plugin-vue 6.0.10 | Chromium | smoke | — | — | — | — | Geçti: `source.framework = "vue"`, `componentStack: []`, `resolved:false` ve "React dışı" gerekçesi. Kayıt, zaman çizelgesi, adımlar ve DOM anlık görüntüsü tam; sayfa hatası yok. |

**Sınır durumu (ayrı test, `examples/next-app/app/owner-limit`).** React 19, yaklaşık 1 saniye içinde 10 000'den fazla
öğe oluşturulursa gerçek sahip yığını yerine paylaşılan `UnknownOwner` yığınını verir (bkz. `react-jsx-dev-runtime`
içindeki `recentlyCreatedOwnerStacks`). Bu durumda öğenin kendi satırı bilinemez. Rewind ne yanlış satır ne de "doğru"
gibi görünen bir satır verir. Panelde `app/layout.tsx:11 (ata öğe)` gösterilir. Kanıt güveninde "kaynak: … öğenin
kendisinin değil, onu oluşturan en yakın atanın JSX'i" uyarısı çıkar. Sonuç Turbopack ve webpack'te aynıdır.

**Düzeltmeden önceki ölçüm nasıl alındı?** HEAD'deki `fiber.ts`, `stack.ts` ve `sourcemap.ts` aynı geliştirme
sunucularına karşı aynı öğelerle Node tarafında çalıştırıldı. Fiber verisi sayfadan, haritalar sunucudan alındı.

### Kapsanan JSX kalıpları

Next ve React 18 örneklerinde aynı bileşen ağacı kullanıldı:

- ölçülen her öğe için bir **liste** (`.map`) ve **ok fonksiyonu içinde JSX**,
- `memo`, `forwardRef`, **sınıf bileşeni**, `Fragment`,
- **children prop**'u (öğe üst bileşende yazılır, alt bileşende render edilir),
- **yardımcı fonksiyonun döndürdüğü JSX**,
- **modül düzeyi sabit** (sahibi olmayan öğe),
- **portal** (`createPortal` → `document.body`),
- iç içe kapsayıcılar.

Next örneğinde bunlara ek olarak `layout.tsx` ve `page.tsx` içinde iç içe **sunucu bileşenleri (RSC)** vardır.
Demo ölçümünde (React 19 + Vite) demo kaynağı değiştirilmedi.

## 2. Yöntem

1. **Örnekler.**
   - `examples/next-app`: Next 16.4.3 App Router. `'use client'` sarmalayıcısıyla `<Rewind/>` eklendi (FR-CFG-07).
   - `examples/react18`: React 18.3.1 + Vite.
   - `examples/vue`: Vue 3. Panel ayrı bir React kökünde çalışır.
   - `examples/demo`: React 19 + Vite, mevcut demo.
2. **Beklenen satır.**
   - Örneklerde her ölçülen öğenin JSX açılış satırında bir `data-testid="…"` işareti vardır. Beklenen dosya ve satır,
     kaynak dosyası taranarak bulunur (`markerTargets`).
   - Demo kaynağına dokunulmadı. Beklenen satır, dosyada yalnızca bir kez geçen bir JSX parçasından bulunur
     (`findTarget`).
3. **Gerçek panel yolu.** Her öğe için şu adımlar izlenir:
   - Panel açılır.
   - "Seç" ile tekrar oynatmada öğeye tıklanır. Tıklama noktası, `elementFromPoint` ile öğenin kendisini veren ve ±1,5 px
     yuvarlama payına dayanıklı bir noktadır.
   - Panelin gösterdiği `selected-source` okunur.
   - Panelin ürettiği seçicinin tekrar oynatmada aynı öğeyi bulduğu doğrulanır. Böylece ölçülen şey tıklama değil,
     çözümleme olur.

   Her seçimden önce sayfa düzeyi seçime geçilir; bu, önceki sonucun okunmasını önler. Ayrıca her kurulumda bir olay
   gerçekten gönderilir ve sahte alıcıya ulaşan taslak doğrulanır: `file`, `line`, `resolved`, `snippet`,
   `componentStack`, `source.framework` ve Kanıt güveni.
4. **Değerlendirme.**

   | Sonuç | Koşul |
   |---|---|
   | Doğru | Gösterilen yol, beklenen göreli yolla biter ve satır eşittir. |
   | `resolved:false` | Panel "(çözülemedi)" gösterir. |
   | Ata öğe | Panel "(ata öğe)" gösterir. |
   | Yanlış | Çözüldü görünen ama satırı ya da dosyası farklı olan sonuç. |
   | Yok | Panel "—" gösterir. |

5. **Öğe seçimi.** FRD "20 rastgele öğe" diyor. Beklenen satır işaretle bulunduğu için rastgele seçim yerine kalıpları
   kapsayan **sabit ve daha geniş bir küme** kullanıldı: kurulum başına 24–28 öğe. Böylece sonuç CI'da yeniden
   üretilebilir.
6. **Ortam.**
   - Linux, Node 22.23, Playwright 1.63 (chromium-1243).
   - Next için `next dev` Next'in JS girişinden `process.execPath` ile başlatılır. Turbopack `.next`, webpack
     `.next-webpack` çıktı klasörünü kullanır; Next 16 aynı klasörde ikinci bir geliştirme sunucusunu reddeder.
   - Soğuk başlangıçta iki Next sunucusuyla tüm test dosyası yaklaşık 35 sn sürer.

Testler (CI'da her push'ta; React 19 ve Vite demo testi Firefox kuruluysa Firefox'ta da çalışır):

```bash
npm run build
npx vitest run --config vitest.e2e.config.ts packages/rewind
# packages/rewind/test/{next,react18,vue,source-demo}.e2e.test.ts — her biri "[EK-B3] …" özetini yazdırır
```

## 3. Ne düzeltildi (`packages/rewind`)

| # | Sorun | Etki (önce) | Düzeltme | Test |
|---|---|---|---|---|
| 1 | V8 yığın satırı ayrıştırıcısı, URL'de parantezi kabul etmiyordu: `webpack-internal:///(app-pages-browser)/./app/x.tsx` | Next webpack'te hiçbir çerçeve ayrıştırılamıyordu, bu yüzden kaynak yoktu (0/24). | URL artık boşluksuz herhangi bir dizi olabilir. eval çerçeveleri (`eval at …`, Firefox `line 2 > eval`) ve `[native code]` atlanır. | `source.test.ts` |
| 2 | Turbopack parça adları karma (`_0pfk…._.js`), React Flight istemcisinin `fakeJSXCallSite` çerçevesi | RSC öğesi `node_modules/…/react-server-dom-turbopack-client…:3642` olarak **yanlış** ve `resolved:true` görünüyordu. | Çerçeve seçimi **çözümlemeden sonra** yapılır: çözülen orijinal dosya `node_modules`, paketleyici çalışma zamanı ya da Rewind ise sıradaki çerçeveye geçilir (`isInternalSource`). `fakeJSXCallSite` ve `react-server-dom` sözdizimsel olarak da elenir. | `source.test.ts`, `locate.test.ts` |
| 3 | RSC sunucu çerçeveleri `about://React/Server/<dosya>?n` (19.0'da `rsc://…`), webpack istemci modülleri `webpack-internal:///…` (eval-source-map) | Tarayıcı bu URL'leri getiremez; sonuç ya kaynak yok ya da yanlış satırdı. | `window.next` varsa (yalnızca Next geliştirme sunucusu) bu çerçevelerin haritası Next'in kendi ucundan alınır: `/__nextjs_source-map?filename=…`. Uç **sayfanın kendi kökenindedir**, bu yüzden NFR-PRIV-01 korunur. Harita, dosya başına önbelleğe alınır. | `source.test.ts`, `locate.test.ts` |
| 4 | RSC öğesinin sunucu satırı çözülemezse eski kod istemci atalarına çıkıyordu. | Örneğin `<Providers>` sarmalayıcısının satırı gösterilebiliyordu; bu, **yanlış dosya** demektir. | `_debugOwner` bir sunucu bileşeni bilgisiyse (`env` alanı var, fiber değil) atalara çıkılmaz. Sonuç `resolved:false` ve "React Server Component" gerekçesidir. | `fiber.test.ts`, `locate.test.ts` |
| 5 | Öğenin kendi yığınında kullanıcı çerçevesi yok (bağımlılık içi öğe ya da `UnknownOwner`). | Ata satırı, öğenin kendi satırıymış gibi gösteriliyordu. | `react_stack_bottom_frame` sonrasındaki çerçeveler atılır; bunlar React iş döngüsü ya da modül yükleme zinciridir ve içe aktaran kullanıcı modülünü gösterebilir. `UnknownOwner` yığını yok sayılır. Atadan gelen konum `fromAncestor` olarak işaretlenir: panelde "(ata öğe)", Kanıt güveninde uyarı, `resolutionReason` içinde açıklama. | `source.test.ts`, `locate.test.ts`, e2e `owner-limit` |
| 6 | Yol normalleştirme | — | `file:///C:/…` → `C:/…`, yüzde kodlaması çözülür, `turbopack:///[project]/…` ve `[project]/…` öneki atılır, `webpack://./…` desteklenir. | `source.test.ts` |
| 7 | Turbopack bölümlü (index) source map | — | `source-map-js` `sections` biçimini destekliyor (IndexedSourceMapConsumer); doğrulandı. Kod parçası ve dosya özeti bölümlü haritada da üretilir. | `source.test.ts` |
| 8 | React 18 `_debugSource` mutlak yolu | Yol mutlaktı ve kod parçası yoktu; Kanıt güveni uyarı veriyordu. | Sayfanın yüklediği modül URL'si (Resource Timing ve `<script src>`) mutlak yolun sonuyla eşleşirse yol dev sunucusu köküne göreli yapılır (`src/Cart.tsx`). Modülün source map'indeki içerikten ±3 satır kod parçası ve dosya özeti eklenir. Eşleşme yoksa mutlak yol kalır; bu da doğrudur. | `source.test.ts`, e2e |
| 9 | Firefox ve Safari çerçeve biçimi | — | `async*` öneki, URL içindeki `@` (Vite `/@fs/`), iç içe kapanış adları (`f/<`), adsız çerçeve, `global code` desteklenir. | `source.test.ts` (Firefox çıktısı örnekleri) |
| 10 | Konsol kaynağı Turbopack'te bağımlılığa çözülebiliyordu. | Konsol satırı `node_modules` içini gösterebiliyordu. | Çözülen dosya bağımlılıksa yığındaki sonraki kullanıcı çerçevesi denenir. | `locate.test.ts` |
| 11 | FR-MARK-06: React dışı öğe | Yükte `framework: "react"` sabitti. | `source.framework` artık `react`, `vue`, `svelte` ya da `unknown` olur ve önce hedef öğeden, sonra sayfadan belirlenir. Rewind'in kendi React kökü gölge DOM'da olduğu için Vue sayfasını "react" yapmaz. React dışı öğede `resolutionReason` "React fiber yok: öğe React dışı bir çerçeveden (vue)…" olur. | `framework.test.ts`, `vue.e2e.test.ts` |

Ajana giden yol biçimleri kuruluma göre değişir:

| Kurulum | Yol biçimi | Örnek |
|---|---|---|
| Vite (React 19 ve 18) | Dev sunucusu köküne göreli | `src/Cart.tsx` |
| Next webpack, istemci | Next uygulama köküne göreli | `app/components/Cart.tsx` |
| Next Turbopack (istemci ve RSC), Next webpack RSC | Mutlak dosya yolu | `/…/app/page.tsx` |

Hepsi doğru dosyayı gösterir. Tutarlılık için öneri: `rewind-mcp` mutlak yolları proje köküne göreli yazsın; göreli
yolları da proje kökü ya da çalışma alanı altında doğrulasın (§5).

Paylaşılan pakete (`@rewind/shared`) ve şemaya dokunulmadı. `rewind-mcp` değişmedi.

## 4. Kalan sınırlar

- **Firefox ve Safari ölçülmedi.** Yığın biçimi gerçek Firefox çıktısı örnekleriyle birim testinde sabitlendi.
  SpiderMonkey ve JavaScriptCore'da sütunların 1 tabanlı olduğu varsayımı tarayıcıda doğrulanmadı. CI'a engellemeyen
  bir iş eklendi (`firefox-source`): bu iş Firefox'u kurar ve React 19 ve Vite demo matrisini Firefox'ta da çalıştırır.
- **RSC satırı Next'in belgelenmemiş geliştirme ucuna bağlıdır** (`/__nextjs_source-map`). Next 16.4.3'te doğrulandı.
  Next değiştirirse sonuç `resolved:false` olur, yanlış satır verilmez. Next dışı RSC çerçeveleri (Waku, Parcel RSC)
  için de sonuç `resolved:false`'tur.
- **Düz webpack-dev-server** (`eval` / `eval-source-map`) kurulumunda `webpack-internal://` çerçevelerinin haritası
  için bir uç yoktur; sonuç `resolved:false` olur. Bu kurulum ölçülmedi. v1.1 adayı: yüklü parçalarda modülün satır içi
  haritasını aramak.
- **React 18'de göreli yol**, Resource Timing tamponuna bağlıdır (varsayılan 250 giriş). Çok modüllü uygulamalarda yol
  mutlak kalabilir ve kod parçası çıkmayabilir; satır yine doğrudur.
- **Sahip yığını sınırı.** React 19'da yaklaşık 1 saniyede 10 000'den fazla öğe oluşturulursa öğenin kendi satırı
  bilinemez; sonuç "ata öğe" olarak işaretlenir (§1).
- **Ölçülmeyen kurulumlar:** React 18 + Next (Pages Router), Next 15 ve öncesi, Safari, Windows ve macOS'ta tarayıcıda
  ölçüm. Yeni e2e testleri CI'da üç işletim sisteminde de koşacak.
- Next App Router her zaman kendi paketlediği React canary sürümünü kullanır. Bu nedenle "React 19.x canary" yolu Next
  üzerinden fiilen ölçülmüş oldu. Ayrı React canary CI işi (R1) yeni testleri de kapsar.

## 5. Öneriler

### 5.1 Destek matrisi (§3.3)

| Boyut | Doğrulandı (v1.0) | En iyi çaba | Desteklenmiyor |
|---|---|---|---|
| React | 18.3 (Vite), 19.x (Vite; Next 16'nın paketlediği 19.3 canary) | React 18.3 + Next Pages Router | < 18.3 |
| Geliştirme sunucusu | Vite 8, **Next.js 16 App Router (Turbopack ve webpack)** | webpack-dev-server, Next Pages Router, Next ≤ 15 | — |
| RSC kaynak satırı | — | **Next.js 16 geliştirme sunucusu** (8/8 doğru; çözülemezse `resolved:false`) | Next dışı RSC çerçeveleri |
| Kayıt tarayıcısı | Chrome, Edge (Chromium) | Firefox, Safari (ölçülmedi; `firefox-source` CI işi yeşil kalırsa Firefox "Doğrulandı"ya çıkar) | — |
| Çerçeve (bileşen bilgisi) | React | Vue (smoke testi geçti; bileşen yığını boş, diğer veriler tam) | Svelte |

Bunlara bağlı FRD değişiklikleri:

- **Dipnot ¹ sağlandı.** Next.js "Doğrulandı" sütununda kalır. README buna göre güncellendi.
- **Dipnot ²:** Firefox "En iyi çaba" sütununda kalır.
- **§3.2:** "React Server Components için kaynak çözümleme: kapsam dışı" satırı "En iyi çaba (yalnızca Next.js
  geliştirme sunucusu)" olarak güncellenmeli.
- **FR-MARK-06:** Durumu ◐ yerine ✅ olabilir (Vue smoke testi CI'da).
- **FR-CFG-07:** Next App Router örneği CI'da çalışıyor; webpack kipi de aynı örnekle test ediliyor.
- **KK-8:** Spike yapıldı ve sonuçları bu belgede. Matris değişikliğini teknik lider onaylayınca ✅ olur.
- **AS-7 yanıtı:** Next.js Turbopack ve webpack "Doğrulandı"; RSC "En iyi çaba".

### 5.2 R1 ve `data-rewind-source` yedeği

**v1.0 için gerekmez.** Ölçüt bütün React kurulumlarında %100 doğru ve 0 yanlış ile sağlandı. Kalan riskler zarif
düşüşle karşılanıyor: çözülemeyen durumda `resolved:false`, atadan gelen konumda "ata öğe" işareti.

R1 hâlâ geçerli. Mekanizma React'in belgelenmemiş `_debugStack` ve `_debugSource` alanlarına, artık ayrıca Next'in
geliştirme ucuna dayanıyor. Öneriler:

- Yedek plan v1.1'de **tetikleyiciye bağlı** kalsın. Tetikleyiciler: React canary CI işi ya da yeni e2e testleri
  (`next`, `react18`, `source-demo`) kırmızıya düşerse, veya Firefox ölçümü %90 altında çıkarsa.
- `rewind-mcp`: mutlak `target.file` yollarını proje köküne göreli yazmak (§3 sonu) ve `resolutionReason` alanını
  raporda göstermek, ajan için küçük ama faydalı iki iyileştirme.

## 6. Değişen ve eklenen dosyalar

- **Kaynak:**
  - `packages/rewind/src/source/stack.ts`, `sourcemap.ts`, yeni `locate.ts`
  - `packages/rewind/src/dom/fiber.ts`
  - `packages/rewind/src/draft/collect.ts`, `build.ts`, `confidence.ts`
  - `packages/rewind/src/controller.ts`
  - `packages/rewind/src/ui/Compose.tsx`, `i18n.ts`
- **Birim testleri:**
  - `packages/rewind/test/source.test.ts`, `fiber.test.ts` (güncellendi)
  - yeni `locate.test.ts`, `framework.test.ts`
- **Uçtan uca testler:**
  - yeni `packages/rewind/test/{next,react18,vue,source-demo}.e2e.test.ts`
  - yeni ortak yardımcı `e2e-utils.ts` (`panel.e2e.test.ts` bunu kullanacak şekilde sadeleştirildi)
- **Örnekler:** `examples/next-app`, `examples/react18`, `examples/vue`. Her birinde `typecheck` betiği var; kök
  `npm run typecheck` bunları da denetler.
- **CI:** `.github/workflows/ci.yml` dosyasına engellemeyen `firefox-source` işi eklendi.
- **Belgeler:** `README.md` (bilinen sınırlar, depo yapısı), `packages/rewind/README.md` (Next örneği, React dışı
  kurulum).
