# EK-B3: Kaynak satırı çözümleme spike'ı

FRD §3.5'in sorusu: Flashback, işaretlenen öğenin JSX'inin yazıldığı `dosya:satır`'ı gerçek kurulumlarda doğru buluyor mu? Bulamadığında bunu açıkça söylüyor mu?

**Ölçüt:** Her kurulumda 20 rastgele seçimde doğru çözülme oranı ≥ %90 ve sessizce yanlış satır (`resolved:true` ama yanlış konum) **0**.

## Sonuç

| Kurulum | İlk yükleme (66 öğe / 20 rastgele / panelde 12 seçim) | RSC | HMR sonrası | Karar (FRD §3.3) |
|---|---|---|---|---|
| Vite 8.3.5 + React 19.3.1 | 66/66 · 20/20 · 12/12 | — | yanlış 0; düzenlenen bileşenlerin öğeleri `resolved:false` | Doğrulandı |
| Vite 8.3.5 + React 18.3.1 | 66/66 · 20/20 · 12/12 | — | 64/66 doğru, 2 `resolved:false`, yanlış 0; panelde 12/12 | Doğrulandı |
| Next.js 16.4.3 App Router + Turbopack | 66/66 · 20/20 · 12/12 | 6/6 | yanlış 0; düzenlenen bileşenler ve RSC `resolved:false` | Doğrulandı (RSC: en iyi çaba) |
| Next.js 16.4.3 App Router + webpack | 66/66 · 20/20 · 12/12 | 6/6 | yanlış 0; düzenlenen bileşenler ve RSC `resolved:false` | Doğrulandı (RSC: en iyi çaba) |

Chromium 153 ve Firefox 155 her hücrede aynı sonucu verdi. **Sessizce yanlış satır hiçbir kurulumda, hiçbir aşamada çıkmadı.** "Panelde seçim", gerçek akış demek: geri sar → **S** → tekrar oynatmada tıkla → `selected-source`. Next.js'te `<Flashback />` takılıyken hydration hatası görülmedi; konsoldaki hatalar yalnızca favicon 404'ü ve ölçümde alıcının çalışmamasından geliyor. Ayrıntılı tablo [`results/summary.md`](results/summary.md), öğe öğe ham veri [`results/results.json`](results/results.json) dosyasında. Yerel yollar `<repo>` ile değiştirildi.

Ölçüt sağlandı, ama ilk ölçümde sağlanmıyordu: aşağıdaki düzeltmelerden önce Turbopack'te sessizce yanlış satırlar vardı, webpack'te ise hiçbir şey çözülmüyordu. Düzeltmelerin hepsi `flashback-devtools` ve `flashback-mcp`'ye girdi ve birim testleri yazıldı.

## Yöntem

- **Fixture** (`fixture/`): 66 istemci öğesi ve (yalnızca Next.js'te) 6 sunucu bileşeni öğesi. Her öğe `data-ekb3="src/…/Dosya.tsx:<satır>"` ile doğru yanıtı taşır. Etiketleri `fixture.mjs` kaynak dosyadan üretir; elle yazılmaz. Kapsanan kalıplar:
  - düz ve çok satırlı açılış etiketleri, `map` listeleri, koşullu öğeler,
  - `forwardRef`, `memo`, sınıf bileşeni, `children` olarak geçen ve render prop ile üretilen öğeler,
  - yardımcı fonksiyonda, `useMemo`'da ve modül düzeyinde oluşturulan öğeler, `Fragment`,
  - portal, `React.lazy` ile yüklenen parça, efektten sonra beliren öğe,
  - önünde 100 satır TypeScript (enum, generic, `satisfies`, `#private`) olan uzun dosya,
  - `node_modules`'tan gelen, kaynak haritası olmayan bir kütüphane bileşeni (`lib/`),
  - async sunucu bileşeni.
- **Uygulamalar** (`apps/`): aynı fixture'ı çalıştıran üç uygulama: Vite + React 19, Vite + React 18 ve Next.js 16 (`next dev --turbopack` / `--webpack`). `flashback-devtools`, yayımlanacak tgz paketinden kurulur ve `<Flashback />` takılıdır. StrictMode açıktır.
- **Ölçüm** (`measure.mjs`):
  - *probe:* `probe.ts` sayfaya enjekte edilir ve panelin kullandığı kodu (`getFiber` → `locateSource` → `SourceResolver`) her etiketli öğede çalıştırır. Ayrıca 20 öğelik sabit tohumlu bir rastgele örnek raporlanır.
  - *HMR:* Sunucu çalışırken her dosyanın başına gerçekçi bir düzenleme gibi 3 satır kod eklenir. Fast Refresh uygulanınca probe **aynı** çözümleyiciyle tekrarlanır (önbellekteki eski haritalar da sınanır).
  - *panel:* Gerçek akış; tekrar oynatmada görünen öğelerden 12'si seçilir ve `selected-source` okunur.
- **Sınıflandırma:**
  - `correct`: dosya ve satır doğru.
  - `unresolved`: `resolved:false` ya da konum yok; FR-MARK-11'e göre kabul edilen düşüş.
  - `wrong`: `resolved:true` ama yanlış konum; ölçüt 0.

## Bulgular ve düzeltmeler

| # | Bulgu | Etki (düzeltmeden önce) | Düzeltme |
|---|---|---|---|
| 1 | Turbopack, Next'in derlenmiş React'ini `node_modules_next_dist_compiled_…` adlı chunk'lara koyuyor. `exports.jsx` ve RSC'nin `fakeJSXCallSite` çerçevesi kullanıcı kodu sanılıyordu. | Kütüphane öğesi ve 6 RSC öğesi **sessizce yanlış** dosyaya (React'in kendi dosyası) çözüldü. | İç çerçeve listesi genişletildi (`stack.ts`). Source map bir adayı `node_modules`'a çözerse sıradaki adaya geçiliyor (`locate.ts`). Kullanıcı koduyla aynı chunk'a düşen kütüphaneler ancak çözümlemeden sonra ayırt edilebiliyor. |
| 2 | Next.js webpack'te çerçeve URL'si `webpack-internal:///(app-pages-browser)/./src/…`. Ayrıştırıcı paranteze takılıyordu. URL getirilemiyor (`eval-source-map`). | **0/66.** Panel `—` gösteriyordu (yanlış satır yok). | Ayrıştırıcı parantezli URL'leri kabul ediyor. Modülün satır içi haritası, sayfanın yüklediği chunk'lardaki `//# sourceURL=` işaretinden bulunuyor; en yeni chunk önce, yani HMR güncellemesi eski kopyanın önüne geçiyor (`sourcemap.ts`, `environment.ts`). webpack-dev-server için de geçerli, ama orada ölçülmedi. |
| 3 | RSC çerçevesi `about://React/Server/<sunucu dosyası>?n`. Harita yalnızca sunucuda. | RSC öğeleri Turbopack'te yanlış (bkz. 1), webpack'te konumsuz. | Next.js dev sunucusunun `/__nextjs_source-map?filename=` ucu kullanılıyor (React'in `findSourceMapURL`'ü de bunu kullanır). Uç belgelenmemiş olduğu için **en iyi çaba**. |
| 4 | **DOM düğümündeki fiber eski kopya olabilir.** React `__reactFiber$` anahtarını yalnızca öğe oluşturulurken yazar, çift tamponda diğer kopya güncel olabilir. | Eski konum. Ayrıca **eski props/state**: FR-MARK-05'in "canlı" iddiası her güncellemede yaklaşık yarı yarıya yanlıştı. Spike'tan bağımsız, tüm kurulumları etkileyen bir hata. | React'in `findCurrentFiberUsingSlowPath` algoritmasıyla güncel kopya seçiliyor. Atalara da güncel kopyadan çıkılıyor (`fiber.ts`). |
| 5 | **React 19 `_debugStack`'i yalnızca fiber oluşturulurken yazar** (`createFiberFromElement`); güncellemede yenilemez. HMR ile satırlar kayınca konum bayatlar. | HMR sonrası dört React 19 kurulumunda da öğelerin çoğu **sessizce yanlış** satıra düştü (panelde 12 seçimden 8–11'i). | Bayatlık sinyali: öğeyi oluşturan bileşenin `type`'ı (Fast Refresh'in en güncel uygulaması) `elementType`'ından (mount anındaki; `React.lazy` ve RSC istemci referansı açılır) farklıysa konum `resolved:false` olur ve dosya adı verilir. RSC'de `?_rsc=` yenilemesinden sonra, Turbopack'in HMR modüllerinde (`chunk.js?id=`) de `resolved:false`. Kalıcı çözüm: `data-flashback-source` (FRD v1.1 R13). |
| 6 | React 18 `_debugSource`'u uzlaştırmada yeniler, ama bailout ile kopyalanan fiber'a aktarmaz. İki kopya farklı satır gösterebilir. | HMR sonrası 2/66 sessizce yanlış. | Kopyalar çelişiyorsa: props nesneleri farklıysa güncel kopya taze, aynıysa `resolved:false`. |
| 7 | React 18 `_debugSource`, Turbopack ve webpack haritaları mutlak yol veriyor (`C:/Users/<ad>/…`). Windows'ta `file:///C:/…` yanlış ayrıştırılıyordu (`/C:/…`). | Tutarsız `dosya:satır` ve kullanıcı adının pakete girmesi. | `file://` ayrıştırması düzeltildi. Alıcı (`flashback-mcp`), proje kökü içindeki mutlak yolları göreli yapıyor (`paths.ts`). |

## Kalan sınırlar

- **React 19 + HMR (R13):** Fast Refresh ile değişen bir bileşenin değişiklikten önce mount edilmiş öğeleri, sayfa yenilenene kadar `resolved:false` kalır. Gerekçe panelde ve raporda görünür, dosya adı verilir. Bu durum React'in kendi tasarımından geliyor; tarayıcı tarafında güvenilir bir çözümü yok. Önerilen kalıcı çözüm, derleme anında konum ekleyen `data-flashback-source` eklentisi (v1.1).
- **RSC:** Next.js'in belgelenmemiş ucuna dayanıyor. Sayfa yüklendikten sonra RSC yükü bir kez bile yenilenirse (HMR, istemci gezinmesi) sunucu öğeleri `resolved:false` olur. Bu tutucu bir kural: gezinmeden sonra taze mount edilen öğeleri de kapsar.
- **Ölçülmeyenler:** Next.js Pages Router, Next.js 15, webpack-dev-server (CRA vb.), Safari, React canary (CI'daki canary işi yalnızca panel e2e'sini çalıştırıyor), Linux ve macOS (bu ölçüm Windows 11'de yapıldı; birim testleri CI'da üç işletim sisteminde koşuyor).
- **Firefox:** Kaynak çözümleme Chromium ile aynı sonucu verdi. Kayıt tarafı CI'da Firefox'ta test edilmediği için matriste "en iyi çaba"da kalıyor.

## Yeniden çalıştırma

```bash
npm run build                         # depo kökünde
node spikes/ek-b3/prepare.mjs         # tgz paketleri, etiketli fixture, uygulama bağımlılıkları
npx playwright install chromium firefox
node spikes/ek-b3/measure.mjs         # tümü; --only=vite-r19,next-webpack --browsers=chromium --no-hmr --no-panel
```

Bir koşu yaklaşık 10 dakika sürer. Next.js uygulaması her bundler'dan önce `.next` klasörünü siler. Sunucu günlükleri `.logs/` klasörüne yazılır (git'e girmez).
