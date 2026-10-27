'use client';
import { lazy, Suspense } from 'react';
import { LibBox } from 'ekb3-lib';
import { Basic } from './Basic';
import { Delayed } from './Delayed';
import { Helpers } from './Helpers';
import { List } from './List';
import { Long } from './Long';
import { Portal } from './Portal';
import { Typed } from './Typed';
import { Wrappers } from './Wrappers';

const LazyPart = lazy(() => import('./LazyPart'));

export function ClientRoot() {
  return (
    <div data-ekb3="@" id="ekb3-root">
      <Basic />
      <List />
      <Wrappers />
      <Helpers tags={['a', 'bb']} />
      <Typed />
      <Long />
      <Delayed />
      <Portal />
      <LibBox data-ekb3="@" title="kütüphane">
        <span data-ekb3="@">kütüphaneye geçen çocuk</span>
      </LibBox>
      <Suspense fallback={<p>yükleniyor</p>}>
        <LazyPart />
      </Suspense>
    </div>
  );
}
