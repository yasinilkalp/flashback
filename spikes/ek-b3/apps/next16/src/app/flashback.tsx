'use client';
import { Flashback } from 'flashback-devtools';

export function FlashbackDevtools() {
  return <Flashback enabled={process.env.NODE_ENV === 'development'} />;
}
