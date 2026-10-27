'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function Portal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;
  return createPortal(<aside data-ekb3="@" className="toast">portal içeriği</aside>, host);
}
