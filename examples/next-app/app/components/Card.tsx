import type { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="card" data-testid="card">
      <h3 data-testid="card-title">{title}</h3>
      {children}
    </aside>
  );
}
