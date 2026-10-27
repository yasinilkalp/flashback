import { forwardRef, useRef } from 'react';
import type { Product } from './ProductList';

export interface CartItem extends Product {
  qty: number;
}

const CouponInput = forwardRef<HTMLInputElement, { placeholder: string }>(function CouponInput({ placeholder }, ref) {
  return <input ref={ref} placeholder={placeholder} aria-label="Kupon" data-testid="coupon" />;
});

export function Cart({ items }: { items: CartItem[] }) {
  const input = useRef<HTMLInputElement>(null);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <section className="card">
      <h2 data-testid="cart-title">Sepet</h2>
      <ul>
        {items.map((i) => (
          <li key={i.id} data-testid="cart-item">
            {i.name} × {i.qty}
          </li>
        ))}
      </ul>
      <dl>
        <dt data-testid="total-label">Toplam</dt>
        <dd data-testid="total">{total} ₺</dd>
      </dl>
      <CouponInput ref={input} placeholder="Kupon kodu" />
      <button type="button" onClick={() => input.current?.focus()} data-testid="apply">
        Uygula
      </button>
    </section>
  );
}
