/**
 * Seçim bilgisi, not formu (FR-UI-07) ve önizleme (FR-UI-08/09/11). "Sepete kaydet" yükü kurup sepetteki olaya
 * yazar; olay gönderime hazır olur (FR-BSK-06). Gönderim sepet şeridinden yapılır (Basket.tsx).
 */
import { useState } from 'react';
import { hasMarker } from '@flashback/shared';
import type { BasketEntry } from '../basket.js';
import type { ControllerState, FlashbackController } from '../controller.js';
import type { Exclusions, TargetCapture } from '../draft/build.js';
import { formatBytes, type Submission } from '../draft/report.js';
import type { Strings } from './i18n.js';
import type { Box } from './Timeline.js';

export interface Mark {
  markedAt: number;
  target: TargetCapture | null;
  domRoot: Element;
  box: Box | null;
}

type View = 'edit' | 'preview';

interface ComposeProps {
  controller: FlashbackController;
  state: ControllerState;
  t: Strings;
  /** Sepette seçili olay; daha önce kaydedildiyse notu alanlara gelir. */
  entry: BasketEntry;
  mark: Mark | null;
  resolving: boolean;
  primary?: { kind: 'network' | 'console'; seq: number };
  view: View;
  setView: (v: View) => void;
}

const noteKey = (what: string, expected: string) => `${what.trim() ? what : ''}\n${expected}`;

export function Compose({ controller, t, entry, mark, resolving, primary, view, setView }: ComposeProps) {
  const [what, setWhat] = useState(entry.note?.what ?? '');
  const [expected, setExpected] = useState(entry.note?.expected ?? '');
  const [exclude, setExclude] = useState<Exclusions>({});
  const [prepared, setPrepared] = useState<Submission | null>(null);
  const [mandatory, setMandatory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sepete en son kaydedilen not; alanlar sonradan değişirse olay yeniden kaydedilmelidir. */
  const [savedNote, setSavedNote] = useState(entry.ready && entry.note ? noteKey(entry.note.what ?? '', entry.note.expected) : null);

  const canSave = !!mark && !resolving && expected.trim().length > 0;

  const prepare = async (excl: Exclusions) => {
    if (!mark) return null;
    const p = await controller.prepare({
      markedAt: mark.markedAt,
      target: mark.target,
      domRoot: mark.domRoot,
      note: { what, expected },
      exclude: excl,
      primaryOverride: primary,
    });
    setPrepared(p);
    return p;
  };

  // Önizlemede bölüm hariç tutulunca yük yeniden kurulur; önizleme ve gövde yine aynı metinden.
  const changeExclude = (next: Exclusions) => {
    setExclude(next);
    void prepare(next);
  };

  const openPreview = async (isMandatory: boolean) => {
    setBusy(true);
    try {
      await prepare(exclude);
      setMandatory(isMandatory);
      controller.previewShown();
      setView('preview');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (submission: Submission) => {
    setBusy(true);
    setError(null);
    try {
      await controller.saveDraft(submission, { ...(what.trim() ? { what } : {}), expected });
      setSavedNote(noteKey(what, expected));
      setView('edit');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (controller.previewRequired()) return openPreview(true);
    setBusy(true);
    try {
      const p = await prepare(exclude);
      if (p) await saveDraft(p);
    } finally {
      setBusy(false);
    }
  };

  const saved = savedNote !== null && savedNote === noteKey(what, expected);

  if (view === 'preview' && prepared) {
    return (
      <PreviewView
        t={t}
        prepared={prepared}
        mandatory={mandatory}
        exclude={exclude}
        setExclude={changeExclude}
        busy={busy}
        error={error}
        onBack={() => setView('edit')}
        onSave={() => void saveDraft(prepared)}
      />
    );
  }

  return (
    <div className="fb-side">
      <h2>
        {t.basketItem} {entry.n}
      </h2>
      {saved && (
        <p className="fb-notice fb-notice-ok" role="status" data-fb="saved">
          ✓ {t.savedToBasket}
        </p>
      )}
      {entry.truncated && <p className="fb-notice fb-notice-info">{t.clipTruncated}</p>}
      <SelectionInfo t={t} mark={mark} resolving={resolving} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void save();
        }}
      >
        <label htmlFor="fb-what">{t.whatHappened}</label>
        <textarea id="fb-what" data-fb="what" value={what} onChange={(e) => setWhat(e.target.value)} />
        <label htmlFor="fb-expected">{t.expected}</label>
        <textarea
          id="fb-expected"
          data-fb="expected"
          required
          aria-required="true"
          placeholder={t.expectedPlaceholder}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
        <div className="fb-actions">
          <button type="button" disabled={!canSave || busy} onClick={() => void openPreview(false)} data-fb="preview">
            {t.preview}
          </button>
          <button type="submit" className="fb-primary" disabled={!canSave || busy} data-fb="save">
            {t.saveToBasket}
          </button>
        </div>
        {error && (
          <p className="fb-notice fb-notice-err" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

function SelectionInfo({ t, mark, resolving }: { t: Strings; mark: Mark | null; resolving: boolean }) {
  if (resolving) return <p className="fb-muted">{t.resolving}</p>;
  if (!mark) return <p className="fb-hint">{t.chooseTarget}</p>;
  const target = mark.target;
  if (!target) {
    return (
      <div className="fb-card" data-fb="selection">
        <h3>{t.pageLevelSelected}</h3>
        <p className="fb-hint">{t.pageLevelHint}</p>
      </div>
    );
  }
  const loc = target.location;
  return (
    <div className="fb-card" data-fb="selection">
      <h3>{t.selected}</h3>
      <div className="fb-kv">
        <span>{t.selector}</span>
        <code data-fb="selected-selector">{target.selector}</code>
        <span>{t.component}</span>
        <span>{target.componentStack[0] ?? '—'}</span>
        <span>{t.source}</span>
        <code data-fb="selected-source">
          {loc ? `${loc.file}:${loc.line}${!loc.resolved ? ` (${t.unresolvedSource})` : loc.fromAncestor ? ` (${t.ancestorSource})` : ''}` : '—'}
        </code>
      </div>
    </div>
  );
}

/** Markdown metnindeki gizleme işaretlerini vurgular; içerik her zaman düz metindir. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\[REDACTED(?::[a-z_]+)?\])/g);
  return (
    <>
      {parts.map((p, i) => (hasMarker(p) ? <mark key={i}>{p}</mark> : p))}
    </>
  );
}

function PreviewView(props: {
  t: Strings;
  prepared: Submission;
  mandatory: boolean;
  exclude: Exclusions;
  setExclude: (e: Exclusions) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSave: () => void;
}) {
  const { t, prepared, exclude, setExclude } = props;
  const { preview } = prepared;
  const ex = preview.extras;
  const confidence = preview.draft.confidence ?? [];
  const redacted = Object.entries(ex.redactedByType);
  return (
    <div className="fb-scroll" data-fb="preview-view" aria-label={t.previewTitle}>
      <h2>{t.previewTitle}</h2>
      {props.mandatory && <p className="fb-notice fb-notice-info">{t.previewMandatory}</p>}
      {!ex.redactionEnabled && (
        <p className="fb-notice fb-notice-err" role="alert">
          Gizleme: KAPALI — {t.redactOff}
        </p>
      )}
      <div className="fb-card">
        <h3>{t.confidence}</h3>
        <ul className="fb-conf" data-fb="confidence">
          {confidence.map((c) => (
            <li key={c.key} className={c.level === 'ok' ? 'fb-ok' : 'fb-warn'}>
              {c.level === 'ok' ? 'ok' : '⚠'} · {c.message}
              {c.hint && <span className="fb-conf-hint"> → {c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="fb-card">
        <h3>{t.alsoSent}</h3>
        <div className="fb-kv" data-fb="also-sent">
          <span>{t.rrwebEvents}</span>
          <span>{ex.events}</span>
          <span>{t.domSize}</span>
          <span>{formatBytes(ex.domBytes)}</span>
          <span>{t.networkEntries}</span>
          <span>{ex.network}</span>
          <span>{t.redactedValues}</span>
          <span>{redacted.length ? redacted.map(([k, v]) => `${k}: ${v}`).join(', ') : t.none}</span>
        </div>
        <fieldset className="fb-row" style={{ border: 0, padding: 0, margin: '8px 0 0', flexWrap: 'wrap' }}>
          <legend className="fb-muted">{t.exclude}</legend>
          {(
            [
              ['network', t.excludeNetwork],
              ['dom', t.excludeDom],
              ['store', t.excludeStore],
            ] as const
          ).map(([key, label]) => (
            <span key={key} className="fb-row">
              <input
                id={`fb-ex-${key}`}
                type="checkbox"
                checked={!!exclude[key]}
                data-fb={`exclude-${key}`}
                onChange={(e) => setExclude({ ...exclude, [key]: e.target.checked })}
              />
              <label htmlFor={`fb-ex-${key}`} style={{ margin: 0 }}>
                {label}
              </label>
            </span>
          ))}
        </fieldset>
      </div>
      <pre data-fb="preview-markdown">
        <Highlighted text={preview.markdown} />
      </pre>
      <details style={{ marginTop: 10 }}>
        <summary className="fb-muted">
          {t.rawJson} ({formatBytes(ex.bodyBytes)})
        </summary>
        <pre>{prepared.previewSource.length > 200_000 ? `${prepared.previewSource.slice(0, 200_000)}…` : prepared.previewSource}</pre>
      </details>
      {props.error && (
        <p className="fb-notice fb-notice-err" role="alert">
          {props.error}
        </p>
      )}
      <div className="fb-actions">
        <button type="button" onClick={props.onBack}>
          {t.backToTimeline}
        </button>
        <button type="button" className="fb-primary" disabled={props.busy} onClick={props.onSave} data-fb="preview-save">
          {t.saveToBasket}
        </button>
      </div>
    </div>
  );
}

