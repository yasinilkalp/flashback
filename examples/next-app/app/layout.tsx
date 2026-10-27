import type { ReactNode } from 'react';
import { FlashbackDevtools } from './flashback';
import './globals.css';

export const metadata = { title: 'Flashback Next örneği' };

// Sunucu bileşeni (RSC): istemci fiber'ı yoktur.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <header className="site" data-testid="srv-header">Flashback Next örneği</header>
        {children}
        <FlashbackDevtools />
      </body>
    </html>
  );
}
