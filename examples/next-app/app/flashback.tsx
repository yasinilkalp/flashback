'use client';
import { Flashback } from 'flashback-devtools';

/** packages/flashback/README.md'deki Next.js App Router kurulumu. */
export function FlashbackDevtools() {
  return <Flashback enabled={process.env.NODE_ENV === 'development'} endpoint={process.env.NEXT_PUBLIC_FLASHBACK_ENDPOINT} />;
}
