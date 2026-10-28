/**
 * "Kayda başla" seçim penceresi (FR-REC-01, FR-REC-16): bu sekme ya da ekran/pencere, isteğe bağlı mikrofon.
 * Araç çubuğunun yanında açılır; Esc ve İptal kapatır. Ekran/pencere ve mikrofon tarayıcının izin penceresini açar.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ControllerState, FlashbackController } from '../controller.js';
import { mediaSupport, type RecordSource } from '../recorder/media.js';
import type { Strings } from './i18n.js';
import { Icon } from './Icons.js';

const ERRORS = { screen: 'errScreen', mic: 'errMic', unsupported: 'errUnsupported' } as const;

export function RecordPicker({ controller, state, t, onClose }: { controller: FlashbackController; state: ControllerState; t: Strings; onClose: () => void }) {
  const startRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => startRef.current?.focus({ preventScroll: true }), []);
  // Araç çubuğunun dışına tıklamak pencereyi kapatır (izin beklenirken kapanmaz).
  useEffect(() => {
    const bar = rootRef.current?.closest('[data-fb="launcher-bar"]');
    const onDown = (e: PointerEvent) => {
      if (bar && !e.composedPath().includes(bar)) controller.closePicker();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [controller]);
  const support = mediaSupport();
  const opts = state.recordOptions;
  const set = (patch: Partial<typeof opts>) => controller.setRecordOptions({ ...opts, ...patch });
  const cancel = () => {
    controller.closePicker();
    onClose();
  };
  const sources: Array<{ id: RecordSource; icon: 'tab' | 'screen'; label: string; hint: string; disabled: boolean }> = [
    { id: 'tab', icon: 'tab', label: t.sourceTab, hint: t.sourceTabHint, disabled: false },
    { id: 'screen', icon: 'screen', label: t.sourceScreen, hint: support.screen ? t.sourceScreenHint : t.unsupportedHere, disabled: !support.screen },
  ];

  return (
    <div
      ref={rootRef}
      className="fb-pop"
      role="dialog"
      aria-labelledby="fb-pop-title"
      data-fb="record-picker"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <div className="fb-pop-head">
        <span id="fb-pop-title" className="fb-pop-title">
          {t.recordTitle}
        </span>
        <span className="fb-pop-limit">
          {t.maxLength} {controller.cfg.maxRecordSeconds} {t.seconds}
        </span>
      </div>
      <div className="fb-pop-sources" role="radiogroup" aria-label={t.recordSource}>
        {sources.map((s) => (
          <label key={s.id} className="fb-src" data-on={opts.source === s.id || undefined} data-disabled={s.disabled || undefined}>
            <input
              type="radio"
              name="fb-rec-source"
              value={s.id}
              checked={opts.source === s.id}
              disabled={s.disabled || state.starting}
              onChange={() => set({ source: s.id })}
              data-fb={`rec-source-${s.id}`}
            />
            <Icon name={s.icon} />
            <span className="fb-src-text">
              <span className="fb-src-label">{s.label}</span>
              <span className="fb-src-hint">{s.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="fb-pop-check" data-disabled={!support.mic || undefined}>
        <input type="checkbox" checked={opts.mic && support.mic} disabled={!support.mic || state.starting} onChange={(e) => set({ mic: e.target.checked })} data-fb="rec-mic" />
        <Icon name="mic" />
        <span>{t.includeMic}</span>
        {!support.mic && <span className="fb-src-hint">{t.unsupportedHere}</span>}
      </label>
      {state.pickerError && (
        <p className="fb-pop-err" role="alert" data-fb="rec-error">
          {t[ERRORS[state.pickerError]]}
        </p>
      )}
      <div className="fb-pop-actions">
        <button type="button" onClick={cancel} disabled={state.starting} data-fb="rec-cancel">
          {t.cancel}
        </button>
        <button
          ref={startRef}
          type="button"
          className="fb-rec-go"
          disabled={state.starting}
          onClick={() => void controller.startRecording({ source: opts.source, mic: opts.mic && support.mic })}
          data-fb="rec-start"
        >
          <span className="fb-dot" aria-hidden="true" />
          {state.starting ? t.waitingPermission : t.record}
        </button>
      </div>
    </div>
  );
}
