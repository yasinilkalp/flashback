'use client';
import { Rewind } from 'rewind-devtools';

/** packages/rewind/README.md'deki Next.js App Router kurulumu. */
export function RewindDevtools() {
  return <Rewind enabled={process.env.NODE_ENV === 'development'} endpoint={process.env.NEXT_PUBLIC_REWIND_ENDPOINT} />;
}
