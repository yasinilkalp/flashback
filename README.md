# Flashback

**Hatayı anlatma; o ana dön, göster.**

🌐 [yasinilkalp.github.io/flashback](https://yasinilkalp.github.io/flashback/)

Flashback, yapay zekâ kodlama ajanları için zaman yolculuklu bir hata raporlama aracıdır. Geliştirme ortamında uygulamanın en az son 60 saniyesini arka planda kaydeder. Bir şey bozulduğunda geri sararsınız, sorunun başladığı anı bulursunuz, ekrandaki öğeye tıklarsınız (ya da öğesi olmayan bir hata için sayfa düzeyinde olay açarsınız) ve "ne olmalıydı?" sorusunu yanıtlarsınız. Ajana gidecek içeriği gizlenmiş hâliyle önizleyip gönderirsiniz.

Ajanınız (Claude Code, Cursor, Codex…) MCP üzerinden şu bilgileri içeren bir **olay paketi** alır:

| | |
|---|---|
| 🎯 **İşaretlenen öğe** | CSS seçici, JSX'in yazıldığı dosya:satır (source map ile çözülür, ±3 satırlık kod parçası), bileşen yığını, props/state, o andaki HTML |
| 🔎 **Kanıt güveni** | Kanıtın ne kadar güvenilir olduğu: kaynak çözümlendi mi, öğe eşlendi mi, props/state canlı mı, pencere öncesi oturum var mı, kırpılan alan var mı |
| 👣 **Adımlar** | Tıklamalar, girişler, tuşlar, sayfa geçişleri |
| 🌐 **Ağ** | fetch/XHR istekleri, durum kodları, süreler, istek ve yanıt gövdeleri |
| 🧯 **Konsol** | Hatalar, uyarılar, yakalanmamış istisnalar, Promise redleri ve kaynak satırları |
| 🗃️ **Store** | Zustand, Redux veya kendi store'unuzdaki değişiklikler (önceki → sonraki) |

Ajan düzeltmesini **kendisi kanıtlar**: `run_repro`, kayıttaki adımları gerçek bir tarayıcıda oynatır ve sizin beklentinizi bir test olarak denetler. Olay ancak **aynı assertion ile önce kırmızı, sonra ardışık iki yeşil** koşu varsa "doğrulandı" (`fixed`) olarak kapanır; aksi hâlde gerekçeyle `fixed_unverified` olur. Panelin Kayıtlar sekmesinde notunuzla ajanın yazdığı assertion'ı yan yana görürsünüz.

---

## Hızlı başlangıç (demo)

Gereken: Node.js 22 veya üstü.

```bash
npm install
npm run build              # @flashback/shared, flashback-devtools ve flashback-mcp
npm run setup:browsers     # run_repro için Playwright Chromium (bir kez)
npm run dev                # demo: http://localhost:5173
```

1. Ajanınıza MCP sunucusunu tanıtın. Claude Code için bu klasörde:
   ```bash
   claude mcp add flashback --scope project -- node packages/mcp/dist/cli.js
   ```
   Ya da `mcp.example.json` dosyasını `.mcp.json` olarak kopyalayın.
2. Demoda üç ürünü sepete ekleyin ve **YAZ10** kuponunu girin. Toplam `135030 ₺` gösterir, çünkü kargo ücreti API'den metin olarak geliyor. **KIS20** kuponunda sunucu 500 döner ve kullanıcıya hiçbir şey gösterilmez. Ayrıntılar: [`examples/demo/BUGS.md`](examples/demo/BUGS.md).
3. Sağ alttaki **Flashback** düğmesine basın ya da `Alt+Shift+R` kısayolunu kullanın. Kaydın altındaki araç takımıyla geri sarın (ya da **Boşluk** ile oynatın), **S** tuşuna basın, "Toplam" değerine tıklayın, "Ne olmalıydı?" alanını doldurun, önizlemeye bakıp gönderin. KIS20 için araç takımındaki **Sayfa düzeyi olay** düğmesini kullanın. Kapat düğmesinin yanındaki düğme paneli açık ya da koyu temaya geçirir.
4. Ajanınıza şunu yazın: *"Flashback olaylarına bak ve düzelt."*

> Alıcıya ulaşılamazsa olay gizlenmiş Markdown olarak panoya kopyalanır; pano kullanılamıyorsa `.md` dosyası olarak iner.

---

## Kendi projenize ekleme

```bash
npm i -D flashback-devtools flashback-mcp @playwright/test
npx playwright install chromium
```

```tsx
// main.tsx
import { Flashback } from 'flashback-devtools';

root.render(
  <>
    <App />
    <Flashback />
  </>,
);
```

`enabled` varsayılan olarak `process.env.NODE_ENV !== 'production'` değerini alır. Üretim build'inde kaydedici koda hiç girmez: paket `production` export koşulunda boş bir sürüme çözülür, koşulu desteklemeyen bundler'larda da `NODE_ENV` dalı sayesinde kaydedici elenir. Next.js App Router kurulumu için [`packages/flashback/README.md`](packages/flashback/README.md).

### Store takibi (isteğe bağlı)

```ts
import { trackStore } from 'flashback-devtools';

trackStore('cart', useCartStore.subscribe, useCartStore.getState); // Zustand
trackStore('redux', store.subscribe, store.getState);              // Redux
```

### Seçenekler

| prop | varsayılan | açıklama |
|---|---|---|
| `enabled` | `NODE_ENV !== 'production'` | Kaydı açar/kapatır |
| `endpoint` | `http://127.0.0.1:4747` | `flashback-mcp` alıcısının adresi |
| `bufferSeconds` | `60` | En az bu kadar geçmiş tutulur |
| `ignoreUrls` | `[]` | Kaydedilmeyecek istekler (metin öneki veya RegExp) |
| `maskAllInputs` | `false` | Tüm girişleri maskeler. Parolalar her durumda maskelenir |
| `redact` | `true` | `{ keys, patterns, emails: true, phones: false }`. `false` her şeyi olduğu gibi gönderir ve panelde kalıcı uyarı gösterir |
| `shortcut` | `alt+shift+r` | Paneli açıp kapatan kısayol (`event.code` ile; metin girişindeyken tetiklenmez) |
| `position` | `bottom-right` | Düğmenin köşesi |
| `locale` | tarayıcı dili (`tr`/`en`) | Arayüz dili |
| `project` | — | Projenin `package.json` adı. Verilirse alıcının projesiyle karşılaştırılır: uyuşmazsa düğme "yanlış proje" gösterir ve alıcı olayı 409 ile reddeder (aynı makinede birden çok proje çalışırken önerilir). |

### Hassas veri gizleme

Olay ajana gönderilmeden ya da panoya kopyalanmadan önce **tarayıcıda** temizlenir; giriş değerleri daha kayda girerken maskelenir. Gizlenen değerler `[REDACTED:<tür>]` olarak görünür ve rapor ajana türe göre kaç değerin gizlendiğini söyler.

| ne | nasıl bulunur |
|---|---|
| Şifre, token, API anahtarı, oturum, çerez, CSRF | Anahtar adına göre (kapalı ve sürümlü liste; büyük/küçük harf, `-`, `_` ve `[]` yok sayılır): JSON, form, URL sorgusu ve fragment'ı, başlıklar, props, store yolları, DOM öznitelikleri, serbest metindeki `anahtar: değer` çiftleri |
| JWT, `Bearer …`, bilinen anahtar biçimleri | Desenle (`sk-…`, `ghp_…`, `AKIA…`, `xox…-`, `AIza…`) |
| Kart numarası, IBAN, T.C. Kimlik No | Desen + sağlama (Luhn, mod-97, TCKN algoritması); sıradan sayılar etkilenmez |
| E-posta / telefon | E-posta varsayılan açık, telefon varsayılan kapalı |
| İşaretli bölgeler | `data-flashback-mask` (metni maskele), `data-flashback-block` (hiç kaydetme) |

Hata ayıklamaya yarayan değerler (kupon kodu, tutar, şehir, tarih, durum kodu) olduğu gibi kalır. Doğruluk, 150'den fazla örnekli bir fixture setiyle CI'da denetlenir. **Gizleme bir güvenlik garantisi değildir.** Ajana giden paket, ajanın kullandığı model sağlayıcısına gidebilir; gönderimden önce önizlemeye bakın.

---

## MCP kurulumu

`flashback-mcp` iki işi tek süreçte yapar: ajanla **stdio** üzerinden MCP konuşur, tarayıcıdan gelen olayları **HTTP** üzerinden (`127.0.0.1:4747`, yalnızca loopback) alır. Olaylar proje kökündeki `.flashback/` klasörüne yazılır; klasör kendi `.gitignore` dosyasını oluşturur.

`npx --no-install` kullanın; böylece sürüm projenizin lock dosyasından gelir.

**Claude Code** (`.mcp.json`) / **Cursor** (`.cursor/mcp.json`)
```json
{ "mcpServers": { "flashback": { "command": "npx", "args": ["--no-install", "flashback-mcp"] } } }
```

**Codex** (`~/.codex/config.toml`) global yapılandırma kullandığı için proje kökünü verin:
```toml
[mcp_servers.flashback]
command = "npx"
args = ["--no-install", "flashback-mcp"]
env = { FLASHBACK_PROJECT_ROOT = "/yol/projeniz" }
tool_timeout_sec = 180 # run_repro tarayıcı başlattığı için varsayılan araç süresini aşabilir
```

- `npx --no-install` paketi sunucunun başlatıldığı klasörde arar. Codex sunucuyu proje dışında başlatıyorsa (ya da Windows'ta `npx` başlatılamıyorsa) paketi doğrudan çalıştırın: `command = "node"`, `args = ['C:\yol\projeniz\node_modules\flashback-mcp\dist\cli.js']`. Windows yollarını TOML'da tek tırnakla yazın.
- Codex ekran görüntüsünü görüntü olarak göstermiyorsa `env` içine `FLASHBACK_NO_IMAGES = "1"` ekleyin; `run_repro` görüntü yerine dosya yolu döndürür.

Komutlar (`serve`, `check`, `prune`) ve tüm ortam değişkenleri: [`packages/mcp/README.md`](packages/mcp/README.md). Oturum gerektiren uygulamalar için `FLASHBACK_STORAGE_STATE` ile bir Playwright `storageState` dosyası verin; verilmezse oturum eksikliği **kırmızı sayılmaz**, `precondition` hatası olarak bildirilir.

### Ajanın araçları

| araç | ne yapar |
|---|---|
| `list_incidents` | Açık, kapalı veya tüm olayları listeler |
| `get_incident` | Raporu Markdown olarak verir: köken → dosya:satır → kanıt güveni → geliştiricinin niyeti → birincil kanıt → ilgili istekler/hatalar → adımlar → store |
| `get_incident_events` | Ham zaman çizelgesini JSON olarak verir (`around_ms`, `window_ms`, `types`) |
| `get_dom_snapshot` | O andaki HTML'i verir; `contains` ile aranabilir |
| `run_repro` | Adımları gerçek tarayıcıda oynatır, assertion'ı işaretlenen anda denetler; `passed` / `failed_assertion` (kırmızı) / `error` (kırmızı sayılmaz) |
| `get_repro_script` | Aynı testi çalıştırmadan üretir |
| `reply_to_incident` | Geliştiriciye panelden soru sorar; `wait_seconds` ile yanıtı bekleyebilir |
| `mark_fixed` | Olayı kapatır; doğrulama koşulunu sunucu denetler |

### Kırmızı → yeşil doğrulama

```jsonc
// run_repro
{ "id": "fb-20261026-150247-x6mn", "assertions": "await expect(target).toHaveText('1380 ₺');" }
```

- **Assertion metni hiçbir zaman çalıştırılmaz.** Dar bir dilbilgisiyle (yalnızca `expect(<target|page.getByRole|getByText|getByTestId|getByLabel|locator>)` + izinli matcher'lar + sabitler) ara temsile ayrıştırılır; test kodu yalnızca bu temsilden üretilir.
- **Olay verisi koda gömülmez.** Seçiciler, değerler ve URL'ler testin yanındaki `<id>.steps.json` dosyasından okunur.
- Repro yalnızca loopback ya da `FLASHBACK_ALLOW_ORIGINS` içindeki kökenlere gider; başka bir kökene yönlenirse durur.
- Gizlenmiş girişler türüne uygun sentetik değerlerle doldurulur (parola için `FLASHBACK_PASSWORD`). Bu değerler hiçbir çıktıda görünmez.
- Kayıtta yan etkili istekler (POST/PUT/PATCH/DELETE) varsa ilk koşuda uyarı verilir.
- `strict: true`: konsol hataları ve HTTP ≥ 400 yanıtlar da testi kaldırır. `repeat`: aynı koşuyu en fazla 5 kez tekrarlar.

---

## Nasıl çalışır

```
 Tarayıcı (dev)                                   Ajan
┌──────────────────────────────┐           ┌───────────────────┐
│ <Flashback/>                    │           │ Claude Code /     │
│  ├ rrweb DOM kaydı (3 dilim) │           │ Cursor / Codex    │
│  ├ fetch/XHR yakalama        │  POST     └─────────▲─────────┘
│  ├ console + hata yakalama   │ /incidents          │ stdio (MCP)
│  ├ adım kaydı                │──────────► ┌────────┴──────────┐
│  ├ store takibi              │ ◄──────────│ flashback-mcp        │
│  ├ gizleme + önizleme        │  GET       │  ├ alıcı (loopback)│
│  └ React fiber + sourcemap   │ (kayıtlar) │  ├ .flashback/*.json  │
└──────────────────────────────┘            │  └ run_repro       │
                                            └────────────────────┘
```

- **Halka tampon:** rrweb her `bufferSeconds/2` saniyede bir tam anlık görüntü alır ve son üç dilimi tutar; böylece her an en az `bufferSeconds` geçmiş vardır.
- **Replay ile canlı öğe eşlemesi:** Tekrar oynatmada seçtiğiniz öğe, rrweb düğüm kimliği üzerinden canlı sayfadaki aynı öğeye bağlanır ve React fiber'ı buradan okunur. Öğe artık yoksa en yakın canlı ata kullanılır ve bu kanıt güveninde belirtilir.
- **Kaynak satırları:** React 19'da `_debugStack`, React 18'de `_debugSource`; source map'ler tarayıcıda çözülür. webpack'in `eval` modüllerinin haritası yüklenen chunk'lardan, Next.js sunucu bileşenlerininki dev sunucusundan okunur. Çözülemezse ya da konum HMR yüzünden bayat olabilirse yanlış satır verilmez, `resolved: false` işaretlenir. Yalnızca sayfanın kendi kökeni ve loopback kaynakları çözülür. Mutlak dosya yollarını alıcı proje köküne göre kısaltır.
- **Alıcı güvenliği:** `Host` başlığı doğrulanır (DNS rebinding), `Origin` izin listesine bakılır, POST'ta `application/json` zorunludur, gövde boyutu ve olay sayısı sınırlıdır.

## Bilinen sınırlar

- Props/state değerleri işaretleme anında canlı uygulamadan okunur; geçmişteki ana ait değildir. Rapor bunu açıkça belirtir.
- Bileşen bilgisi yalnızca React için çıkarılır; React dışı öğelerde (Vue smoke testi) bileşen yığını boş kalır ve paket bunu belirtir. Kaynak satırı çözümlemesi Vite (React 18.3 ve 19) ile Next.js App Router'da (Turbopack ve webpack) doğrulandı ([EK-B3](spikes/ek-b3/README.md)). Sunucu bileşenlerinin (RSC) satırı en iyi çaba ile çözülür.
- React 19'da, HMR ile değiştirilen bir bileşenin değişiklikten önce oluşmuş öğelerinin satırı doğrulanamaz. Flashback bu satırı `resolved: false` olarak işaretler ve dosya adını yine verir. Doğru satır için sayfayı yenileyip hatayı tekrarlayın.
- Canvas, video ve çapraz kökenli iframe içerikleri tekrar oynatılmaz. WebSocket mesaj içerikleri kaydedilmez.
- WSL2, Docker ve uzaktan geliştirme ortamları v1.0'da desteklenmez.
- Yalnızca geliştirme ortamı içindir.

## Testler

```bash
npm test             # birim testleri (gizleme fixture seti, alıcı güvenliği, rapor, parser, yaşam döngüsü, panel)
npm run test:e2e     # uçtan uca: demo + panel + flashback-mcp + Playwright (önce: npm run build && npm run setup:browsers)
```

`tests/e2e/full-flow.e2e.test.ts`, ürünün tamamını tek akışta dener: panelde olay işaretlenir → ajan MCP üzerinden raporu okur → `run_repro` kırmızı → demo kaynağı düzeltilir → iki yeşil → `mark_fixed` → `fixed`; ayrıca öğesiz olay (KIS20) ve oturum gerektiren olay (`precondition` → `storageState` ile kırmızı → yeşil).

GitHub Actions her push ve PR'da Linux, Windows ve macOS'ta derleme, tip denetimi, birim ve uçtan uca testleri çalıştırır; ayrı bir iş React canary ile kaynak çözümlemeyi izler (`.github/workflows/ci.yml`).

## Depo yapısı

```
packages/shared   → @flashback/shared (yayımlanmaz): olay şeması, gizleme, sınırlar, assertion üretimi
packages/flashback   → flashback-devtools: <Flashback/> bileşeni, kaydedici, panel
packages/mcp      → flashback-mcp: MCP sunucusu, HTTP alıcı, run_repro
examples/demo     → kasıtlı hatalar içeren Vite + React sepet demosu
examples/next-app → Next.js App Router kurulum örneği ('use client' sarmalayıcısı; Turbopack ve webpack)
examples/react18  → React 18.3 + Vite örneği · examples/vue → Vue 3 + Vite smoke örneği (panel ayrı React kökünde)
tests/e2e         → paketler arası uçtan uca akış testleri
frd/              → Fonksiyonel gereksinim dokümanı (v1.0) ve inceleme süreci
docs/             → Paketler arası uygulama sözleşmesi
```

## Yayımlama (npm)

```bash
npm run release:check   # derler ve paketlere girecek dosyaları listeler (yayımlamaz)
```

FRD §11.3 gereği paketler CI'dan, npm provenance ile yayımlanır. Akış: `.github/workflows/release.yml`. Kimlik doğrulama npm **Trusted Publishing** (GitHub OIDC) ile yapılır; depoda npm belirteci tutulmaz, 2FA kodu da istenmez.

Bir kerelik ayar (yapıldı): npmjs.com'da her iki paketin **Settings → Trusted Publisher** bölümünde GitHub Actions seçilir; depo `yasinilkalp/flashback`, iş akışı `release.yml`.

Yeni sürüm için:

1. Sürümü artırın. Şu yerler aynı sürümü taşımalı (testler denetler):
   - `packages/flashback/package.json` ve `packages/mcp/package.json`
   - `packages/flashback/src/config.ts` içindeki `FLASHBACK_VERSION`
   - `examples/*/package.json` içindeki `flashback-devtools` bağımlılığı
2. `npm install` ile `package-lock.json`'ı güncelleyip commit edin.
3. Sürüm etiketini push edin. İş akışı derler, test eder, etiketi sürümle karşılaştırır, sürümün npm'de olmadığını denetler, yayımlar ve doğrular:

```bash
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

Ön sürümler (`-beta.N`) npm'de `beta` etiketiyle, diğerleri `latest` ile çıkar. Önce denemek için **Actions → Release → Run workflow** (varsayılan: `--dry-run`).

## Lisans

MIT
