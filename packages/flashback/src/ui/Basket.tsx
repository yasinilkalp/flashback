/**
 * Sepet sekmesi (FR-BSK-01/03/04/06): üstte olay şeridi ile "Prompt olarak kopyala" ve "Hepsini gönder", altında
 * seçili olayın zaman çizelgesi. Not bekleyen olaylar gönderilmez.
 */
import { useState } from 'react';
import type { BatchResult, ControllerState, Fallback, FlashbackController } from '../controller.js';
import type { Strings } from './i18n.js';
import { Icon } from './Icons.js';
import { TimelineTab } from './Timeline.js';

/** `83_000` → `1:23` */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function BasketTab({ controller, state, t }: { controller: FlashbackController; state: ControllerState; t: Strings }) {
  const list = state.basket ?? [];
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [copied, setCopied] = useState<Fallback | null>(null);
  const ready = list.filter((e) => e.ready).length;
  const waiting = list.length - ready;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setResult(null);
    setCopied(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const sendAll = () => run(async () => setResult(await controller.sendAll()));
  const copyPrompt = () => run(async () => setCopied(await controller.copyPrompt()));

  const banners = (
    <>
      {result && <BatchResultView controller={controller} t={t} result={result} onClose={() => setResult(null)} />}
      {copied && <FallbackNotice t={t} fallback={copied} />}
    </>
  );

  if (!list.length) {
    return (
      <div className="fb-scroll" data-fb="basket-empty">
        {banners}
        <h2>{t.basketEmpty}</h2>
        <p className="fb-hint">{t.basketEmptyHint}</p>
      </div>
    );
  }

  const selected = list.find((e) => e.id === state.selectedId);
  return (
    <div className="fb-basket">
      <div className="fb-bstrip" data-fb="basket-strip">
        <div className="fb-chips" role="group" aria-label={t.tabBasket}>
          {list.map((e) => (
            <button
              key={e.id}
              type="button"
              className="fb-chip"
              aria-pressed={e.id === state.selectedId}
              data-fb={`basket-item-${e.n}`}
              data-ready={e.ready}
              title={`${e.url} · ${e.ready ? t.readyMark : t.noteMark}`}
              onClick={() => void controller.select(e.id)}
            >
              <span className={`fb-chip-dot${e.ready ? ' fb-chip-ready' : ''}`} aria-hidden="true" />
              {t.basketItem} {e.n}
              <span className="fb-chip-time">{clock(e.durationMs)}</span>
              <span className="fb-sr">{e.ready ? t.readyMark : t.noteMark}</span>
            </button>
          ))}
          {selected && (
            <button
              type="button"
              className="fb-icon-btn"
              aria-label={`${t.removeItem}: ${t.basketItem} ${selected.n}`}
              title={t.removeItem}
              onClick={() => void controller.removeItem(selected.id)}
              data-fb="remove-item"
            >
              <Icon name="trash" />
            </button>
          )}
        </div>
        <span className="fb-hint" data-fb="basket-status">
          {waiting ? `${waiting} ${t.needsNote}` : t.allReady}
        </span>
        <div className="fb-row">
          <button type="button" disabled={!ready || busy} onClick={() => void copyPrompt()} data-fb="copy-prompt">
            <Icon name="copy" />
            {t.copyPrompt}
          </button>
          <button type="button" className="fb-primary" disabled={!ready || busy} onClick={() => void sendAll()} data-fb="send-all">
            {t.sendAll}
            {ready > 0 && <span className="fb-badge">{ready}</span>}
          </button>
        </div>
      </div>
      {banners}
      <div className="fb-body">
        <TimelineTab controller={controller} state={state} t={t} />
      </div>
    </div>
  );
}

function FallbackNotice({ t, fallback }: { t: Strings; fallback: Fallback }) {
  return (
    <p className="fb-notice fb-notice-info" role="status" data-fb="prompt-delivered" data-result={fallback.kind}>
      {fallback.kind === 'clipboard' ? (
        t.promptCopied
      ) : (
        <>
          {t.promptDownloaded} <code>{fallback.file}</code>
        </>
      )}
    </p>
  );
}

function BatchResultView({ controller, t, result, onClose }: { controller: FlashbackController; t: Strings; result: BatchResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const prompt = result.prompt;
  return (
    <div className="fb-batch" data-fb="batch-result">
      {result.sent.length > 0 && (
        <div className="fb-notice fb-notice-ok" role="status">
          <strong>
            {result.sent.length} {t.batchSent}
          </strong>
          {result.groupId && (
            <>
              {' '}
              · {t.group} <code data-fb="group-id">{result.groupId}</code>
            </>
          )}
          <div className="fb-ids">
            {result.sent.map((s) => (
              <code key={s.id} data-fb="incident-id">
                {s.id}
              </code>
            ))}
          </div>
          {prompt && (
            <div className="fb-agent-prompt">
              <span className="fb-muted">{t.agentPromptLabel}</span>
              <code data-fb="agent-prompt">{prompt}</code>
              <button
                type="button"
                onClick={() => {
                  void controller.copyText(prompt).then((r) => setCopied(r.kind === 'clipboard'));
                }}
                data-fb="copy-agent-prompt"
              >
                <Icon name="copy" />
                {copied ? t.copiedShort : t.copy}
              </button>
            </div>
          )}
        </div>
      )}
      {result.rejected.map((r) => (
        <p key={r.n} className="fb-notice fb-notice-err" role="alert">
          {t.basketItem} {r.n}: {t.batchRejected} (HTTP {r.status}) — {r.error}
        </p>
      ))}
      {result.fallback && (
        <div className="fb-notice fb-notice-info" role="status" data-fb="batch-offline">
          {t.batchOffline} <FallbackNotice t={t} fallback={result.fallback} />
        </div>
      )}
      <button type="button" className="fb-icon-btn fb-batch-close" aria-label={t.close} title={t.close} onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
