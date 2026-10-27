import type { ReactNode } from 'react';
import { FlashbackDevtools } from './flashback';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <FlashbackDevtools />
      </body>
    </html>
  );
}
