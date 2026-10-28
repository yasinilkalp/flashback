/** Flashback araç çubuğu (FR-UI-01, FR-UI-10, FR-REC-01) ve panel iskeleti (FR-UI-02, FR-UI-11, FR-UI-13). */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isEditableTarget, matchesShortcut, parseShortcut } from '../config.js';
import type { ControllerState, FlashbackController, PanelTab } from '../controller.js';
import { BasketTab } from './Basket.js';
import { strings, type Strings } from './i18n.js';
import { Icon } from './Icons.js';
import { IncidentsTab } from './Incidents.js';
import { Logo } from './Logo.js';
import { RecordPicker } from './RecordPicker.js';
import { clock } from './Timeline.js';

type Theme = 'dark' | 'light';
const THEME_KEY = 'flashback:theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
}

/** Panel teması: kullanıcı seçmediyse sistem temasını izler; seçim sayfanın kökeninde saklanır. */
function useTheme(): [Theme, () => void] {
  const [chosen, setChosen] = useState<Theme | null>(storedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(LIGHT_QUERY);
    const onChange = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const theme = chosen ?? system;
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setChosen(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* depolama kapalı: seçim yalnızca bu oturumda geçerli */
    }
  };
  return [theme, toggle];
}

const COLLAPSED_KEY = 'flashback:collapsed';

/** Araç çubuğu küçültüldü mü: seçim sayfanın kökeninde saklanır, kayıt küçültülmüşken de sürer. */
function useCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setCollapsed(v);
    try {
      if (v) localStorage.setItem(COLLAPSED_KEY, '1');
      else localStorage.removeItem(COLLAPSED_KEY);
    } catch {
      /* depolama kapalı: seçim yalnızca bu oturumda geçerli */
    }
  };
  return [collapsed, set];
}

/** `alt+shift+r` → `Alt+Shift+R` (ipucu metni için). */
function shortcutLabel(s: string): string {
  return s
    .split('+')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join('+');
}

export function Shell({ controller }: { controller: FlashbackController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const t = strings(controller.cfg.locale);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const shortcut = parseShortcut(controller.cfg.shortcut);
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, shortcut) || isEditableTarget(e.composedPath()[0] ?? null)) return;
      e.preventDefault();
      e.stopPropagation();
      controller.toggleRecording();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [controller]);

  // Panel kapanınca odak araç çubuğuna döner; "Kayda başla" penceresi açıldıysa odak onda kalır.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !state.open && !state.picker) launcherRef.current?.focus();
    wasOpen.current = state.open;
  }, [state.open, state.picker]);

  return (
    <div className="fb-root" data-theme={theme}>
      <Launcher buttonRef={launcherRef} controller={controller} state={state} t={t} />
      {state.open && <Panel controller={controller} state={state} t={t} theme={theme} onToggleTheme={toggleTheme} />}
    </div>
  );
}

const RECEIVER_TEXT = { connected: 'receiverConnected', disconnected: 'receiverDisconnected', wrong_project: 'receiverWrongProject' } as const;

/** Köşedeki dikey araç çubuğu: kayıt durumu, kaydet/durdur, sepet, kayıtlar, alıcı durumu ve küçültme. */
function Launcher({
  controller,
  state,
  t,
  buttonRef,
}: {
  controller: FlashbackController;
  state: ControllerState;
  t: Strings;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [collapsed, setCollapsed] = useCollapsed();
  const recordRef = useRef<HTMLButtonElement>(null);
  const onOpen = (tab: PanelTab) => controller.open(tab);
  // Seçim penceresi kapanınca odak kayıt düğmesine (küçükken logoya) döner.
  const pickerClosed = () => (recordRef.current ?? buttonRef.current)?.focus();
  const picker = state.picker && <RecordPicker controller={controller} state={state} t={t} onClose={pickerClosed} />;
  // Küçült/aç düğmesi kendini kaldırır; odak yeni görünen ana düğmeye geçer.
  const moveFocus = useRef(false);
  useEffect(() => {
    if (moveFocus.current) buttonRef.current?.focus();
    moveFocus.current = false;
  }, [collapsed, buttonRef]);
  const flip = (v: boolean) => {
    moveFocus.current = true;
    setCollapsed(v);
  };

  const receiver = t[RECEIVER_TEXT[state.receiver]];
  const elapsed = clock(state.elapsedMs);
  const project = state.health ? `${t.project}: ${state.health.projectName}` : '';
  const status = state.recording ? `${t.recording} (${elapsed})` : t.notRecording;
  const title = [status, receiver, project].filter(Boolean).join(' · ');
  const shortcut = shortcutLabel(controller.cfg.shortcut);
  const count = state.basket?.length ?? 0;
  const dot = <span className={`fb-dot ${state.recording ? 'fb-rec' : 'fb-idle'}`} aria-hidden="true" />;
  const unreadBadge = state.unread > 0 && (
    <span className="fb-badge" aria-hidden="true">
      {state.unread}
    </span>
  );
  const unread = state.unread > 0 ? ` — ${state.unread} ${t.unread}` : '';
  const notice = state.notice && !state.picker && <Toast t={t} notice={state.notice} />;

  if (collapsed) {
    return (
      <div className={`fb-bar fb-pos-${controller.cfg.position}`} role="group" aria-label={t.launcher} data-fb="launcher-bar" data-collapsed="">
        <button
          ref={buttonRef}
          type="button"
          className="fb-bar-expand"
          aria-label={`${t.expand} — ${title}${unread}`}
          title={title}
          data-fb="expand"
          data-receiver={state.receiver}
          onClick={() => flip(false)}
        >
          {/* Küçükken yalnızca logo; kayıt sürüyorsa kırmızı nokta. Alıcı durumu ve rozetler açınca görünür. */}
          <Logo className="fb-logo" />
          {state.recording && dot}
        </button>
        {picker}
        {notice}
      </div>
    );
  }

  return (
    <div className={`fb-bar fb-pos-${controller.cfg.position}`} role="group" aria-label={t.launcher} data-fb="launcher-bar" data-recording={state.recording || undefined}>
      <span className="fb-bar-mark" title={title} aria-hidden="true">
        <Logo className="fb-logo" />
        {dot}
      </span>
      <span className="fb-bar-time" title={title} aria-hidden="true" data-fb="elapsed">
        {state.recording ? elapsed : t.idle}
      </span>
      <span className="fb-bar-sep" />
      <button
        ref={recordRef}
        type="button"
        className="fb-bar-btn fb-bar-rec"
        aria-label={`${state.recording ? t.stopRecord : t.record} (${shortcut}) — ${title}`}
        aria-pressed={state.recording}
        aria-haspopup={state.recording ? undefined : 'dialog'}
        aria-expanded={state.recording ? undefined : state.picker}
        title={`${state.recording ? t.stopRecord : t.record} · ${shortcut}`}
        data-fb="record"
        data-receiver={state.receiver}
        onClick={() => {
          if (state.recording) void controller.stopRecording();
          else if (state.picker) controller.closePicker();
          else controller.openPicker();
        }}
      >
        <Icon name={state.recording ? 'stop' : 'record'} />
      </button>
      <button
        ref={buttonRef}
        type="button"
        className="fb-bar-btn fb-bar-main"
        aria-label={`${t.launcherAria} — ${count} ${t.basketItem}`}
        aria-expanded={state.open}
        title={t.openBasket}
        data-fb="launcher"
        data-receiver={state.receiver}
        onClick={() => (state.open ? controller.close() : onOpen('basket'))}
      >
        <Icon name="basket" />
        {count > 0 && (
          <span className="fb-badge" aria-hidden="true" data-fb="basket-count">
            {count}
          </span>
        )}
      </button>
      <button type="button" className="fb-bar-btn" aria-label={`${t.tabIncidents}${unread}`} title={t.tabIncidents} data-fb="open-incidents" onClick={() => onOpen('incidents')}>
        <Icon name="inbox" />
        {unreadBadge}
      </button>
      <span className="fb-bar-sep" />
      <span className="fb-bar-recv" data-receiver={state.receiver} title={[receiver, project].filter(Boolean).join(' · ')} aria-hidden="true">
        <Icon name="plug" />
      </span>
      <button type="button" className="fb-bar-btn" aria-label={t.collapse} title={t.collapse} data-fb="collapse" onClick={() => flip(true)}>
        <Icon name="minimize" />
      </button>
      {picker}
      {notice}
    </div>
  );
}

/** Kayıt durdurulunca araç çubuğunun yanında beliren kısa bildirim (FR-BSK-01). */
function Toast({ t, notice }: { t: Strings; notice: NonNullable<ControllerState['notice']> }) {
  const text =
    notice.kind === 'added'
      ? `${t.basketItem} ${notice.n} ${t.addedToBasket}${notice.truncated ? ` — ${t.clipTruncated}` : ''}`
      : notice.kind === 'tooShort'
        ? t.tooShort
        : notice.message;
  return (
    <div className={`fb-toast${notice.kind === 'added' ? '' : ' fb-toast-warn'}`} role="status" data-fb="toast">
      {text}
    </div>
  );
}

function Panel({
  controller,
  state,
  t,
  theme,
  onToggleTheme,
}: {
  controller: FlashbackController;
  state: ControllerState;
  t: Strings;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const tab = state.tab;
  const setTab = (next: PanelTab) => controller.setTab(next);
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
          {(['basket', 'incidents'] as const).map((id) => (
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
              {id === 'basket' ? t.tabBasket : t.tabIncidents}
              {id === 'basket' && !!state.basket?.length && <span className="fb-badge">{state.basket.length}</span>}
              {id === 'incidents' && state.unread > 0 && <span className="fb-badge">{state.unread}</span>}
            </button>
          ))}
        </div>
        <span className="fb-spacer" />
        <div className="fb-win">
          <button
            type="button"
            className="fb-icon-btn"
            aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
            title={theme === 'dark' ? t.themeToLight : t.themeToDark}
            onClick={onToggleTheme}
            data-fb="theme"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="fb-icon-btn" aria-label={t.close} title={`${t.close} (Esc)`} onClick={() => controller.close()} data-fb="close">
            <Icon name="close" />
          </button>
        </div>
      </div>
      {redactOff && (
        <div className="fb-strip fb-strip-err" role="alert" data-fb="redact-off">
          {t.redactOff}
        </div>
      )}
      {controller.cfg.productionWarning && <div className="fb-strip fb-strip-err" role="alert">{t.productionOn}</div>}
      {state.receiver === 'disconnected' && <div className="fb-strip fb-strip-warn">{t.receiverDownHint}</div>}
      {state.receiver === 'wrong_project' && (
        <div className="fb-strip fb-strip-warn" role="alert" data-fb="wrong-project">
          {t.wrongProjectHint}
          {state.health ? ` (${t.project}: ${state.health.projectName})` : ''}
        </div>
      )}
      {state.queueDelivered > 0 && <div className="fb-strip fb-strip-warn">{t.queueDelivered}: {state.queueDelivered}</div>}
      <div className="fb-body" id="fb-tab-basket" role="tabpanel" hidden={tab !== 'basket'} style={tab !== 'basket' ? { display: 'none' } : undefined}>
        <BasketTab controller={controller} state={state} t={t} />
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
