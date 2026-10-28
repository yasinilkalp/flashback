/**
 * Panel stilleri. Shadow DOM içinde yaşar; `:host { all: initial }` ve her öğedeki açık değerler sayesinde
 * sayfanın `* { all: unset }` gibi küresel kuralları paneli etkilemez (FR-UI-12).
 */
export const PANEL_CSS = `
:host { all: initial; }
.fb-root, .fb-root * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-transform: none; }
.fb-root { --bg: #0d111c; --bg2: #151a27; --bg3: #1e2433; --line: #2a3142; --fg: #f4f5f8; --muted: #a3aabb; --accent: #ffd23f; --accent-ink: #0d111c; --accent-text: #ffd23f; --ok: #2fbf71; --warn: #ff8a3d; --err: #f0524f; --info: #5b8def;
  --dock: rgba(13,17,28,.9); --shadow: 0 20px 60px rgba(0,0,0,.5); --bar-shadow: 0 10px 30px -8px rgba(0,0,0,.6); --strip-err-bg: rgba(240,82,79,.18); --strip-err-fg: #ffb3b1; --strip-warn-bg: rgba(255,138,61,.15); --strip-warn-fg: #ffc49b;
  color: var(--fg); font-size: 13px; line-height: 1.45; }
/* Açık tema: marka belirteçleri (site/brand/README.md); metin olarak kullanılan renkler WCAG AA kontrastı için koyulaştırıldı. */
.fb-root[data-theme="light"] { --bg: #fbfaf6; --bg2: #ffffff; --bg3: #f0ede6; --line: #e2dfd6; --fg: #14161c; --muted: #5a6070; --accent: #ffc81f; --accent-ink: #14161c; --accent-text: #8a6400; --ok: #11743f; --warn: #b45309; --err: #d23633; --info: #2f66d0;
  --dock: rgba(255,255,255,.94); --shadow: 0 24px 60px -20px rgba(30,25,20,.35); --bar-shadow: 0 4px 16px rgba(16,24,40,.08), 0 2px 4px rgba(16,24,40,.04); --strip-err-bg: rgba(210,54,51,.10); --strip-err-fg: #9b1c1a; --strip-warn-bg: rgba(180,83,9,.10); --strip-warn-fg: #7c3a06; }
.fb-root button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; background: var(--bg3); color: var(--fg); font-size: 13px; line-height: 1.3; border: 1px solid transparent; }
.fb-root button:hover:not(:disabled) { border-color: var(--muted); }
.fb-root button:focus-visible, .fb-root textarea:focus-visible, .fb-root input:focus-visible, .fb-root [tabindex]:focus-visible, .fb-root summary:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
.fb-root button:disabled { opacity: .45; cursor: not-allowed; }
.fb-root button.fb-primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.fb-root button.fb-active { border-color: var(--accent); color: var(--accent-text); }
.fb-root textarea, .fb-root input[type=text] { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px; border-radius: 6px; background: var(--bg); color: var(--fg); border: 1px solid var(--line); font-size: 13px; white-space: pre-wrap; }
.fb-root textarea { min-height: 64px; resize: vertical; }
.fb-root input[type=range] { width: 100%; accent-color: var(--accent); margin: 0; }
.fb-root input[type=checkbox] { accent-color: var(--accent); margin: 0; }
.fb-root label { display: block; color: var(--muted); font-size: 12px; margin: 10px 0 4px; }
.fb-root code, .fb-root pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.fb-root pre { margin: 0; padding: 10px; background: var(--bg); border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-word; max-height: 50vh; }
.fb-root mark { background: rgba(255,210,63,.22); color: var(--accent-text); border-radius: 3px; padding: 0 2px; }
.fb-root h2, .fb-root h3 { margin: 0 0 8px; font-weight: 600; }
.fb-root h2 { font-size: 15px; } .fb-root h3 { font-size: 13px; color: var(--muted); }
.fb-root ul { margin: 0; padding-left: 18px; } .fb-root li { margin: 2px 0; }
.fb-root p { margin: 6px 0; }
.fb-muted { color: var(--muted); }

/* Köşedeki dikey araç çubuğu. Düğme sınıfları ".fb-root button" sıfırlamasından daha özgül olmalı. */
.fb-bar { position: fixed; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 5px; background: var(--dock); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--bar-shadow); }
/* Küçükken yalnızca logo kalır: çubuğun zemini, kenarı ve gölgesi logoya geçer. */
.fb-bar[data-collapsed] { padding: 0; background: none; border: 0; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.fb-pos-bottom-right { right: 16px; bottom: 16px; } .fb-pos-bottom-left { left: 16px; bottom: 16px; }
.fb-pos-top-right { right: 16px; top: 16px; } .fb-pos-top-left { left: 16px; top: 16px; }
.fb-bar-mark { position: relative; display: flex; padding: 3px; }
.fb-bar .fb-logo { width: 24px; height: 24px; }
.fb-bar .fb-dot { position: absolute; top: 0; right: 0; box-shadow: 0 0 0 2px var(--dock); }
.fb-root .fb-bar-time { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 1.2; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.fb-bar-sep { flex: none; width: 20px; height: 1px; margin: 3px 0; background: var(--line); }
.fb-root button.fb-bar-btn { position: relative; width: 34px; height: 34px; padding: 0; justify-content: center; border-radius: 10px; background: transparent; color: var(--muted); }
.fb-root button.fb-bar-btn:hover:not(:disabled) { background: var(--bg3); color: var(--fg); border-color: transparent; }
.fb-root button.fb-bar-main { color: var(--fg); }
.fb-root button.fb-bar-main[aria-expanded=true] { background: var(--accent); color: var(--accent-ink); }
.fb-root button.fb-bar-rec { color: var(--err); }
.fb-root button.fb-bar-rec[aria-pressed=true], .fb-root button.fb-bar-rec[aria-pressed=true]:hover:not(:disabled) { background: var(--err); color: #fff; }
.fb-bar[data-recording] .fb-bar-time { color: var(--err); font-weight: 600; }
/* Kayıt durdurulunca araç çubuğunun yanında beliren kısa bildirim. */
.fb-toast { position: absolute; right: calc(100% + 10px); bottom: 0; width: max-content; max-width: 260px; padding: 8px 12px; border-radius: 10px; background: var(--dock); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid var(--line); border-left: 3px solid var(--ok); box-shadow: var(--bar-shadow); color: var(--fg); font-size: 12px; font-weight: 600; }
.fb-toast.fb-toast-warn { border-left-color: var(--warn); }
.fb-pos-bottom-left .fb-toast, .fb-pos-top-left .fb-toast { right: auto; left: calc(100% + 10px); }
.fb-pos-top-right .fb-toast, .fb-pos-top-left .fb-toast { bottom: auto; top: 0; }
/* "Kayda başla" seçim penceresi: araç çubuğunun yanında, bildirimle aynı yerde. */
.fb-pop { position: absolute; right: calc(100% + 10px); bottom: 0; width: 304px; padding: 14px; border-radius: 14px; background: var(--bg2); border: 1px solid var(--line); box-shadow: var(--shadow); color: var(--fg); text-align: left; }
.fb-pos-bottom-left .fb-pop, .fb-pos-top-left .fb-pop { right: auto; left: calc(100% + 10px); }
.fb-pos-top-right .fb-pop, .fb-pos-top-left .fb-pop { bottom: auto; top: 0; }
.fb-pop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.fb-pop-title { font-size: 14px; font-weight: 700; }
.fb-root .fb-pop-limit { font: 500 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
.fb-pop-sources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.fb-root label.fb-src { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin: 0; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font-size: 12px; cursor: pointer; }
.fb-root label.fb-src[data-on] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.fb-root label.fb-src[data-disabled] { opacity: .5; cursor: not-allowed; }
.fb-root label.fb-src:has(input:focus-visible) { outline: 2px solid var(--info); outline-offset: 2px; }
.fb-src input { position: absolute; opacity: 0; pointer-events: none; }
.fb-src .fb-ico { width: 20px; height: 20px; color: var(--muted); }
.fb-src[data-on] .fb-ico { color: var(--accent-text); }
.fb-src-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
.fb-src-label { font-size: 13px; font-weight: 600; }
.fb-root .fb-src-hint { font-size: 11px; line-height: 1.3; color: var(--muted); }
.fb-root label.fb-pop-check { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; color: var(--fg); font-size: 13px; cursor: pointer; }
.fb-root label.fb-pop-check[data-disabled] { opacity: .5; cursor: not-allowed; }
.fb-pop-check .fb-ico { width: 16px; height: 16px; color: var(--muted); }
.fb-root .fb-pop-err { margin: 10px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--strip-err-bg); color: var(--strip-err-fg); font-size: 12px; }
.fb-pop-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.fb-root button.fb-rec-go { background: var(--err); color: #fff; font-weight: 600; }
.fb-root button.fb-rec-go:hover:not(:disabled) { border-color: transparent; filter: brightness(1.08); }
/* Araç çubuğunun köşe noktası kuralı (.fb-bar .fb-dot) düğmedeki noktaya uygulanmasın. */
.fb-rec-go .fb-dot { position: static; width: 8px; height: 8px; background: #fff; box-shadow: none; }
.fb-root button.fb-bar-expand { position: relative; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 10px; background: transparent; box-shadow: var(--bar-shadow); transition: transform .15s; }
.fb-root button.fb-bar-expand:hover:not(:disabled) { border-color: transparent; transform: translateY(-1px); }
.fb-bar-expand .fb-logo { width: 40px; height: 40px; }
.fb-bar-expand .fb-dot { top: -3px; right: -3px; box-shadow: 0 0 0 2px var(--bg2); }
.fb-bar-btn .fb-badge { position: absolute; top: -3px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px; font-size: 10px; font-weight: 700; box-shadow: 0 0 0 2px var(--dock); }
.fb-bar-recv { display: flex; align-items: center; justify-content: center; width: 34px; height: 26px; }
.fb-bar-recv .fb-ico { width: 16px; height: 16px; }
.fb-bar-recv[data-receiver="connected"] { color: var(--ok); } .fb-bar-recv[data-receiver="disconnected"] { color: var(--err); } .fb-bar-recv[data-receiver="wrong_project"] { color: var(--warn); }
.fb-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--err); display: inline-block; }
/* Kayıt noktası bilerek sabit: sürekli animasyon her karede yeniden boyama yapar ve sayfanın etkileşim gecikmesini artırır (NFR-PERF-01). */
.fb-dot.fb-idle { background: var(--muted); }
.fb-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }

.fb-panel { position: fixed; z-index: 2147483647; inset: 12px; margin: auto; max-width: 1280px; background: var(--bg2); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }
.fb-panel:focus { outline: none; }
.fb-header { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
.fb-header .fb-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--fg); margin-right: 8px; }
.fb-logo { width: 20px; height: 20px; display: block; flex: none; }
.fb-header .fb-spacer { flex: 1; }
.fb-root button.fb-tab[aria-selected=true] { background: var(--bg2); border-color: var(--accent); }
.fb-win { display: flex; align-items: center; gap: 2px; padding-left: 8px; border-left: 1px solid var(--line); }
.fb-root button.fb-icon-btn { width: 32px; height: 32px; padding: 0; justify-content: center; background: transparent; color: var(--muted); }
.fb-root button.fb-icon-btn:hover:not(:disabled) { background: var(--bg3); color: var(--fg); border-color: transparent; }
.fb-ico { width: 18px; height: 18px; display: block; flex: none; }
.fb-strip { padding: 6px 12px; font-size: 12px; }
.fb-strip-err { background: var(--strip-err-bg); color: var(--strip-err-fg); } .fb-strip-warn { background: var(--strip-warn-bg); color: var(--strip-warn-fg); }
.fb-body { flex: 1; min-height: 0; display: flex; }
.fb-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px; gap: 10px; container: fb-stage / inline-size; }
.fb-vp-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.fb-side { width: 380px; flex-shrink: 0; border-left: 1px solid var(--line); padding: 12px; overflow: auto; }

/* Sepet: üstte olay şeridi ve eylemler, altında seçili olayın zaman çizelgesi. */
.fb-basket { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fb-bstrip { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
.fb-chips { flex: 1; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.fb-root button.fb-chip { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.fb-root button.fb-chip[aria-pressed=true] { background: var(--bg2); border-color: var(--accent); }
.fb-chip-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1.5px var(--warn); }
.fb-chip-dot.fb-chip-ready { background: var(--ok); box-shadow: none; }
.fb-chip-media { display: inline-flex; color: var(--muted); }
.fb-chip-media .fb-ico { width: 14px; height: 14px; }
.fb-media { display: block; width: 100%; max-height: 200px; margin: 4px 0 6px; border-radius: 6px; background: #000; }
audio.fb-media { background: none; }
.fb-root .fb-warn-text { color: var(--warn); }
.fb-root .fb-chip-time { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; font-weight: 400; color: var(--muted); }
.fb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.fb-batch { position: relative; padding: 8px 12px 0; }
.fb-batch .fb-notice { margin: 0 0 8px; padding-right: 44px; }
.fb-batch .fb-notice .fb-notice { margin: 4px 0 0; padding: 0; background: none; }
.fb-root button.fb-batch-close { position: absolute; top: 12px; right: 16px; width: 28px; height: 28px; }
.fb-ids { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.fb-agent-prompt { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.fb-agent-prompt code { flex: 1; min-width: 200px; padding: 6px 8px; border-radius: 6px; background: var(--bg); }
.fb-scroll { flex: 1; overflow: auto; padding: 12px 16px; }

.fb-viewport { position: relative; flex: 1; min-height: 0; background: #fff; border-radius: 8px; overflow: hidden; }
.fb-replay { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.fb-replay .replayer-wrapper { position: relative; }
.fb-replay .replayer-mouse, .fb-replay .replayer-mouse-tail { display: none; }
.fb-replay iframe { border: 0; display: block; background: #fff; }
.fb-overlay { position: absolute; inset: 0; cursor: crosshair; }
.fb-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #555; font-size: 13px; }
.fb-highlight { position: absolute; pointer-events: none; border: 2px solid var(--accent); background: rgba(255,210,63,.18); border-radius: 2px; }
.fb-highlight-label { position: absolute; transform: translateY(-100%); background: var(--accent); color: var(--accent-ink); font-size: 11px; padding: 1px 4px; white-space: nowrap; border-radius: 3px 3px 0 0; }
.fb-pick-banner { position: absolute; z-index: 2; top: 10px; left: 50%; transform: translateX(-50%); pointer-events: none; padding: 4px 12px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: 12px; font-weight: 600; white-space: nowrap; box-shadow: 0 6px 20px -6px rgba(0,0,0,.4); }

/* Yüzen dok: tekrar oynatımın altında ortalanmış araç takımı. */
.fb-dock { position: absolute; z-index: 2; left: 50%; bottom: 12px; transform: translateX(-50%); max-width: calc(100% - 16px); display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 2px; padding: 5px; background: var(--dock); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 14px 34px -12px rgba(0,0,0,.45); }
.fb-dock-sep { width: 1px; height: 20px; margin: 0 4px; background: var(--line); }
.fb-root button.fb-dock-btn { width: 34px; height: 34px; padding: 0; justify-content: center; border-radius: 8px; background: transparent; }
.fb-root button.fb-dock-btn:hover:not(:disabled) { background: var(--bg3); border-color: transparent; }
.fb-root button.fb-dock-btn.fb-on, .fb-root button.fb-dock-btn.fb-on:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); }
.fb-root button.fb-dock-btn[data-fb^="filter-"][aria-pressed="false"] { color: var(--muted); }
.fb-root .fb-num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; font-weight: 600; }
.fb-fdot { width: 10px; height: 10px; border-radius: 50%; display: block; }
.fb-fdot-network { background: var(--err); } .fb-fdot-console { background: var(--warn); } .fb-fdot-step { background: var(--info); }
.fb-dock-btn[aria-pressed="false"] .fb-fdot { background: transparent; box-shadow: inset 0 0 0 1.5px currentColor; }
/* Dar sahnede dok kaydın üstünü kapatmasın: tekrar oynatımın altına iner. */
@container fb-stage (max-width: 520px) {
  .fb-dock { position: static; transform: none; align-self: center; max-width: 100%; box-shadow: none; }
  .fb-root button.fb-dock-btn { width: 30px; height: 30px; }
  .fb-dock-sep { margin: 0 2px; }
}

.fb-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
/* Zaman çizelgesi kartı (sitedeki tasarım): başlık, alttan yükselen işaretçiler, üçgenli oynatma başı, uçlarda süre. */
.fb-tl { padding: 12px 14px 14px; background: var(--bg); border: 1px solid var(--line); border-radius: 11px; }
.fb-tl-head { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; }
.fb-tl-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.fb-root .fb-tl-time { margin-left: auto; font: 500 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); font-variant-numeric: tabular-nums; }
.fb-tl-track { position: relative; height: 34px; margin-top: 10px; border-radius: 6px; background: var(--bg2); overflow: hidden; }
.fb-tl-track:has(.fb-tl-range:focus-visible) { outline: 2px solid var(--info); outline-offset: 2px; }
/* Kaydırıcı izin tamamını kaplar ama görünmez: tıklama ve sürükleme ile ok tuşları ondan gelir. */
.fb-root input.fb-tl-range { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
.fb-tl-range::-webkit-slider-thumb { -webkit-appearance: none; width: 2px; height: 34px; }
.fb-tl-range::-moz-range-thumb { width: 2px; height: 34px; border: 0; }
/* İşaretçi: 3 px'lik çizgi, tıklama alanı 11 px. Yükseklik ve renk türü söyler. */
.fb-root button.fb-tick { position: absolute; z-index: 1; top: 0; bottom: 0; width: 11px; margin-left: -5px; padding: 0; border: 0; border-radius: 0; background: transparent; }
.fb-root button.fb-tick:hover:not(:disabled) { border-color: transparent; }
.fb-tick::after { content: ""; position: absolute; left: 4px; bottom: 6px; width: 3px; height: 12px; border-radius: 2px; background: var(--info); }
.fb-tick-console::after { height: 14px; background: var(--warn); }
.fb-tick-network::after { height: 16px; background: var(--err); }
.fb-tick-network.fb-tick-ok::after { height: 8px; background: var(--muted); opacity: .7; }
.fb-tick:hover::after, .fb-tick.fb-tick-on::after { opacity: 1; box-shadow: 0 0 0 2px var(--bg2), 0 0 0 3px var(--fg); }
.fb-tl-playhead { position: absolute; z-index: 2; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--accent); pointer-events: none; }
.fb-tl-playhead::before { content: ""; position: absolute; top: -1px; left: -5px; border: 6px solid transparent; border-top-color: var(--accent); }
.fb-tl-foot { display: flex; justify-content: space-between; margin-top: 8px; }
.fb-root .fb-tl-foot span { font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
.fb-hint { color: var(--muted); font-size: 12px; }
.fb-kv { display: grid; grid-template-columns: 82px 1fr; gap: 4px 8px; font-size: 12px; margin: 6px 0; }
.fb-kv > :nth-child(odd) { color: var(--muted); }
.fb-kv code { word-break: break-all; }
.fb-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.fb-card { background: var(--bg); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.fb-conf li.fb-warn { color: var(--warn); } .fb-conf li.fb-ok { color: var(--ok); }
.fb-conf .fb-conf-hint { color: var(--muted); }
.fb-notice { padding: 10px 12px; border-radius: 8px; margin: 8px 0; }
.fb-notice-ok { background: rgba(47,191,113,.15); } .fb-notice-err { background: rgba(240,82,79,.18); } .fb-notice-info { background: rgba(91,141,239,.15); }
.fb-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fb-status { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.fb-status-open { background: var(--bg3); } .fb-status-fixed { background: var(--ok); color: #062; }
.fb-status-fixed_unverified { background: var(--warn); color: #3a1600; } .fb-status-cannot_reproduce { background: var(--muted); color: #111; }
.fb-root[data-theme="light"] .fb-status-fixed { background: rgba(17,116,63,.12); color: var(--ok); }
.fb-root[data-theme="light"] .fb-status-fixed_unverified { background: rgba(180,83,9,.12); color: #8f4106; }
.fb-root[data-theme="light"] .fb-status-cannot_reproduce { background: var(--bg3); color: var(--muted); }
.fb-msg { margin: 4px 0; padding: 6px 8px; border-radius: 6px; background: var(--bg2); white-space: pre-wrap; word-break: break-word; }
.fb-msg-agent { border-left: 3px solid var(--info); } .fb-msg-dev { border-left: 3px solid var(--accent); }
.fb-row { display: flex; gap: 8px; align-items: center; }
.fb-row > textarea { flex: 1; min-height: 38px; }
`;
