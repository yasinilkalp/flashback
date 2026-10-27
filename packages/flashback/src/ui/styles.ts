/**
 * Panel stilleri. Shadow DOM içinde yaşar; `:host { all: initial }` ve her öğedeki açık değerler sayesinde
 * sayfanın `* { all: unset }` gibi küresel kuralları paneli etkilemez (FR-UI-12).
 */
export const PANEL_CSS = `
:host { all: initial; }
.fb-root, .fb-root * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-transform: none; }
.fb-root { --bg: #13151b; --bg2: #1c1f27; --bg3: #262a35; --fg: #f3f4f7; --muted: #a2a8b8; --accent: #ff5a36; --ok: #2fbf71; --warn: #f5a524; --err: #f0524f; --info: #5b8def;
  color: var(--fg); font-size: 13px; line-height: 1.45; }
.fb-root button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; background: var(--bg3); color: var(--fg); font-size: 13px; line-height: 1.3; border: 1px solid transparent; }
.fb-root button:hover:not(:disabled) { border-color: var(--muted); }
.fb-root button:focus-visible, .fb-root textarea:focus-visible, .fb-root input:focus-visible, .fb-root [tabindex]:focus-visible, .fb-root summary:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
.fb-root button:disabled { opacity: .45; cursor: not-allowed; }
.fb-root button.fb-primary { background: var(--accent); color: #fff; font-weight: 600; }
.fb-root button.fb-active { border-color: var(--accent); color: var(--accent); }
.fb-root textarea, .fb-root input[type=text] { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px; border-radius: 6px; background: var(--bg); color: var(--fg); border: 1px solid var(--bg3); font-size: 13px; white-space: pre-wrap; }
.fb-root textarea { min-height: 64px; resize: vertical; }
.fb-root input[type=range] { width: 100%; accent-color: var(--accent); margin: 0; }
.fb-root input[type=checkbox] { accent-color: var(--accent); margin: 0; }
.fb-root label { display: block; color: var(--muted); font-size: 12px; margin: 10px 0 4px; }
.fb-root code, .fb-root pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.fb-root pre { margin: 0; padding: 10px; background: var(--bg); border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-word; max-height: 50vh; }
.fb-root mark { background: rgba(245,165,36,.25); color: var(--warn); border-radius: 3px; padding: 0 2px; }
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
.fb-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }

.fb-panel { position: fixed; z-index: 2147483647; inset: 12px; margin: auto; max-width: 1280px; background: var(--bg2); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); display: flex; flex-direction: column; overflow: hidden; }
.fb-panel:focus { outline: none; }
.fb-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--bg); }
.fb-header .fb-title { font-weight: 700; color: var(--accent); margin-right: 8px; }
.fb-header .fb-spacer { flex: 1; }
.fb-root button.fb-tab[aria-selected=true] { background: var(--bg2); border-color: var(--accent); }
.fb-strip { padding: 6px 12px; font-size: 12px; }
.fb-strip-err { background: rgba(240,82,79,.18); color: #ffb3b1; } .fb-strip-warn { background: rgba(245,165,36,.15); color: #ffd796; }
.fb-body { flex: 1; min-height: 0; display: flex; }
.fb-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px; gap: 10px; }
.fb-side { width: 380px; flex-shrink: 0; border-left: 1px solid var(--bg3); padding: 12px; overflow: auto; }
.fb-scroll { flex: 1; overflow: auto; padding: 12px 16px; }

.fb-viewport { position: relative; flex: 1; min-height: 0; background: #fff; border-radius: 8px; overflow: hidden; }
.fb-replay { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.fb-replay .replayer-wrapper { position: relative; }
.fb-replay .replayer-mouse, .fb-replay .replayer-mouse-tail { display: none; }
.fb-replay iframe { border: 0; display: block; background: #fff; }
.fb-overlay { position: absolute; inset: 0; cursor: crosshair; }
.fb-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #555; font-size: 13px; }
.fb-highlight { position: absolute; pointer-events: none; border: 2px solid var(--accent); background: rgba(255,90,54,.12); border-radius: 2px; }
.fb-highlight-label { position: absolute; transform: translateY(-100%); background: var(--accent); color: #fff; font-size: 11px; padding: 1px 4px; white-space: nowrap; border-radius: 3px 3px 0 0; }

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
.fb-status-fixed_unverified { background: var(--warn); color: #3a2600; } .fb-status-cannot_reproduce { background: var(--muted); color: #111; }
.fb-msg { margin: 4px 0; padding: 6px 8px; border-radius: 6px; background: var(--bg2); white-space: pre-wrap; word-break: break-word; }
.fb-msg-agent { border-left: 3px solid var(--info); } .fb-msg-dev { border-left: 3px solid var(--accent); }
.fb-row { display: flex; gap: 8px; align-items: center; }
.fb-row > textarea { flex: 1; min-height: 38px; }
`;
