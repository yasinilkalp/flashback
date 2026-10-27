'use client';
import { Fragment, useMemo } from 'react';

function badge(text: string) {
  return <span data-ekb3="@" className="badge">{text}</span>;
}

// Modül düzeyinde bir kez oluşturulan öğe.
const STATIC_ICON = <i data-ekb3="@" aria-hidden="true">★</i>;

export function Helpers({ tags }: { tags: string[] }) {
  const memoized = useMemo(() => <small data-ekb3="@">memo ile</small>, []);
  const rows = tags.map((t) => (
    <Fragment key={t}>
      <dt data-ekb3="@">{t}</dt>
      <dd data-ekb3="@">{t.length}</dd>
    </Fragment>
  ));
  return (
    <>
      <div data-ekb3="@">{badge('yardımcı')} {STATIC_ICON} {memoized}</div>
      <dl data-ekb3="@">{rows}</dl>
    </>
  );
}
