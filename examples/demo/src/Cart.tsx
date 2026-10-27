import { useEffect, useState, type FormEvent } from 'react';
import { formatTry } from './format';
import { useCartStore } from './store';

/** Bu tutar ve üzerindeki (indirimli) siparişlerde kargo ücretsizdir. */
const FREE_SHIPPING_MIN = 1500;

export function Cart() {
  const items = useCartStore((s) => s.items);
  const discount = useCartStore((s) => s.discount);
  const applyDiscount = useCartStore((s) => s.applyDiscount);
  const [shippingFee, setShippingFee] = useState(0);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/shipping')
      .then((r) => r.json())
      .then((data: { fee: number }) => setShippingFee(data.fee));
  }, []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discounted = subtotal * (1 - discount);
  const shipping = items.length === 0 || discounted >= FREE_SHIPPING_MIN ? 0 : shippingFee;
  const total = discounted + shipping; // BUG(YAZ10): kargo ücreti API'den metin gelir → düzeltme: discounted + Number(shipping)

  async function applyCoupon(e: FormEvent) {
    e.preventDefault();
    setCouponError(null);
    try {
      const res = await fetch('/api/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 400) {
        setCouponError('Geçersiz kupon');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { discount: number };
      applyDiscount(code, data.discount);
    } catch (err) {
      console.error('Kupon isteği başarısız:', err);
      setCouponError(null); // BUG(KIS20): hata yutuluyor → düzeltme: setCouponError('Kupon uygulanamadı');
    }
  }

  return (
    <section className="cart" aria-labelledby="cart-title">
      <h2 id="cart-title">Sepet</h2>
      {items.length === 0 ? (
        <p>Sepetiniz boş.</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              {i.name} × {i.qty} — {formatTry(i.price * i.qty)}
            </li>
          ))}
        </ul>
      )}
      <dl>
        <dt>Ara toplam</dt>
        <dd data-testid="subtotal">{formatTry(subtotal)}</dd>
        <dt>Kargo</dt>
        <dd data-testid="shipping">{formatTry(shipping)}</dd>
        <dt>Toplam</dt>
        <dd data-testid="total">{formatTry(total)}</dd>
      </dl>
      <form onSubmit={applyCoupon}>
        <label htmlFor="coupon">Kupon kodu</label>
        <input id="coupon" name="coupon" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="submit">Uygula</button>
      </form>
      {couponError && <p role="alert">{couponError}</p>}
    </section>
  );
}
