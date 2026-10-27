/** Rewind düğmesi (FR-UI-01, FR-UI-10) ve panel iskeleti (FR-UI-02, FR-UI-11, FR-UI-13). */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isEditableTarget, matchesShortcut, parseShortcut } from '../config.js';
import type { ControllerState, RewindController } from '../controller.js';
import { strings, type Strings } from './i18n.js';
import { IncidentsTab } from './Incidents.js';
import { TimelineTab } from './Timeline.js';

export function Shell({ controller }: { controller: RewindController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const t = strings(controller.cfg.locale);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const shortcut = parseShortcut(controller.cfg.shortcut);
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, shortcut) || isEditableTarget(e.composedPath()[0] ?? null)) return;
      e.preventDefault();
      e.stopPropagation();
      controller.toggle();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [controller]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !state.open) launcherRef.current?.focus();
    wasOpen.current = state.open;
  }, [state.open]);

  return (
    <div className="rw-root">
      <Launcher buttonRef={launcherRef} controller={controller} state={state} t={t} />
      {state.open && <Panel controller={controller} state={state} t={t} />}
    </div>
  );
}

const RECEIVER_TEXT = { connected: 'receiverConnected', disconnected: 'receiverDisconnected', wrong_project: 'receiverWrongProject' } as const;

function Launcher({ controller, state, t, buttonRef }: { controller: RewindController; state: ControllerState; t: Strings; buttonRef: React.Ref<HTMLButtonElement> }) {
  const receiver = t[RECEIVER_TEXT[state.receiver]];
  const title = [state.open ? t.paused : t.recording, receiver, state.health ? `${t.project}: ${state.health.projectName}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`rw-launcher rw-pos-${controller.cfg.position}`}
      aria-label={`${t.launcherAria} — ${title}`}
      aria-expanded={state.open}
      title={title}
      data-rw="launcher"
      data-receiver={state.receiver}
      onClick={() => controller.toggle()}
    >
      <span className={`rw-dot ${state.open ? 'rw-frozen' : 'rw-rec'}`} aria-hidden="true" />
      <span>{t.launcher}</span>
      <span className="rw-muted" data-rw="buffer-seconds">
        {Math.floor(state.bufferMs / 1000)} {t.seconds}
      </span>
      <span className={`rw-recv rw-recv-${state.receiver}`} aria-hidden="true" />
      {state.unread > 0 && (
        <span className="rw-badge" aria-label={`${state.unread} ${t.unread}`}>
          {state.unread}
        </span>
      )}
    </button>
  );
}

type Tab = 'timeline' | 'incidents';

function Panel({ controller, state, t }: { controller: RewindController; state: ControllerState; t: Strings }) {
  const [tab, setTab] = useState<Tab>('timeline');
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => ref.current?.focus(), []);
  const redactOff = controller.cfg.redact.enabled === false;

  return (
    <div
      ref={ref}
      className="rw-panel"
      role="dialog"
      aria-modal="false"
      aria-label={t.panelTitle}
      tabIndex={-1}
      data-rw="panel"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && !e.defaultPrevented) controller.close();
      }}
    >
      <div className="rw-header">
        <span className="rw-title">{t.panelTitle}</span>
        <div role="tablist" aria-label={t.panelTitle} className="rw-row">
          {(['timeline', 'incidents'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="rw-tab"
              aria-selected={tab === id}
              aria-controls={`rw-tab-${id}`}
              data-rw={`tab-${id}`}
              onClick={() => setTab(id)}
            >
              {id === 'timeline' ? t.tabTimeline : t.tabIncidents}
              {id === 'incidents' && state.unread > 0 && <span className="rw-badge">{state.unread}</span>}
            </button>
          ))}
        </div>
        <span className="rw-spacer" />
        <button type="button" aria-label={t.close} onClick={() => controller.close()} data-rw="close">
          ✕
        </button>
      </div>
      {redactOff && (
        <div className="rw-strip rw-strip-err" role="alert" data-rw="redact-off">
          {t.redactOff}
        </div>
      )}
      {controller.cfg.productionWarning && <div className="rw-strip rw-strip-err" role="alert">{t.productionOn}</div>}
      {state.memoryWarning && <div className="rw-strip rw-strip-warn">{t.memoryWarn}</div>}
      {state.receiver !== 'connected' && <div className="rw-strip rw-strip-warn">{t.receiverDownHint}</div>}
      {state.queueDelivered > 0 && <div className="rw-strip rw-strip-warn">{t.queueDelivered}: {state.queueDelivered}</div>}
      <div className="rw-body" id="rw-tab-timeline" role="tabpanel" hidden={tab !== 'timeline'} style={tab !== 'timeline' ? { display: 'none' } : undefined}>
        <TimelineTab controller={controller} state={state} t={t} />
      </div>
      {tab === 'incidents' && (
        <div className="rw-body" id="rw-tab-incidents" role="tabpanel">
          <IncidentsTab controller={controller} state={state} t={t} />
        </div>
      )}
    </div>
  );
}
