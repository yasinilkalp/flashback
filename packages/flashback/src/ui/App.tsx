/** Flashback arayüzü: köşedeki düğme, seçim çerçevesi, not kutusu ve bildirim. */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { shortcutLabel } from '../config.js';
import type { Box, ControllerState, FlashbackController, Selection } from '../controller.js';
import { strings, type Strings } from './i18n.js';
import { Logo } from './Logo.js';

const MARGIN = 8;
const NOTE_WIDTH = 320;
/** Not kutusunun yaklaşık yüksekliği; konum hesabında kullanılır, gerçek yükseklik ölçülünce düzeltilir. */
const NOTE_HEIGHT = 190;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

export function App({ controller }: { controller: FlashbackController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState);
  const t = strings(controller.cfg.locale);
  const shortcut = shortcutLabel(controller.cfg.shortcut);
  const composing = s.mode === 'composing' || s.mode === 'sending';
  return (
    <div className="fb">
      <button
        type="button"
        className="fb-fab"
        aria-pressed={s.mode !== 'idle'}
        aria-label={`${s.mode === 'idle' ? t.fab : t.cancel} (${shortcut})`}
        title={`${s.mode === 'idle' ? t.fab : t.cancel} · ${shortcut}`}
        data-fb="fab"
        onClick={() => controller.toggle()}
      >
        <Logo />
      </button>
      {s.mode === 'picking' && (
        <div className="fb-hint" data-fb="hint">
          {t.hintPick} · <kbd>Enter</kbd> {t.hintPage} · <kbd>Esc</kbd> {t.hintEsc}
        </div>
      )}
      {s.mode === 'picking' && s.hover && <Frame box={s.hover.box} label={s.hover.label} />}
      {composing && s.selection?.box && <Frame box={s.selection.box} />}
      {composing && s.selection && <NoteBox controller={controller} selection={s.selection} sending={s.mode === 'sending'} t={t} />}
      {s.toast && <ToastView toast={s.toast} t={t} onClose={controller.dismissToast} />}
    </div>
  );
}

/** Öğenin çevresindeki çerçeve; etiket varsa üstünde (yer yoksa altında). */
function Frame({ box, label }: { box: Box; label?: string }) {
  const vw = window.innerWidth;
  const above = box.y >= 28;
  return (
    <>
      <div className="fb-box" data-fb="frame" style={{ left: box.x - 2, top: box.y - 2, width: box.w + 4, height: box.h + 4 }} />
      {label && (
        <div className="fb-tag" data-fb="tag" style={{ left: clamp(box.x - 2, MARGIN, vw - 200), top: above ? box.y - 26 : box.y + box.h + 6 }}>
          {label}
        </div>
      )}
    </>
  );
}

function notePosition(box: Box | null, height: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(NOTE_WIDTH, vw - 2 * MARGIN);
  if (!box) return { left: (vw - width) / 2, top: Math.max(MARGIN, vh * 0.25) };
  let top = box.y + box.h + MARGIN;
  if (top + height > vh - MARGIN) top = box.y - height - MARGIN;
  if (top < MARGIN) top = clamp(box.y + MARGIN, MARGIN, vh - height - MARGIN);
  return { left: clamp(box.x, MARGIN, vw - width - MARGIN), top };
}

function NoteBox({ controller, selection, sending, t }: { controller: FlashbackController; selection: Selection; sending: boolean; t: Strings }) {
  const [note, setNote] = useState('');
  const [height, setHeight] = useState(NOTE_HEIGHT);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => input.current?.focus({ preventScroll: true }), []);
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight;
    if (h && h !== height) setHeight(h);
  });
  const ready = note.trim().length > 0 && !sending;
  const submit = () => ready && void controller.submit(note);
  const { counts } = selection;
  const redactOff = controller.cfg.redact.enabled === false;
  return (
    <div
      ref={box}
      className="fb-note"
      role="dialog"
      aria-label={t.question}
      data-fb="note"
      style={notePosition(selection.box, height)}
      onKeyDown={(e) => {
        // Uygulamanın kısayolları not yazılırken tetiklenmesin.
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          controller.cancel();
        }
      }}
    >
      <div className="fb-note-src" data-fb="note-src">
        {selection.el ? selection.label : t.pageLevel}
      </div>
      <label htmlFor="fb-note-input">{t.question}</label>
      <textarea
        id="fb-note-input"
        ref={input}
        value={note}
        placeholder={t.placeholder}
        disabled={sending}
        data-fb="note-input"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="fb-chips" data-fb="chips">
        <span className="fb-chip">
          <b>{counts.requests}</b> {t.requests}
        </span>
        <span className="fb-chip">
          <b>{counts.steps}</b> {t.steps}
        </span>
        <span className="fb-chip">
          <b>{counts.errors}</b> {t.errors}
        </span>
        <span className={`fb-chip${redactOff ? ' fb-chip-warn' : ''}`}>{redactOff ? t.redactOff : t.redactOn}</span>
      </div>
      <div className="fb-row">
        <span className="fb-muted">{t.escCancel}</span>
        <button type="button" className="fb-go" aria-disabled={!ready} data-fb="copy" onClick={submit}>
          {sending ? t.sending : t.copy}
          {!sending && <kbd>↵</kbd>}
        </button>
      </div>
    </div>
  );
}

function ToastView({ toast, t, onClose }: { toast: NonNullable<ControllerState['toast']>; t: Strings; onClose: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => area.current?.select(), []);
  if (toast.kind === 'manual') {
    return (
      <div className="fb-toast" role="alert" data-fb="toast">
        <button type="button" className="fb-toast-x" aria-label={t.close} onClick={onClose}>
          ×
        </button>
        <b>{t.copyFailed}</b>
        <textarea ref={area} readOnly value={toast.text} data-fb="manual" />
      </div>
    );
  }
  return (
    <div className="fb-toast" role="status" data-fb="toast">
      <b>
        ✓ {t.copied} — {t.pasteToAgent}
      </b>
      <code data-fb="toast-path">{toast.path ?? t.inClipboard}</code>
    </div>
  );
}
