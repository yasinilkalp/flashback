/**
 * Arayüz stilleri. Gölge DOM içinde yaşar; `:host { all: initial }` ve her öğedeki açık değerler sayesinde sayfanın
 * `* { all: unset }` gibi küresel kuralları arayüzü etkilemez. Tek tema: koyu kutu, marka sarısı vurgu.
 */
export const UI_CSS = `
:host { all: initial; }
.fb, .fb * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-transform: none; }
.fb { --bg: #151a27; --bg2: #0d111c; --bg3: #1e2433; --line: #2a3142; --fg: #f4f5f8; --muted: #a3aabb; --accent: #ffd23f; --ink: #0d111c; --ok: #2fbf71; --info: #5b8def;
  color: var(--fg); font-size: 13px; line-height: 1.45; }
/* :where() özgüllüğü sıfırlar: aşağıdaki .fb-fab, .fb-go gibi sınıflar bu sıfırlamayı ezebilsin. */
:where(.fb) button { all: unset; box-sizing: border-box; cursor: pointer; }
.fb button:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
.fb code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* Köşedeki tek düğme. */
.fb-fab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: rgba(13,17,28,.9); box-shadow: 0 6px 18px -6px rgba(0,0,0,.55); opacity: .75; transition: opacity .12s; }
.fb-fab:hover, .fb-fab:focus-visible, .fb-fab[aria-pressed="true"] { opacity: 1; }
.fb-fab[aria-pressed="true"] { outline: 2px solid var(--accent); outline-offset: 2px; }
.fb-fab svg { width: 26px; height: 26px; }

/* Seçim kipi: üstte ipucu, öğenin çevresinde çerçeve ve etiket. */
.fb-hint { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483646; padding: 6px 12px; border-radius: 999px; background: var(--bg2); color: var(--fg); font-size: 12px; white-space: nowrap; box-shadow: 0 6px 18px -6px rgba(0,0,0,.55); pointer-events: none; }
.fb-hint kbd { font: 600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 0 5px; border-radius: 4px; background: var(--bg3); border: 1px solid var(--line); }
.fb-box { position: fixed; z-index: 2147483645; pointer-events: none; border: 2px solid var(--accent); border-radius: 3px; background: rgba(255,210,63,.18); }
.fb-tag { position: fixed; z-index: 2147483646; pointer-events: none; max-width: min(480px, calc(100vw - 16px)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 8px; border-radius: 6px; background: var(--bg2); color: var(--fg); font: 600 11.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* Not kutusu. */
.fb-note { position: fixed; z-index: 2147483646; width: 320px; max-width: calc(100vw - 16px); padding: 12px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 20px 44px -12px rgba(0,0,0,.6); }
.fb-note-src { font: 600 11.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--accent); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-note label { display: block; margin: 0 0 4px; color: var(--muted); font-size: 12px; }
.fb-note textarea { all: unset; box-sizing: border-box; display: block; width: 100%; min-height: 56px; max-height: 40vh; padding: 8px; border-radius: 8px; background: var(--bg2); color: var(--fg); border: 1px solid var(--line); font-size: 13px; line-height: 1.4; white-space: pre-wrap; overflow: auto; }
.fb-note textarea:focus { border-color: var(--info); box-shadow: 0 0 0 1px var(--info); }
.fb-note textarea::placeholder { color: #6b7385; }
.fb-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 9px 0 10px; }
.fb-chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--bg3); color: var(--muted); border: 1px solid var(--line); }
.fb-chip b { color: var(--fg); font-weight: 600; }
.fb-chip-warn { color: #ffc49b; border-color: #6b3d1f; }
.fb-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fb-muted { color: var(--muted); font-size: 11.5px; }
.fb-go { padding: 6px 12px; border-radius: 8px; background: var(--accent); color: var(--ink); font-weight: 700; font-size: 13px; }
.fb-go[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.fb-go kbd { font: 600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin-left: 4px; }

/* Bildirim. */
.fb-toast { position: fixed; right: 64px; bottom: 16px; z-index: 2147483646; max-width: min(360px, calc(100vw - 80px)); padding: 9px 12px; border-radius: 10px; background: var(--bg2); border: 1px solid var(--line); border-left: 3px solid var(--ok); box-shadow: 0 10px 28px -8px rgba(0,0,0,.6); font-size: 12.5px; }
.fb-toast b { display: block; font-weight: 600; }
.fb-toast code { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.fb-toast textarea { all: unset; box-sizing: border-box; display: block; width: 100%; height: 120px; margin-top: 6px; padding: 6px; border-radius: 6px; background: var(--bg); color: var(--fg); border: 1px solid var(--line); font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; overflow: auto; }
.fb-toast-x { position: absolute; top: 4px; right: 8px; color: var(--muted); font-size: 14px; }
`;
