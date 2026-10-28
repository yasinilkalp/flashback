/** Panel simgeleri: 24×24 çizgi simgeler, renk `currentColor`'dan gelir. */
const PATHS = {
  play: <path d="M7 4.6v14.8a.6.6 0 0 0 .92.5l11.3-7.4a.6.6 0 0 0 0-1L7.92 4.1A.6.6 0 0 0 7 4.6z" fill="currentColor" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth={3.2} />,
  prev: (
    <>
      <path d="M19 20 9 12l10-8z" />
      <path d="M5 19V5" />
    </>
  ),
  next: (
    <>
      <path d="m5 4 10 8-10 8z" />
      <path d="M19 5v14" />
    </>
  ),
  select: (
    <>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4" />
      <path d="m12 12 8.5 3.4-3.7 1.4-1.4 3.7z" />
    </>
  ),
  page: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  moon: <path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.8 6.8 0 0 0 10.6 10.6z" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  record: <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />,
  basket: (
    <>
      <path d="M3 9.5h18l-1.9 9.2a1.8 1.8 0 0 1-1.8 1.3H6.7a1.8 1.8 0 0 1-1.8-1.3z" />
      <path d="M8 9.5 11 4M16 9.5 13 4M9.5 13.5v3M14.5 13.5v3" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" />
    </>
  ),
  inbox: (
    <>
      <path d="M21 12.5h-5.5l-2 2.5h-3l-2-2.5H3" />
      <path d="M6.2 5.1 3 12.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5.5l-3.2-7.4A1.8 1.8 0 0 0 16.1 4H7.9a1.8 1.8 0 0 0-1.7 1.1z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5M12 17.5V21" />
      <path d="M6 8h12v4a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 6 12z" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="fb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
