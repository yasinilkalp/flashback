/**
 * Panel stilleri. Shadow DOM içinde yaşar; `:host { all: initial }` ve her öğedeki açık değerler sayesinde
 * sayfanın `* { all: unset }` gibi küresel kuralları paneli etkilemez (FR-UI-12).
 */
export const PANEL_CSS = `
:host { all: initial; }
.rw-root, .rw-root * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-transform: none; }
.rw-root { --bg: #13151b; --bg2: #1c1f27; --bg3: #262a35; --fg: #f3f4f7; --muted: #a2a8b8; --accent: #ff5a36; --ok: #2fbf71; --warn: #f5a524; --err: #f0524f; --info: #5b8def;
  color: var(--fg); font-size: 13px; line-height: 1.45; }
.rw-root button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; background: var(--bg3); color: var(--fg); font-size: 13px; line-height: 1.3; border: 1px solid transparent; }
.rw-root button:hover:not(:disabled) { border-color: var(--muted); }
.rw-root button:focus-visible, .rw-root textarea:focus-visible, .rw-root input:focus-visible, .rw-root [tabindex]:focus-visible, .rw-root summary:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
.rw-root button:disabled { opacity: .45; cursor: not-allowed; }
.rw-root button.rw-primary { background: var(--accent); color: #fff; font-weight: 600; }
.rw-root button.rw-active { border-color: var(--accent); color: var(--accent); }
.rw-root textarea, .rw-root input[type=text] { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px; border-radius: 6px; background: var(--bg); color: var(--fg); border: 1px solid var(--bg3); font-size: 13px; white-space: pre-wrap; }
.rw-root textarea { min-height: 64px; resize: vertical; }
.rw-root input[type=range] { width: 100%; accent-color: var(--accent); margin: 0; }
.rw-root input[type=checkbox] { accent-color: var(--accent); margin: 0; }
.rw-root label { display: block; color: var(--muted); font-size: 12px; margin: 10px 0 4px; }
.rw-root code, .rw-root pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.rw-root pre { margin: 0; padding: 10px; background: var(--bg); border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-word; max-height: 50vh; }
.rw-root mark { background: rgba(245,165,36,.25); color: var(--warn); border-radius: 3px; padding: 0 2px; }
.rw-root h2, .rw-root h3 { margin: 0 0 8px; font-weight: 600; }
.rw-root h2 { font-size: 15px; } .rw-root h3 { font-size: 13px; color: var(--muted); }
.rw-root ul { margin: 0; padding-left: 18px; } .rw-root li { margin: 2px 0; }
.rw-root p { margin: 6px 0; }
.rw-muted { color: var(--muted); }

/* Düğme sınıfları ".rw-root button" sıfırlamasından daha özgül olmalı. */
.rw-root button.rw-launcher { position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--bg); box-shadow: 0 6px 24px rgba(0,0,0,.35); font-weight: 600; }
.rw-root button.rw-pos-bottom-right { right: 16px; bottom: 16px; } .rw-root button.rw-pos-bottom-left { left: 16px; bottom: 16px; }
.rw-root button.rw-pos-top-right { right: 16px; top: 16px; } .rw-root button.rw-pos-top-left { left: 16px; top: 16px; }
.rw-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--err); display: inline-block; }
.rw-dot.rw-rec { animation: rw-pulse 1.6s infinite; } .rw-dot.rw-frozen { background: var(--muted); }
@keyframes rw-pulse { 50% { opacity: .35; } }
.rw-recv { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.rw-recv-connected { background: var(--ok); } .rw-recv-disconnected { background: var(--err); } .rw-recv-wrong_project { background: var(--warn); }
.rw-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }

.rw-panel { position: fixed; z-index: 2147483647; inset: 12px; margin: auto; max-width: 1280px; background: var(--bg2); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); display: flex; flex-direction: column; overflow: hidden; }
.rw-panel:focus { outline: none; }
.rw-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--bg); }
.rw-header .rw-title { font-weight: 700; color: var(--accent); margin-right: 8px; }
.rw-header .rw-spacer { flex: 1; }
.rw-root button.rw-tab[aria-selected=true] { background: var(--bg2); border-color: var(--accent); }
.rw-strip { padding: 6px 12px; font-size: 12px; }
.rw-strip-err { background: rgba(240,82,79,.18); color: #ffb3b1; } .rw-strip-warn { background: rgba(245,165,36,.15); color: #ffd796; }
.rw-body { flex: 1; min-height: 0; display: flex; }
.rw-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px; gap: 10px; }
.rw-side { width: 380px; flex-shrink: 0; border-left: 1px solid var(--bg3); padding: 12px; overflow: auto; }
.rw-scroll { flex: 1; overflow: auto; padding: 12px 16px; }

.rw-viewport { position: relative; flex: 1; min-height: 0; background: #fff; border-radius: 8px; overflow: hidden; }
.rw-replay { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.rw-replay .replayer-wrapper { position: relative; }
.rw-replay .replayer-mouse, .rw-replay .replayer-mouse-tail { display: none; }
.rw-replay iframe { border: 0; display: block; background: #fff; }
.rw-overlay { position: absolute; inset: 0; cursor: crosshair; }
.rw-highlight { position: absolute; pointer-events: none; border: 2px solid var(--accent); background: rgba(255,90,54,.12); border-radius: 2px; }
.rw-highlight-label { position: absolute; transform: translateY(-100%); background: var(--accent); color: #fff; font-size: 11px; padding: 1px 4px; white-space: nowrap; border-radius: 3px 3px 0 0; }

.rw-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rw-time { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 92px; }
.rw-track { position: relative; flex: 1; min-width: 160px; padding-top: 20px; }
/* İşaretçiler türe göre ayrı satırlarda: aynı anda olan ağ ve konsol hatası üst üste binmez. */
.rw-markers { position: absolute; left: 0; right: 0; top: 0; height: 18px; }
.rw-root button.rw-marker { position: absolute; top: 0; width: 6px; height: 5px; margin-left: -3px; border-radius: 2px; padding: 0; }
.rw-root button.rw-marker-network { background: var(--err); } .rw-root button.rw-marker-console { background: var(--warn); top: 6px; }
.rw-root button.rw-marker-step { background: var(--info); top: 12px; } .rw-root button.rw-marker-panel { background: var(--muted); top: 12px; }
.rw-hint { color: var(--muted); font-size: 12px; }
.rw-kv { display: grid; grid-template-columns: 82px 1fr; gap: 4px 8px; font-size: 12px; margin: 6px 0; }
.rw-kv > :nth-child(odd) { color: var(--muted); }
.rw-kv code { word-break: break-all; }
.rw-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.rw-card { background: var(--bg); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.rw-conf li.rw-warn { color: var(--warn); } .rw-conf li.rw-ok { color: var(--ok); }
.rw-conf .rw-conf-hint { color: var(--muted); }
.rw-notice { padding: 10px 12px; border-radius: 8px; margin: 8px 0; }
.rw-notice-ok { background: rgba(47,191,113,.15); } .rw-notice-err { background: rgba(240,82,79,.18); } .rw-notice-info { background: rgba(91,141,239,.15); }
.rw-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rw-status { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.rw-status-open { background: var(--bg3); } .rw-status-fixed { background: var(--ok); color: #062; }
.rw-status-fixed_unverified { background: var(--warn); color: #3a2600; } .rw-status-cannot_reproduce { background: var(--muted); color: #111; }
.rw-msg { margin: 4px 0; padding: 6px 8px; border-radius: 6px; background: var(--bg2); white-space: pre-wrap; word-break: break-word; }
.rw-msg-agent { border-left: 3px solid var(--info); } .rw-msg-dev { border-left: 3px solid var(--accent); }
.rw-row { display: flex; gap: 8px; align-items: center; }
.rw-row > textarea { flex: 1; min-height: 38px; }
`;
