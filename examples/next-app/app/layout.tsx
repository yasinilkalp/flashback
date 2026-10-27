import type { ReactNode } from 'react';
import { RewindDevtools } from './rewind';
import './globals.css';

export const metadata = { title: 'Rewind Next örneği' };

// Sunucu bileşeni (RSC): istemci fiber'ı yoktur.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <header className="site" data-testid="srv-header">Rewind Next örneği</header>
        {children}
        <RewindDevtools />
      </body>
    </html>
  );
}
