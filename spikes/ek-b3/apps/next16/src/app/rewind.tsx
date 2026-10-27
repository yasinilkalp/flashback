'use client';
import { Rewind } from 'rewind-devtools';

export function RewindDevtools() {
  return <Rewind enabled={process.env.NODE_ENV === 'development'} />;
}
