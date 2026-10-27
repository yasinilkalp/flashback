/**
 * Kayıtlar sekmesi (FR-UI-15/16/17/18): durum, not ↔ assertion yan yana, koşu geçmişi, ajan mesajları
 * (DÜZ METİN — HTML asla yorumlanmaz), yanıt kutusu ve yeniden açma.
 */
import { useEffect, useState } from 'react';
import type { IncidentSummary } from '@rewind/shared';
import type { ControllerState, RewindController } from '../controller.js';
import type { Strings } from './i18n.js';

export function IncidentsTab({ controller, state, t }: { controller: RewindController; state: ControllerState; t: Strings }) {
  const incidents = state.incidents;
  useEffect(() => {
    void controller.refreshIncidents();
  }, [controller]);
  useEffect(() => {
    for (const inc of incidents ?? []) controller.markSeen(inc);
  }, [controller, incidents]);

  if (!incidents) return <p className="rw-scroll rw-muted">{state.receiver === 'connected' ? '…' : t.incidentsUnavailable}</p>;
  if (!incidents.length) return <p className="rw-scroll rw-muted">{t.incidentsEmpty}</p>;
  return (
    <div className="rw-scroll" data-rw="incidents">
      {incidents.map((inc) => (
        <IncidentCard key={inc.id} inc={inc} t={t} onReply={(text) => controller.client.reply(inc.id, text)} onReopen={(reason) => controller.client.reopen(inc.id, reason)} onChanged={() => void controller.refreshIncidents()} />
      ))}
    </div>
  );
}

/** "Doğrulandı" rozeti yalnızca assertion metni de görünürken gösterilir (FR-UI-16). */
export function statusBadge(inc: IncidentSummary, t: Strings): { label: string; cls: string } {
  switch (inc.status) {
    case 'fixed':
      return inc.assertionText ? { label: t.statusFixed, cls: 'fixed' } : { label: t.statusFixedNoAssertion, cls: 'fixed_unverified' };
    case 'fixed_unverified':
      return { label: t.statusFixedUnverified, cls: 'fixed_unverified' };
    case 'cannot_reproduce':
      return { label: t.statusCannotReproduce, cls: 'cannot_reproduce' };
    default:
      return { label: t.statusOpen, cls: 'open' };
  }
}

const RUN_ICON = { passed: '✅', failed_assertion: '❌', error: '⚠' } as const;

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

export function IncidentCard({
  inc,
  t,
  onReply,
  onReopen,
  onChanged,
}: {
  inc: IncidentSummary;
  t: Strings;
  onReply: (text: string) => Promise<void>;
  onReopen: (reason: string) => Promise<void>;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState('');
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = statusBadge(inc, t);

  const act = async (fn: () => Promise<void>, done: () => void) => {
    setError(null);
    try {
      await fn();
      done();
      onChanged();
    } catch (e) {
      setError(`${t.actionFailed}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <article className="rw-card" data-rw="incident" data-id={inc.id} aria-label={inc.id}>
      <div className="rw-row" style={{ justifyContent: 'space-between' }}>
        <code>{inc.id}</code>
        <span className={`rw-status rw-status-${badge.cls}`} data-rw="status">
          {badge.label}
        </span>
      </div>
      <p className="rw-muted">
        {timeOf(inc.createdAt)} · {inc.url}
      </p>
      <div className="rw-two">
        <div>
          <h3>{t.yourNote}</h3>
          <p data-rw="note">{inc.note.expected}</p>
        </div>
        <div>
          <h3>{t.assertion}</h3>
          {inc.assertionText ? <pre data-rw="assertion">{inc.assertionText}</pre> : <p className="rw-muted">{t.noAssertion}</p>}
        </div>
      </div>
      {inc.runs.length > 0 && (
        <p data-rw="runs">
          {t.runs}:{' '}
          {inc.runs.map((r, i) => (
            <span key={i} title={r.errorKind ?? r.status} style={{ marginRight: 8 }}>
              {RUN_ICON[r.status]} {timeOf(r.t)}
            </span>
          ))}
        </p>
      )}
      {inc.resolution && (
        <p className="rw-muted">
          {t.resolution}: {inc.resolution.summary}
        </p>
      )}
      {(inc.messages.length > 0 || inc.pendingQuestion) && (
        <div>
          <h3>
            {t.messages}
            {inc.pendingQuestion && <span className="rw-badge" style={{ marginLeft: 6 }}>{t.pendingQuestion}</span>}
          </h3>
          {inc.messages.map((m, i) => (
            <div key={i} className={`rw-msg rw-msg-${m.from}`} data-rw="message">
              <strong>{m.from === 'agent' ? t.agent : t.you}: </strong>
              {m.text}
            </div>
          ))}
          <form
            className="rw-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (reply.trim()) void act(() => onReply(reply.trim()), () => setReply(''));
            }}
          >
            <textarea aria-label={t.replyPlaceholder} placeholder={t.replyPlaceholder} value={reply} onChange={(e) => setReply(e.target.value)} data-rw="reply" />
            <button type="submit" disabled={!reply.trim()}>
              {t.reply}
            </button>
          </form>
        </div>
      )}
      {inc.status !== 'open' && (
        <div style={{ marginTop: 8 }}>
          {!reopening ? (
            <button type="button" onClick={() => setReopening(true)} data-rw="reopen">
              {t.reopen}
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) void act(() => onReopen(reason.trim()), () => setReopening(false));
              }}
            >
              <label htmlFor={`rw-reason-${inc.id}`}>{t.reopenReason}</label>
              <textarea id={`rw-reason-${inc.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="rw-actions">
                <button type="submit" disabled={!reason.trim()}>
                  {t.reopenSend}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {error && (
        <p className="rw-notice rw-notice-err" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
