# Ajan logoları

`site/index.html` bu klasördeki logoları iki yerde kullanır: hero altındaki kayan bant ve "Ajanlar" bölümündeki karolar. Dosya yoksa bantta yalnızca uygulamanın adı, karoda baş harfleri görünür.

Koyu temada `-dark` sonekli dosya varsa o kullanılır, yoksa asıl dosya her iki temada da gösterilir.

## Kaynaklar

Bütün logolar ilgili markanın kendi yayımladığı kaynaklardan alındı. Çizimler değiştirilmedi; yalnızca kilitten simge ayrıldı (viewBox kırpma), arka plan dikdörtgeni kaldırıldı, boyut küçültüldü ve tek renkli işaretlere markanın kendi siyah/beyaz varyantı için renk atandı.

| Dosya | Uygulama | Kaynak | Hazırlama |
|---|---|---|---|
| `claude-code.svg` | Claude Code | code.claude.com/docs üstbilgi logosu | Kilitten işaret ayrıldı; iki temada aynı renk (#D97757) |
| `cursor.svg`, `cursor-dark.svg` | Cursor | cursor.com/brand (yatay kilit, 2D) | Küp ayrıldı; markanın koyu/açık renkleri (#1B1913 / #EDECEC) |
| `codex.svg`, `codex-dark.svg` | Codex | openai.com/brand "Blossom" | İnşa çizgileri kaldırıldı; siyah / beyaz |
| `github-copilot.svg`, `-dark.svg` | GitHub Copilot | github.com/primer/octicons `copilot-24.svg` (MIT) | currentColor yerine #1F2328 / beyaz |
| `gemini-cli.png` | Gemini CLI | github.com/google-gemini/gemini-cli VS Code eşlik uzantısı simgesi (Apache-2.0) | 1645 px → 128 px |
| `devin.svg`, `devin-dark.svg` | Devin Desktop (eski Windsurf) | devin.ai/brand symbol light/dark | Arka plan dikdörtgeni kaldırıldı |
| `cline.svg`, `cline-dark.svg` | Cline | github.com/cline/cline `assets/branding/logos` (Apache-2.0) | Olduğu gibi (icon-dark / icon-white) |
| `zed.svg`, `zed-dark.svg` | Zed | github.com/zed-industries/zed `assets/images/zed_logo.svg` | Olduğu gibi; koyu tema için beyaz |
| `jetbrains.svg` | JetBrains AI | github.com/JetBrains/logos `web/ai/ai.svg` | Olduğu gibi |
| `continue.svg`, `continue-dark.svg` | Continue | github.com/continuedev/continue `docs/logo` (Apache-2.0) | Olduğu gibi (light / dark) |
| `amazon-q.svg` | Amazon Q Developer | github.com/aws/aws-toolkit-vscode `amazonq/q-gradient.svg` (Apache-2.0) | Olduğu gibi |

## Marka kuralları

Logolar yalnızca "bu araçlarla çalışır" anlamında, her birinin adıyla birlikte ve aynı boyda kullanılır; hiçbiri Flashback'in kendi markası gibi gösterilmez. Markaların yönergeleri değişebilir; özellikle OpenAI (ortaklık kilitlerinde Blossom kullanılmaz, tek renk) ve Google (Gemini marka kuralları) için yayından önce güncel kurallara bakın. Bir marka logosunun kaldırılmasını isterse dosyayı silmek yeterlidir; sayfa adıyla göstermeye devam eder.
