/**
 * Seçim bilgisi, not formu (FR-UI-07), gönderim önizlemesi (FR-UI-08/09/11) ve sonuç (FR-RCV-07/08/11).
 */
import { useState } from 'react';
import { hasMarker } from '@rewind/shared';
import type { ControllerState, RewindController, SendResult } from '../controller.js';
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

type View = 'edit' | 'preview' | 'result';

interface ComposeProps {
  controller: RewindController;
  state: ControllerState;
  t: Strings;
  mark: Mark | null;
  resolving: boolean;
  primary?: { kind: 'network' | 'console'; seq: number };
  view: View;
  setView: (v: View) => void;
  onReset: () => void;
}

export function Compose({ controller, state, t, mark, resolving, primary, view, setView, onReset }: ComposeProps) {
  const [what, setWhat] = useState('');
  const [expected, setExpected] = useState('');
  const [exclude, setExclude] = useState<Exclusions>({});
  const [prepared, setPrepared] = useState<Submission | null>(null);
  const [mandatory, setMandatory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

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

  const send = async (submission: Submission) => {
    setBusy(true);
    try {
      const r = await controller.send(submission);
      setResult(r);
      if (r.kind !== 'rejected') setView('result');
    } finally {
      setBusy(false);
    }
  };

  const saveAndSend = async () => {
    if (controller.previewRequired()) return openPreview(true);
    setBusy(true);
    try {
      const p = await prepare(exclude);
      if (p) await send(p);
    } finally {
      setBusy(false);
    }
  };

  const newIncident = () => {
    setWhat('');
    setExpected('');
    setExclude({});
    setPrepared(null);
    setResult(null);
    onReset();
  };

  if (view === 'preview' && prepared) {
    return (
      <PreviewView
        t={t}
        prepared={prepared}
        mandatory={mandatory}
        exclude={exclude}
        setExclude={changeExclude}
        busy={busy}
        rejected={result?.kind === 'rejected' ? result : null}
        onBack={() => setView('edit')}
        onSend={() => void send(prepared)}
      />
    );
  }
  if (view === 'result' && result) {
    return <ResultView t={t} result={result} queued={state.queued} onNew={newIncident} />;
  }

  return (
    <div className="rw-side">
      <SelectionInfo t={t} mark={mark} resolving={resolving} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void saveAndSend();
        }}
      >
        <label htmlFor="rw-what">{t.whatHappened}</label>
        <textarea id="rw-what" data-rw="what" value={what} onChange={(e) => setWhat(e.target.value)} />
        <label htmlFor="rw-expected">{t.expected}</label>
        <textarea
          id="rw-expected"
          data-rw="expected"
          required
          aria-required="true"
          placeholder={t.expectedPlaceholder}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
        <div className="rw-actions">
          <button type="button" disabled={!canSave || busy} onClick={() => void openPreview(false)} data-rw="preview">
            {t.preview}
          </button>
          <button type="submit" className="rw-primary" disabled={!canSave || busy} data-rw="save">
            {t.saveAndSend}
          </button>
        </div>
      </form>
    </div>
  );
}

function SelectionInfo({ t, mark, resolving }: { t: Strings; mark: Mark | null; resolving: boolean }) {
  if (resolving) return <p className="rw-muted">{t.resolving}</p>;
  if (!mark) return <p className="rw-hint">{t.chooseTarget}</p>;
  const target = mark.target;
  if (!target) {
    return (
      <div className="rw-card" data-rw="selection">
        <h3>{t.pageLevelSelected}</h3>
        <p className="rw-hint">{t.pageLevelHint}</p>
      </div>
    );
  }
  const loc = target.location;
  return (
    <div className="rw-card" data-rw="selection">
      <h3>{t.selected}</h3>
      <div className="rw-kv">
        <span>{t.selector}</span>
        <code data-rw="selected-selector">{target.selector}</code>
        <span>{t.component}</span>
        <span>{target.componentStack[0] ?? '—'}</span>
        <span>{t.source}</span>
        <code data-rw="selected-source">{loc ? `${loc.file}:${loc.line}${loc.resolved ? '' : ` (${t.unresolvedSource})`}` : '—'}</code>
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
  rejected: { status: number; error: string } | null;
  onBack: () => void;
  onSend: () => void;
}) {
  const { t, prepared, exclude, setExclude } = props;
  const { preview } = prepared;
  const ex = preview.extras;
  const confidence = preview.draft.confidence ?? [];
  const redacted = Object.entries(ex.redactedByType);
  return (
    <div className="rw-scroll" data-rw="preview-view" aria-label={t.previewTitle}>
      <h2>{t.previewTitle}</h2>
      {props.mandatory && <p className="rw-notice rw-notice-info">{t.previewMandatory}</p>}
      {!ex.redactionEnabled && (
        <p className="rw-notice rw-notice-err" role="alert">
          Gizleme: KAPALI — {t.redactOff}
        </p>
      )}
      <div className="rw-card">
        <h3>{t.confidence}</h3>
        <ul className="rw-conf" data-rw="confidence">
          {confidence.map((c) => (
            <li key={c.key} className={c.level === 'ok' ? 'rw-ok' : 'rw-warn'}>
              {c.level === 'ok' ? 'ok' : '⚠'} · {c.message}
              {c.hint && <span className="rw-conf-hint"> → {c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="rw-card">
        <h3>{t.alsoSent}</h3>
        <div className="rw-kv" data-rw="also-sent">
          <span>{t.rrwebEvents}</span>
          <span>{ex.events}</span>
          <span>{t.domSize}</span>
          <span>{formatBytes(ex.domBytes)}</span>
          <span>{t.networkEntries}</span>
          <span>{ex.network}</span>
          <span>{t.redactedValues}</span>
          <span>{redacted.length ? redacted.map(([k, v]) => `${k}: ${v}`).join(', ') : t.none}</span>
        </div>
        <fieldset className="rw-row" style={{ border: 0, padding: 0, margin: '8px 0 0', flexWrap: 'wrap' }}>
          <legend className="rw-muted">{t.exclude}</legend>
          {(
            [
              ['network', t.excludeNetwork],
              ['dom', t.excludeDom],
              ['store', t.excludeStore],
            ] as const
          ).map(([key, label]) => (
            <span key={key} className="rw-row">
              <input
                id={`rw-ex-${key}`}
                type="checkbox"
                checked={!!exclude[key]}
                data-rw={`exclude-${key}`}
                onChange={(e) => setExclude({ ...exclude, [key]: e.target.checked })}
              />
              <label htmlFor={`rw-ex-${key}`} style={{ margin: 0 }}>
                {label}
              </label>
            </span>
          ))}
        </fieldset>
      </div>
      <pre data-rw="preview-markdown">
        <Highlighted text={preview.markdown} />
      </pre>
      <details style={{ marginTop: 10 }}>
        <summary className="rw-muted">
          {t.rawJson} ({formatBytes(ex.bodyBytes)})
        </summary>
        <pre>{prepared.previewSource.length > 200_000 ? `${prepared.previewSource.slice(0, 200_000)}…` : prepared.previewSource}</pre>
      </details>
      {props.rejected && (
        <p className="rw-notice rw-notice-err" role="alert" data-rw="rejected">
          {t.sendFailed}: HTTP {props.rejected.status} — {props.rejected.error}
        </p>
      )}
      <div className="rw-actions">
        <button type="button" onClick={props.onBack}>
          {t.backToTimeline}
        </button>
        <button type="button" className="rw-primary" disabled={props.busy} onClick={props.onSend} data-rw="send">
          {props.busy ? t.sending : t.send}
        </button>
      </div>
    </div>
  );
}

function ResultView({ t, result, queued, onNew }: { t: Strings; result: SendResult; queued: number; onNew: () => void }) {
  return (
    <div className="rw-scroll" data-rw="result" data-result={result.kind}>
      {result.kind === 'sent' && (
        <div className="rw-notice rw-notice-ok" role="status">
          <strong>{t.sent}</strong> · <code data-rw="incident-id">{result.id}</code>
          <p>{t.sentHint}</p>
        </div>
      )}
      {result.kind === 'clipboard' && (
        <p className="rw-notice rw-notice-info" role="status">
          {t.copied}
        </p>
      )}
      {result.kind === 'download' && (
        <p className="rw-notice rw-notice-info" role="status">
          {t.downloaded} <code>{result.file}</code>
        </p>
      )}
      {result.kind !== 'sent' && queued > 0 && <p className="rw-muted">{t.queued}</p>}
      <div className="rw-actions">
        <button type="button" onClick={onNew} data-rw="new-incident">
          {t.newIncident}
        </button>
      </div>
    </div>
  );
}
