import type { ReactNode } from 'react';
import { RewindDevtools } from './rewind';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <RewindDevtools />
      </body>
    </html>
  );
}
