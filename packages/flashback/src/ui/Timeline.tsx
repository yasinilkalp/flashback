/**
 * Zaman çizelgesi (FR-UI-04/05/06, FR-REC-12, FR-MARK-01/07/09): dondurulmuş tampon rrweb `Replayer` ile
 * oynatılır; seçim kipinde tekrar oynatmadaki öğe rrweb kimliğiyle canlı öğeye eşlenir.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EventType, Replayer, type eventWithTime } from 'rrweb';
import { isEditableTarget } from '../config.js';
import type { ControllerState, FlashbackController } from '../controller.js';
import { captureTarget, cloneReplayDom } from '../draft/collect.js';
import { pathOf } from '../draft/confidence.js';
import type { FrozenSnapshot } from '../recorder/recorder.js';
import { PANEL_EVENT_TAG } from '../recorder/recorder.js';
import { Compose, type Mark } from './Compose.js';
import type { Strings } from './i18n.js';
import { Icon } from './Icons.js';

export interface Marker {
  kind: 'network' | 'console' | 'step' | 'panel';
  time: number;
  label: string;
  seq?: number;
}

const ERROR_LEVELS = new Set(['error', 'uncaught', 'unhandledrejection']);

export function buildMarkers(s: FrozenSnapshot): Marker[] {
  const out: Marker[] = [];
  for (const n of s.network) {
    if (n.status >= 400 || n.status === 0 || n.error) out.push({ kind: 'network', time: n.time, seq: n.seq, label: `${n.method} ${pathOf(n.url)} → ${n.error ?? n.status}` });
  }
  for (const c of s.console) if (ERROR_LEVELS.has(c.level)) out.push({ kind: 'console', time: c.time, seq: c.seq, label: `${c.level}: ${c.message.slice(0, 120)}` });
  for (const st of s.steps) out.push({ kind: 'step', time: st.time, label: `${st.type} ${st.type === 'navigate' ? st.url ?? '' : st.selector ?? ''}${st.key ? ` (${st.key})` : ''}` });
  for (const e of s.events) {
    if (e.type === EventType.Custom && (e.data as { tag?: string }).tag === PANEL_EVENT_TAG) {
      const state = (e.data as { payload?: { state?: string } }).payload?.state;
      out.push({ kind: 'panel', time: e.timestamp, label: `panel: ${state ?? ''}` });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export function TimelineTab({ controller, state, t }: { controller: FlashbackController; state: ControllerState; t: Strings }) {
  const snapshot = controller.frozen;
  if (!snapshot || snapshot.events.length < 2) {
    return (
      <div className="fb-scroll">
        <p>{t.noRecording}</p>
      </div>
    );
  }
  return <TimelineInner controller={controller} state={state} snapshot={snapshot} t={t} />;
}

type View = 'edit' | 'preview' | 'result';

/** Zaman çizelgesindeki işaretçi satırı; panel açılış işaretçileri adım satırında durur. */
type Lane = 'network' | 'console' | 'step';
const laneOf = (m: Marker): Lane => (m.kind === 'panel' ? 'step' : m.kind);

function TimelineInner({ controller, state, snapshot, t }: { controller: FlashbackController; state: ControllerState; snapshot: FrozenSnapshot; t: Strings }) {
  const events = snapshot.events;
  const t0 = events[0].timestamp;
  const total = Math.max(1, events[events.length - 1].timestamp - t0);
  // İlk tam anlık görüntüden önce boş bir sayfa vardır. Replayer yalnızca hedef zamandan ÖNCEKİ olayları
  // uygular; bu yüzden zaman çizelgesi ilk tam anlık görüntüden 1 ms sonra başlar.
  const firstFull = events.find((e) => e.type === EventType.FullSnapshot)?.timestamp ?? t0;
  const start = Math.min(total, firstFull - t0 + 1);
  const [time, setTime] = useState(total);
  const [selecting, setSelecting] = useState(false);
  const [mark, setMark] = useState<Mark | null>(null);
  const [resolving, setResolving] = useState(false);
  const [focused, setFocused] = useState<Marker | null>(null);
  const [primary, setPrimary] = useState<{ kind: 'network' | 'console'; seq: number } | undefined>();
  const [view, setView] = useState<View>('edit');
  const [playing, setPlaying] = useState(false);
  const [show, setShow] = useState<Record<Lane, boolean>>({ network: true, console: true, step: true });
  const replayerRef = useRef<Replayer | null>(null);
  const markers = useMemo(() => buildMarkers(snapshot), [snapshot]);
  const rootRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback((ms: number) => Math.min(total, Math.max(start, Math.round(ms))), [start, total]);
  const seek = useCallback(
    (ms: number) => {
      setPlaying(false);
      setTime(clamp(ms));
    },
    [clamp],
  );
  // Oynatma sırasında zaman 50 ms adımlarla güncellenir: her karede tüm paneli yeniden çizmemek için.
  const onTick = useCallback((ms: number) => setTime(clamp(Math.round(ms / 50) * 50)), [clamp]);
  const onEnd = useCallback(() => {
    setPlaying(false);
    setTime(total);
  }, [total]);
  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false);
    setSelecting(false);
    if (time >= total - 50) setTime(start);
    setPlaying(true);
  }, [playing, time, total, start]);
  const toggleSelect = () => {
    setPlaying(false);
    setSelecting((s) => !s);
  };
  const toggleLane = (lane: Lane) => {
    setShow((s) => ({ ...s, [lane]: !s[lane] }));
    if (focused && laneOf(focused) === lane) setFocused(null);
  };

  const pick = useCallback(
    async (node: Element | null) => {
      setPlaying(false);
      setSelecting(false);
      const r = replayerRef.current;
      const doc = r?.iframe.contentDocument;
      if (!r || !doc) return;
      const markedAt = t0 + time;
      const domRoot = cloneReplayDom(doc.documentElement);
      if (!node) {
        setMark({ markedAt, target: null, domRoot, box: null });
        return;
      }
      setResolving(true);
      try {
        const target = await captureTarget(node, r.getMirror(), controller.resolver);
        setMark({ markedAt, target, domRoot, box: boxOf(node, r) });
      } finally {
        setResolving(false);
      }
    },
    [controller, t0, time],
  );

  // S: seçim kipi (yalnızca panel odaktayken), Esc: kipten çık (FR-UI-06), Boşluk: oynat/duraklat (odak bir
  // düğmede değilken). Layout efekti: panel görünür olduğu anda tuş dinleyicisi de hazırdır.
  useLayoutEffect(() => {
    const panel = rootRef.current?.closest('[data-fb="panel"]');
    if (!panel) return;
    const onKey = (e: Event) => {
      const ev = e as KeyboardEvent;
      const target = ev.composedPath()[0] ?? null;
      if (view !== 'edit' || isEditableTarget(target) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (ev.code === 'KeyS') {
        ev.preventDefault();
        setPlaying(false);
        setSelecting((s) => !s);
      } else if (ev.key === 'Escape' && selecting) {
        ev.preventDefault();
        setSelecting(false);
      } else if (ev.code === 'Space' && !(target as Element | null)?.closest?.('button, input, summary, a')) {
        ev.preventDefault();
        togglePlay();
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => panel.removeEventListener('keydown', onKey);
  }, [view, selecting, togglePlay]);

  const rel = (abs: number) => Math.min(total, Math.max(0, abs - t0));
  const shown = markers.filter((m) => show[laneOf(m)]);
  const next = shown.find((m) => rel(m.time) > time + 1);
  const prev = [...shown].reverse().find((m) => rel(m.time) < time - 1);
  const lanes: Array<[Lane, string]> = [
    ['network', t.filterNetwork],
    ['console', t.filterConsole],
    ['step', t.filterSteps],
  ];

  const reset = () => {
    setMark(null);
    setPrimary(undefined);
    setView('edit');
  };

  return (
    <div ref={rootRef} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      <div className="fb-stage" style={view === 'edit' ? undefined : { display: 'none' }}>
        <ReplayView
          events={events}
          time={time}
          playing={playing}
          onTick={onTick}
          onEnd={onEnd}
          selecting={selecting}
          onPick={pick}
          replayerRef={replayerRef}
          selectedBox={mark && mark.markedAt === t0 + time ? mark.box : null}
          t={t}
        >
          {/* Yüzen dok: araç takımı tekrar oynatımın üstünde durur, kayda en geniş alan kalır. */}
          <div className="fb-dock" role="toolbar" aria-label={t.toolbar} data-fb="dock">
            <button type="button" className="fb-dock-btn" aria-label={playing ? t.pause : t.play} title={playing ? t.pause : t.play} onClick={togglePlay} data-fb="play">
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <span className="fb-dock-sep" aria-hidden="true" />
            <button type="button" className="fb-dock-btn" aria-label={t.prevMarker} title={t.prevMarker} disabled={!prev} onClick={() => prev && seek(rel(prev.time))}>
              <Icon name="prev" />
            </button>
            <button type="button" className="fb-dock-btn" aria-label={t.back1s} title={t.back1s} onClick={() => seek(time - 1000)} data-fb="back">
              <span className="fb-num">−1</span>
            </button>
            <button type="button" className="fb-dock-btn" aria-label={t.fwd1s} title={t.fwd1s} onClick={() => seek(time + 1000)}>
              <span className="fb-num">+1</span>
            </button>
            <button type="button" className="fb-dock-btn" aria-label={t.nextMarker} title={t.nextMarker} disabled={!next} onClick={() => next && seek(rel(next.time))}>
              <Icon name="next" />
            </button>
            <span className="fb-dock-sep" aria-hidden="true" />
            <button
              type="button"
              className={`fb-dock-btn${selecting ? ' fb-on' : ''}`}
              aria-label={t.selectMode}
              title={t.selectMode}
              aria-pressed={selecting}
              onClick={toggleSelect}
              data-fb="select"
            >
              <Icon name="select" />
            </button>
            <button type="button" className="fb-dock-btn" aria-label={t.pageLevel} title={`${t.pageLevel} — ${t.pageLevelHint}`} onClick={() => void pick(null)} data-fb="page-level">
              <Icon name="page" />
            </button>
            <span className="fb-dock-sep" aria-hidden="true" />
            {lanes.map(([lane, label]) => (
              <button
                key={lane}
                type="button"
                className="fb-dock-btn"
                aria-label={label}
                title={label}
                aria-pressed={show[lane]}
                onClick={() => toggleLane(lane)}
                data-fb={`filter-${lane}`}
              >
                <span className={`fb-fdot fb-fdot-${lane}`} />
              </button>
            ))}
          </div>
        </ReplayView>
        <div className="fb-controls">
          <span className="fb-time" aria-live={playing ? 'off' : 'polite'}>
            {(time / 1000).toFixed(1)} / {(total / 1000).toFixed(1)} {t.seconds}
          </span>
          <div className="fb-track">
            <div className="fb-markers">
              {shown.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  className={`fb-marker fb-marker-${m.kind}`}
                  style={{ left: `${(rel(m.time) / total) * 100}%` }}
                  title={m.label}
                  aria-label={`${markerName(m, t)}: ${m.label}`}
                  data-fb={`marker-${m.kind}`}
                  onClick={() => {
                    seek(rel(m.time));
                    setFocused(m);
                  }}
                />
              ))}
            </div>
            <input type="range" min={start} max={total} step={50} value={time} aria-label={t.scrubber} data-fb="scrubber" onChange={(e) => seek(Number(e.target.value))} />
          </div>
        </div>
        {focused && (focused.kind === 'network' || focused.kind === 'console') && focused.seq !== undefined && (
          <div className="fb-controls fb-hint">
            <span>
              {markerName(focused, t)}: {focused.label}
            </span>
            <button
              type="button"
              aria-pressed={primary?.seq === focused.seq && primary.kind === focused.kind}
              onClick={() => setPrimary({ kind: focused.kind as 'network' | 'console', seq: focused.seq! })}
              data-fb="make-primary"
            >
              {primary?.seq === focused.seq && primary.kind === focused.kind ? `✓ ${t.primarySelected}` : t.makePrimary}
            </button>
          </div>
        )}
      </div>
      <Compose
        controller={controller}
        state={state}
        t={t}
        mark={mark}
        resolving={resolving}
        primary={primary}
        view={view}
        setView={setView}
        onReset={reset}
      />
    </div>
  );
}

function markerName(m: Marker, t: Strings): string {
  return { network: t.markerNetwork, console: t.markerConsole, step: t.markerStep, panel: t.markerPanel }[m.kind];
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
}

/** Tekrar oynatma iframe'indeki öğenin panel görüntü alanına göre kutusu (ölçek dahil). */
function boxOf(el: Element, r: Replayer): Box | null {
  const viewport = r.wrapper.closest('.fb-viewport');
  if (!viewport) return null;
  const frame = r.iframe.getBoundingClientRect();
  const vp = viewport.getBoundingClientRect();
  const scale = frame.width / (r.iframe.offsetWidth || 1);
  const e = el.getBoundingClientRect();
  return {
    left: frame.left - vp.left + e.left * scale,
    top: frame.top - vp.top + e.top * scale,
    width: e.width * scale,
    height: e.height * scale,
    label: el.tagName.toLowerCase(),
  };
}

function ReplayView({
  events,
  time,
  playing,
  onTick,
  onEnd,
  selecting,
  onPick,
  replayerRef,
  selectedBox,
  t,
  children,
}: {
  events: eventWithTime[];
  time: number;
  playing: boolean;
  onTick: (ms: number) => void;
  onEnd: () => void;
  selecting: boolean;
  onPick: (el: Element) => void;
  replayerRef: React.MutableRefObject<Replayer | null>;
  selectedBox: Box | null;
  t: Strings;
  children?: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hover, setHover] = useState<Box | null>(null);
  const timeRef = useRef(time);
  timeRef.current = time;
  const titleRef = useRef(t.replayFrameTitle);
  titleRef.current = t.replayFrameTitle;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = stageRef.current;
    const vp = viewportRef.current;
    if (!root || !vp) return;
    let r: Replayer | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    setReady(false);
    // Panel iskeleti önce çizilsin: Replayer'ın kurulup sona sarılması büyük sayfalarda yüzlerce ms sürer ve
    // kısayolla aynı görevde yapılırsa panel o süre boyunca hiç görünmez (NFR-LAT-01). Bir kare sonra kurulur.
    const build = () => {
      if (cancelled) return;
      r = new Replayer(events, {
        root,
        mouseTail: false,
        showWarning: false,
        showDebug: false,
        skipInactive: false,
        triggerFocus: false,
        speed: 1,
        // Sanal DOM ile ileri sarma büyük sayfalarda pahalı (5.000 düğüm, 4x CPU: 587 ms → 144 ms; NFR-LAT-01).
        useVirtualDom: false,
      });
      const replayer = r;
      replayer.iframe.title = titleRef.current; // ekran okuyucular için çerçeve adı (FR-UI-13, axe frame-title)
      replayerRef.current = replayer;
      const fit = () => {
        const w = replayer.iframe.offsetWidth || Number(replayer.iframe.getAttribute('width')) || 1;
        const h = replayer.iframe.offsetHeight || Number(replayer.iframe.getAttribute('height')) || 1;
        setScale(Math.min(vp.clientWidth / w, vp.clientHeight / h, 1));
      };
      replayer.on('resize', fit);
      // Yalnızca oynatma kaydın sonuna ulaşınca gelir; ileri sarma (pause(t)) son olayı uygulamaz.
      replayer.on('finish', () => onEndRef.current());
      ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
      ro?.observe(vp);
      replayer.pause(timeRef.current);
      fit();
      setReady(true);
    };
    const raf = typeof requestAnimationFrame === 'undefined' ? null : requestAnimationFrame(() => setTimeout(build, 0));
    if (raf === null) build();
    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
      ro?.disconnect();
      r?.destroy();
      replayerRef.current = null;
    };
  }, [events, replayerRef]);

  useEffect(() => {
    if (playing) return;
    replayerRef.current?.pause(time);
    setHover(null);
  }, [time, playing, replayerRef]);

  // Oynatma rrweb'in kendi zamanlayıcısıyla yapılır; her karede pause(t) ile sarmak büyük sayfalarda çok pahalı.
  useEffect(() => {
    const r = replayerRef.current;
    if (!playing || !ready || !r) return;
    r.play(timeRef.current);
    let raf = requestAnimationFrame(function step() {
      onTickRef.current(r.getCurrentTime());
      raf = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(raf);
      r.pause();
    };
  }, [playing, ready, replayerRef]);

  const elementAt = (e: React.MouseEvent): Element | null => {
    const r = replayerRef.current;
    const doc = r?.iframe.contentDocument;
    if (!r || !doc) return null;
    const rect = r.iframe.getBoundingClientRect();
    return doc.elementFromPoint((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
  };

  const shown = selecting ? hover : selectedBox;
  return (
    <div className="fb-vp-wrap">
      <div ref={viewportRef} className="fb-viewport" data-fb="viewport" aria-busy={!ready}>
        <div ref={stageRef} className="fb-replay" style={{ transform: `scale(${scale})` }} />
        {!ready && (
          <div className="fb-loading" data-fb="replay-loading">
            {t.replayLoading}
          </div>
        )}
        {selecting && ready && (
          <div
            className="fb-overlay"
            role="application"
            aria-label={t.selectModeOn}
            data-fb="pick-overlay"
            onMouseMove={(e) => {
              const el = elementAt(e);
              const r = replayerRef.current;
              setHover(el && r ? boxOf(el, r) : null);
            }}
            onClick={(e) => {
              const el = elementAt(e);
              if (el) onPick(el);
            }}
          />
        )}
        {selecting && ready && (
          <div className="fb-pick-banner" aria-hidden="true">
            {t.selectModeOn}
          </div>
        )}
        {shown && (
          <div className="fb-highlight" style={{ left: shown.left, top: shown.top, width: shown.width, height: shown.height }}>
            <span className="fb-highlight-label">{shown.label}</span>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
