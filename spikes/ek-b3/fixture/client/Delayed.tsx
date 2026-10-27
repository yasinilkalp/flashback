'use client';
import { useEffect, useState } from 'react';

export function Delayed() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, []);
  return ready ? <mark data-ekb3="@">gecikmeli içerik</mark> : <span data-ekb3="@">bekleniyor</span>;
}
