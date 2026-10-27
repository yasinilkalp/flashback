# rewind-mcp

Rewind'in MCP sunucusu. Tek süreçte iki iş yapar:

- **stdio MCP sunucusu:** Kodlama ajanına olayları, raporu ve `run_repro` aracını sunar.
- **HTTP alıcı:** Tarayıcıdaki `<Rewind/>` bileşeninden olay alır. Varsayılan adres `127.0.0.1:4747`, yalnızca loopback.

Olaylar proje kökündeki `.rewind/` klasörüne yazılır. Klasör `0700` izinle oluşturulur ve kendi `.gitignore` dosyasını içerir.

## Kurulum

```sh
npm i -D rewind-mcp @playwright/test
npx playwright install chromium
```

`run_repro`, projenin kendi `@playwright/test` paketini kullanır. Projenin `playwright.config` dosyasını kullanmaz.

## Ajan yapılandırması

`npx --no-install` kullanın. Böylece sürüm projenin lock dosyasından gelir.

**Claude Code** (`.mcp.json`) ve **Cursor** (`.cursor/mcp.json`):

```json
{ "mcpServers": { "rewind": { "command": "npx", "args": ["--no-install", "rewind-mcp"] } } }
```

**Codex** (`~/.codex/config.toml`) global yapılandırma kullanır. Sunucu proje klasöründe başlamayabileceği için `REWIND_PROJECT_ROOT` verin:

```toml
[mcp_servers.rewind]
command = "npx"
args = ["--no-install", "rewind-mcp"]
env = { REWIND_PROJECT_ROOT = "/yol/projeniz" }
```

## Komutlar

| Komut | İş |
|---|---|
| `rewind-mcp` | MCP (stdio) ve HTTP alıcıyı birlikte başlatır. Port doluysa çalışan sunucunun `projectId` değerine bakar. Değer aynıysa olayları aynı klasörden okur; farklıysa her araç `wrong_project` döner ve boş bir port önerir. |
| `rewind-mcp serve` | Yalnızca HTTP alıcıyı başlatır. |
| `rewind-mcp check` | Port ve `projectId`, Playwright sürümü, Chromium ve olay klasörünü kontrol eder. Sorun varsa çıkış kodu 1 olur. |
| `rewind-mcp prune [--all]` | Saklama süresi dolmuş kapalı olayları siler. `--all` verilirse yaşına bakmadan tüm kapalı olayları siler. Açık olaylara hiçbir zaman dokunmaz. |

## Ortam değişkenleri

| Değişken | Varsayılan | Not |
|---|---|---|
| `REWIND_PORT` | `4747` | |
| `REWIND_HOST` | `127.0.0.1` | Loopback dışı bir adres yalnızca `--unsafe-expose` bayrağıyla kullanılabilir (önerilmez). |
| `REWIND_DIR` | Aşağıdaki sıraya göre | Sıra: `REWIND_DIR`, ardından `REWIND_PROJECT_ROOT/.rewind`, ardından `cwd`'den yukarı doğru bulunan ilk `package.json` klasöründeki `.rewind`. Ev dizini ve kök dizin reddedilir. |
| `REWIND_PROJECT_ROOT` | `cwd`'nin proje kökü | `@playwright/test` paketi buradan çözülür. |
| `REWIND_ALLOW_ORIGINS` | (boş) | localhost dışındaki kökenler, virgülle ayrılır. |
| `REWIND_BASE_URL` | (boş) | Repro hedefi. Öncelik sırası: `base_url` parametresi, ardından bu değişken, ardından olay URL'sinin kökeni. |
| `REWIND_STORAGE_STATE` | (boş) | Playwright `storageState` dosyası. İçeriği hiçbir yanıtta döndürülmez. |
| `REWIND_PASSWORD` | (boş) | Parola alanlarının repro değeri. Diske yazılmaz. |
| `REWIND_INPUT_<ALAN>` | (boş) | Belirli bir alanın sentetik değerini geçersiz kılar (ör. `REWIND_INPUT_EMAIL`). |
| `REWIND_MAX_BODY_MB` | `5` | Bu sınırı aşan istek gövdesi 413 alır. |
| `REWIND_RETENTION_DAYS` | `30` | Kapalı olayların saklanma süresi. |
| `REWIND_REPRO_TIMEOUT_S` | `60` | En fazla 300. Tarayıcının başlatılması bu süreye dahildir. |
| `REWIND_RATE_LIMIT_PER_MIN` | `30` | Dakika başına kabul edilen en fazla olay sayısı. Aşılırsa 429 döner. `0` verilirse sınır kalkar. |
| `REWIND_NO_IMAGES` | (kapalı) | `1` verilirse `run_repro` ekran görüntüsünü görüntü olarak değil, dosya yolu olarak döndürür. |

## Araçlar

`list_incidents`, `get_incident`, `get_incident_events`, `get_dom_snapshot`, `run_repro`, `get_repro_script`, `reply_to_incident`, `mark_fixed`.

Olay, yalnızca aynı koşu imzasıyla bir kırmızı ve ardından ardışık iki yeşil koşu varsa `fixed` olarak kapanır. Bu koşul sağlanmazsa `mark_fixed` bir gerekçe ister ve olay `fixed_unverified` olarak kapanır.

Assertion metni hiçbir zaman çalıştırılmaz. Metin dar bir dilbilgisiyle ayrıştırılır ve test kodu yalnızca bu ayrıştırılmış temsilden üretilir. Olay verisi (seçici, değer, URL) spec dosyasına gömülmez; testin yanındaki `<id>.steps.json` dosyasından okunur.
