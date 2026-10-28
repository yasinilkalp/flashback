/**
 * Panel stilleri. Shadow DOM içinde yaşar; `:host { all: initial }` ve her öğedeki açık değerler sayesinde
 * sayfanın `* { all: unset }` gibi küresel kuralları paneli etkilemez (FR-UI-12).
 */
export const PANEL_CSS = `
:host { all: initial; }
.fb-root, .fb-root * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-transform: none; }
.fb-root { --bg: #0d111c; --bg2: #151a27; --bg3: #1e2433; --line: #2a3142; --fg: #f4f5f8; --muted: #a3aabb; --accent: #ffd23f; --accent-ink: #0d111c; --accent-text: #ffd23f; --ok: #2fbf71; --warn: #ff8a3d; --err: #f0524f; --info: #5b8def;
  --dock: rgba(13,17,28,.9); --shadow: 0 20px 60px rgba(0,0,0,.5); --strip-err-bg: rgba(240,82,79,.18); --strip-err-fg: #ffb3b1; --strip-warn-bg: rgba(255,138,61,.15); --strip-warn-fg: #ffc49b;
  color: var(--fg); font-size: 13px; line-height: 1.45; }
/* Açık tema: marka belirteçleri (site/brand/README.md); metin olarak kullanılan renkler WCAG AA kontrastı için koyulaştırıldı. */
.fb-root[data-theme="light"] { --bg: #fbfaf6; --bg2: #ffffff; --bg3: #f0ede6; --line: #e2dfd6; --fg: #14161c; --muted: #5a6070; --accent: #ffc81f; --accent-ink: #14161c; --accent-text: #8a6400; --ok: #11743f; --warn: #b45309; --err: #d23633; --info: #2f66d0;
  --dock: rgba(255,255,255,.94); --shadow: 0 24px 60px -20px rgba(30,25,20,.35); --strip-err-bg: rgba(210,54,51,.10); --strip-err-fg: #9b1c1a; --strip-warn-bg: rgba(180,83,9,.10); --strip-warn-fg: #7c3a06; }
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

/* Düğme sınıfları ".fb-root button" sıfırlamasından daha özgül olmalı. */
.fb-root button.fb-launcher { position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--bg); box-shadow: 0 6px 24px rgba(0,0,0,.35); font-weight: 600; }
.fb-root button.fb-pos-bottom-right { right: 16px; bottom: 16px; } .fb-root button.fb-pos-bottom-left { left: 16px; bottom: 16px; }
.fb-root button.fb-pos-top-right { right: 16px; top: 16px; } .fb-root button.fb-pos-top-left { left: 16px; top: 16px; }
.fb-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--err); display: inline-block; }
/* Kayıt noktası bilerek sabit: sürekli animasyon her karede yeniden boyama yapar ve sayfanın etkileşim gecikmesini artırır (NFR-PERF-01). */
.fb-dot.fb-frozen { background: var(--muted); }
.fb-recv { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.fb-recv-connected { background: var(--ok); } .fb-recv-disconnected { background: var(--err); } .fb-recv-wrong_project { background: var(--warn); }
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
.fb-time { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 92px; }
.fb-track { position: relative; flex: 1; min-width: 160px; padding-top: 20px; }
/* İşaretçiler türe göre ayrı satırlarda: aynı anda olan ağ ve konsol hatası üst üste binmez. */
.fb-markers { position: absolute; left: 0; right: 0; top: 0; height: 18px; }
.fb-root button.fb-marker { position: absolute; top: 0; width: 6px; height: 5px; margin-left: -3px; border-radius: 2px; padding: 0; }
.fb-root button.fb-marker-network { background: var(--err); } .fb-root button.fb-marker-console { background: var(--warn); top: 6px; }
.fb-root button.fb-marker-step { background: var(--info); top: 12px; } .fb-root button.fb-marker-panel { background: var(--muted); top: 12px; }
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
