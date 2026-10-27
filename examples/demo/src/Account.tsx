import { useEffect, useState } from 'react';
import { formatTry } from './format';
import { navigate } from './router';

interface Order {
  id: string;
  total: number;
  date: string;
}

export function Account() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/orders').then(async (res) => {
      if (cancelled) return;
      if (res.status === 401) {
        navigate('/login');
        return;
      }
      const data = (await res.json()) as { orders: Order[] };
      if (!cancelled) setOrders(data.orders);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!orders) return <p>Yükleniyor…</p>;
  const count = orders.reduce((n) => n + 1, 1); // BUG(ACCOUNT): sayım 1'den başlar → düzeltme: orders.reduce((n) => n + 1, 0)

  return (
    <section aria-labelledby="account-title">
      <h2 id="account-title">Hesabım</h2>
      <p data-testid="order-count">Sipariş sayısı: {count}</p>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            {o.id} · {o.date} · {formatTry(o.total)}
          </li>
        ))}
      </ul>
    </section>
  );
}
