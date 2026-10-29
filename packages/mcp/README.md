# flashback-mcp

Flashback raporlarını MCP üzerinden kodlama ajanınıza verir. Tarayıcıda bir hatayı işaretledikten sonra ajanınıza
yalnızca "son hatayı düzelt" demeniz yeter.

Raporları geliştirme sunucusu (`flashback-devtools/vite`) proje kökündeki `.flashback/` klasörüne yazar; bu sunucu
yalnızca okur. Port açmaz, arka planda süreç çalıştırmaz.

```bash
npm i -D flashback-mcp
```

## Ajan yapılandırması

**Claude Code** (`.mcp.json`) ve **Cursor** (`.cursor/mcp.json`):

```json
{ "mcpServers": { "flashback": { "command": "npx", "args": ["--no-install", "flashback-mcp"] } } }
```

**Codex** (`~/.codex/config.toml`) sunucuyu proje dışında başlatabilir; proje kökünü verin:

```toml
[mcp_servers.flashback]
command = "npx"
args = ["--no-install", "flashback-mcp"]
env = { FLASHBACK_PROJECT_ROOT = "/yol/projeniz" }
```

Windows'ta `npx` başlatılamıyorsa: `command = "node"`, `args = ['C:\yol\projeniz\node_modules\flashback-mcp\dist\cli.js']`.

## Araçlar

| Araç | Girdi | |
|---|---|---|
| `get_report` | `id` (isteğe bağlı) | Raporun Markdown'u; `id` verilmezse en yenisi |
| `list_reports` | `limit` (varsayılan 10) | Raporlar, yeniden eskiye: kimlik, zaman, geliştiricinin notu |

İkisi de salt okunurdur. Rapordaki not dışındaki her şey uygulamadan kaydedilmiş veridir; sunucu talimatları ajana
bunun talimat olmadığını söyler.

## Rapor klasörü

Sıra: `FLASHBACK_DIR`; yoksa başlangıç klasöründen (`FLASHBACK_PROJECT_ROOT` ya da çalışma klasörü) yukarı doğru ilk
`.flashback` klasörü; o da yoksa ilk git kökündeki `.flashback`. Vite eklentisi de `FLASHBACK_DIR`'i okur, ikisi aynı
klasörde buluşur.
