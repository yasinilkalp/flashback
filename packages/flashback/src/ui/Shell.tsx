/** Flashback düğmesi (FR-UI-01, FR-UI-10) ve panel iskeleti (FR-UI-02, FR-UI-11, FR-UI-13). */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isEditableTarget, matchesShortcut, parseShortcut } from '../config.js';
import type { ControllerState, FlashbackController } from '../controller.js';
import { strings, type Strings } from './i18n.js';
import { IncidentsTab } from './Incidents.js';
import { TimelineTab } from './Timeline.js';
import { Logo } from './Logo.js';

export function Shell({ controller }: { controller: FlashbackController }) {
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
    <div className="fb-root">
      <Launcher buttonRef={launcherRef} controller={controller} state={state} t={t} />
      {state.open && <Panel controller={controller} state={state} t={t} />}
    </div>
  );
}

const RECEIVER_TEXT = { connected: 'receiverConnected', disconnected: 'receiverDisconnected', wrong_project: 'receiverWrongProject' } as const;

function Launcher({ controller, state, t, buttonRef }: { controller: FlashbackController; state: ControllerState; t: Strings; buttonRef: React.Ref<HTMLButtonElement> }) {
  const receiver = t[RECEIVER_TEXT[state.receiver]];
  const title = [state.open ? t.paused : t.recording, receiver, state.health ? `${t.project}: ${state.health.projectName}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`fb-launcher fb-pos-${controller.cfg.position}`}
      aria-label={`${t.launcherAria} — ${title}`}
      aria-expanded={state.open}
      title={title}
      data-fb="launcher"
      data-receiver={state.receiver}
      onClick={() => controller.toggle()}
    >
      <span className={`fb-dot ${state.open ? 'fb-frozen' : 'fb-rec'}`} aria-hidden="true" />
      <span>{t.launcher}</span>
      <span className="fb-muted" data-fb="buffer-seconds">
        {Math.floor(state.bufferMs / 1000)} {t.seconds}
      </span>
      <span className={`fb-recv fb-recv-${state.receiver}`} aria-hidden="true" />
      {state.unread > 0 && (
        <span className="fb-badge" aria-label={`${state.unread} ${t.unread}`}>
          {state.unread}
        </span>
      )}
    </button>
  );
}

type Tab = 'timeline' | 'incidents';

function Panel({ controller, state, t }: { controller: FlashbackController; state: ControllerState; t: Strings }) {
  const [tab, setTab] = useState<Tab>('timeline');
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const redactOff = controller.cfg.redact.enabled === false;

  return (
    <div
      ref={ref}
      className="fb-panel"
      role="dialog"
      aria-modal="true"
      aria-label={t.panelTitle}
      tabIndex={-1}
      data-fb="panel"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && !e.defaultPrevented) controller.close();
        if (e.key === 'Tab' && ref.current) trapFocus(e, ref.current);
      }}
    >
      <div className="fb-header">
        <span className="fb-title">
          <Logo className="fb-logo" />
          {t.panelTitle}
        </span>
        <div role="tablist" aria-label={t.panelTitle} className="fb-row">
          {(['timeline', 'incidents'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="fb-tab"
              aria-selected={tab === id}
              aria-controls={`fb-tab-${id}`}
              data-fb={`tab-${id}`}
              onClick={() => setTab(id)}
            >
              {id === 'timeline' ? t.tabTimeline : t.tabIncidents}
              {id === 'incidents' && state.unread > 0 && <span className="fb-badge">{state.unread}</span>}
            </button>
          ))}
        </div>
        <span className="fb-spacer" />
        <button type="button" aria-label={t.close} onClick={() => controller.close()} data-fb="close">
          ✕
        </button>
      </div>
      {redactOff && (
        <div className="fb-strip fb-strip-err" role="alert" data-fb="redact-off">
          {t.redactOff}
        </div>
      )}
      {controller.cfg.productionWarning && <div className="fb-strip fb-strip-err" role="alert">{t.productionOn}</div>}
      {state.memoryWarning && <div className="fb-strip fb-strip-warn">{t.memoryWarn}</div>}
      {state.receiver === 'disconnected' && <div className="fb-strip fb-strip-warn">{t.receiverDownHint}</div>}
      {state.receiver === 'wrong_project' && (
        <div className="fb-strip fb-strip-warn" role="alert" data-fb="wrong-project">
          {t.wrongProjectHint}
          {state.health ? ` (${t.project}: ${state.health.projectName})` : ''}
        </div>
      )}
      {state.queueDelivered > 0 && <div className="fb-strip fb-strip-warn">{t.queueDelivered}: {state.queueDelivered}</div>}
      <div className="fb-body" id="fb-tab-timeline" role="tabpanel" hidden={tab !== 'timeline'} style={tab !== 'timeline' ? { display: 'none' } : undefined}>
        <TimelineTab controller={controller} state={state} t={t} />
      </div>
      {tab === 'incidents' && (
        <div className="fb-body" id="fb-tab-incidents" role="tabpanel">
          <IncidentsTab controller={controller} state={state} t={t} />
        </div>
      )}
    </div>
  );
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Panel sayfanın tamamını kaplar: Tab ile odak panelin dışına (görünmeyen sayfaya) kaçmaz (FR-UI-13). */
export function trapFocus(e: { shiftKey: boolean; preventDefault(): void }, panel: HTMLElement): void {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
  if (!items.length) return;
  const root = panel.getRootNode() as Document | ShadowRoot;
  const active = root.activeElement as HTMLElement | null;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
