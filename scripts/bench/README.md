# Rewind NFR bench (KK-7)

Tekrarlanabilir ölçüm düzeneği: **NFR-PERF-01**, **NFR-MEM-01**, **NFR-LAT-01** (FRD §10). Sonuçların yorumu ve
son ölçüm: [`frd/07-nfr-olcumleri.md`](../../frd/07-nfr-olcumleri.md).

## Çalıştırma

```bash
npm install
npm run build                 # @rewind/shared + rewind-devtools + rewind-mcp (dist kullanılır, paket değiştirilmez)
npm run setup:browsers        # Playwright Chromium (bir kez)

npm run bench                 # hepsi: perf → lat → mem (~55 dk, 2 çekirdekte), sonda NFR tablosu
npm run bench -- --quick      # duman testi (~12 dk; daha az koşu/etkileşim, 60 sn bellek — resmî değildir)
npm run bench -- --only=perf  # yalnızca seçilenler (perf, lat, mem)

node scripts/bench/perf.mjs  [--runs=5] [--throttle=1,4] [--pages=demo,list] [--interactions=50] [--pace=700] [--modes=on,off[,rrweb]]
node scripts/bench/lat.mjs   [--samples=8] [--fill=65] [--questions=10] [--throttle=1,4] [--pages=demo,list]
node scripts/bench/mem.mjs   [--duration=180] [--sample=10] [--pages=demo,list] [--stress=1]
node scripts/bench/report.mjs                 # results/*-latest.json → Markdown tablo

# İnceleme (hedef kaçırıldığında nedeni bulmak / düzeltmeyi doğrulamak için)
node scripts/bench/investigate.mjs ablate [--page=demo] [--throttle=4] [--runs=4] [--variants=off,on,rrweb,on-noanim]
node scripts/bench/investigate.mjs replay [--throttle=4]       # Replayer sona sarma: useVirtualDom true/false
node scripts/bench/profile.mjs --page=list --throttle=4 --scenario=interactions|panel|save
```

Ortam değişkeni karşılıkları: `BENCH_RUNS`, `BENCH_THROTTLE`, `BENCH_PAGES`, `BENCH_QUICK=1`. Yeni bağımlılık yoktur:
Playwright, Vite (examples/demo bağımlılığı), MCP SDK (rewind-mcp bağımlılığı) depoda zaten var. Node 22, Linux/macOS/Windows.

Çıktılar: `results/<ad>-<zaman>.json` (yerel, git'e girmez) ve `results/<ad>-latest.json`.

## Düzenek

| Parça | Ne yapar |
|---|---|
| `lib/servers.mjs` | Vite geliştirme sunucusu (`demo` = `examples/demo` değiştirilmeden; `list` = `fixture/`). Kip: **on** = gerçek `rewind-devtools` dist, **off** = `dist/noop.js` (üretimdeki gibi kaydedici yok), **rrweb** = yalnızca rrweb (ayrıştırma). Gerçek alıcı: `packages/mcp/dist/cli.js` (stdio MCP + HTTP), geçici proje klasörüyle; "ajan" MCP istemcisiyle bağlanır. |
| `lib/browser.mjs` | Headless Chromium; CPU kısma `Emulation.setCPUThrottlingRate` (4x = "orta seviye dizüstü"). Sayfa içi gözlemciler: Event Timing (`durationThreshold: 16`), Long Tasks, checkout yoklayıcısı. |
| `lib/probe.js` | Yalnızca kayıt açık kipte sayfaya eklenir: Rewind'in kullandığı **aynı** rrweb örneğine (`record`) ölçüm erişimi. |
| `lib/shim-rrweb.js` | Ayrıştırma kipi: rrweb, Rewind'in `Recorder.start()` seçenekleriyle; panel/adım/ağ/konsol/yoklama yok. |
| `fixture/` | 5.000 öğeli liste (React, JSX'siz). 100'lük memo'lu parçalar; satır seçme, 100 satır güncelleme, filtre (binlerce `hidden` değişimi). `?ticker=ms` bellek stres senaryosu. |
| `perf.mjs` | NFR-PERF-01 |
| `mem.mjs` | NFR-MEM-01 |
| `lat.mjs` | NFR-LAT-01 |
| `report.mjs`, `run-all.mjs` | Tablo ve toplu koşu |
| `investigate.mjs` | Ayrıştırma (kapalı / yalnızca rrweb / tam Rewind / animasyonsuz Rewind) ve Replayer `useVirtualDom` deneyi |
| `profile.mjs` | CDP örnekleyici profil: modül ve fonksiyon bazında öz süre (etkileşim, panel açılışı, kaydet) |

## Yöntem (özet)

**NFR-PERF-01.** Her sayfa × kısma için kayıt açık/kapalı koşular dönüşümlü (≥ 5'er). Her koşu yeni bağlam, sayfa yüklenir,
2–3 sn beklenir, belirlenimci 50 etkileşim **700 ms tempoda** yapılır (koşu ≈ 35 sn; `bufferSeconds/2 = 30 sn`'de gelen
**doğal checkout** her koşuya düşer). Etkileşim gecikmesi = etkileşim penceresindeki Event Timing girdilerinin (interactionId)
en büyük süresi (16 ms eşiği altı = 16). INP = web-vitals tanımı (her 50 etkileşimde en kötü 1 atlanır); **INP p75** = koşu
INP'lerinin 75. yüzdeliği; hedef artış = p75(açık) − p75(kapalı). Long task'lar checkout yoklayıcısıyla ayrılır:
rrweb her tam görüntüde belge düğümü için yeni bir serileştirilmiş nesne üretir, `record.mirror.getMeta(document)` kimliği
50 ms'de bir yoklanır; değiştiği aralıkla çakışan long task "checkout"tur. "Kayıttan kaynaklanan" long task = kayıt açıkken
boşta (etkileşim dışı) görülen checkout dışı long task + etkileşim sırası bazında açık koşuların çoğunluğunda olup kapalıların
çoğunluğunda olmayanlar. Checkout süresi: canlı kayıtta `record.takeFullSnapshot(true)` (rrweb serileştirme + Rewind emit →
halka tampon → `estimateEventBytes`), koşu başına 3 kez. Liste sayfasında ayrıca maliyet dökümü (rrweb-snapshot
`snapshot()` Rewind seçicileriyle / seçicisiz, `JSON.stringify`).

**NFR-MEM-01.** Varsayılan ayarlar (60 sn tampon), **gerçek süre 180 sn** (zaman sıkıştırma yok). Kayıt açık ve kapalı oturum
aynı anda iki ayrı Chromium sürecinde; 10 sn'de bir iki kez `HeapProfiler.collectGarbage` → `Runtime.getHeapUsage`.
Fark (açık − kapalı) Rewind'in **toplam** JS heap ek yüküdür (rrweb kodu, mirror, tampon, ağ/konsol kayıtları, panel kökü);
tampon bunun bir parçası olduğundan fark ≤ 50 MB ise tampon da ≤ 50 MB'tır. "Sınırlı" = 90 sn'den (3 dilim dolar) sonra
fark büyümüyor (135–180 sn ortalaması − 90–135 sn ortalaması < 5 MB). Senaryolar: demo, liste, liste + 100 ms ticker (stres).

**NFR-LAT-01.** Gerçek alıcı. Tampon önce `--fill` sn (65 ≥ bufferSeconds) doldurulur. Panel açılışı: kısayol keydown
zaman damgası → panelin (ve tekrar oynatma iframe'inin) göründüğü karenin ardından gelen ilk rAF. Kaydet → onay: Kaydet
tıklamasının zaman damgası → `[data-rw="incident-id"]`'nin DOM'a girişi (önizlemesiz yol; oturumdaki ilk gönderimin
önizlemeli yolu ayrıca). Ajan sorusu: panel Kayıtlar sekmesinde, 0–3 sn rastgele bekleme → `reply_to_incident` → mesajın
panel DOM'una girişi (aynı makine saati).

## Uyarılar

- Headless Chromium; GPU/ekran yok. Sonuçlar makineye bağlıdır; ortam bilgisi her JSON'da (`env`).
- 4x CPU kısma yalnızca sayfa sürecini yavaşlatır (alıcı, Vite ve Node etkilenmez).
- Uygulama React 19 **geliştirme** kipinde çalışır (Rewind yalnızca dev'de çalışır); mutlak süreler üretimden yüksektir.
- Event Timing süreleri 8 ms'ye yuvarlanır; 16 ms altı raporlanmaz.
- Ölçüm sırasında `packages/rewind/dist` yeniden derlenirse `run-all` uyarı verir.
