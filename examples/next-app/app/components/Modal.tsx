import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** document.body'ye portal; fiber hiyerarşisinde Shop'un altında kalır. */
export function Modal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="modal" role="dialog" aria-label="Bilgi" data-testid="modal">
      <strong data-testid="modal-title">Portal içeriği</strong>
      <p className="toast" data-testid="modal-text">
        Kargo 1500 ₺ üzeri ücretsiz.
      </p>
    </div>,
    document.body,
  );
}
