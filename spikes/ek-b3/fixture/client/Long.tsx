'use client';
/**
 * Uzun dosya: JSX dosyanın derinlerinde, önünde çok sayıda tip ve yardımcı fonksiyon var.
 * Derleyicinin satır kaydırması (import hoisting, enum/tip silme, yardımcı enjeksiyonu) source map
 * eşlemesini bozuyorsa burada görünür.
 */
import { useMemo, useState } from 'react';

export type Currency = 'TRY' | 'EUR' | 'USD';

export interface Money {
  amount: number;
  currency: Currency;
}

export interface LineItem {
  sku: string;
  title: string;
  unit: Money;
  quantity: number;
  tags?: readonly string[];
}

const RATES: Record<Currency, number> = {
  TRY: 1,
  EUR: 36.5,
  USD: 34.2,
};

export function toTry(m: Money): number {
  return Math.round(m.amount * RATES[m.currency] * 100) / 100;
}

export function lineTotal(item: LineItem): Money {
  return { amount: item.unit.amount * item.quantity, currency: item.unit.currency };
}

export function sum(items: readonly LineItem[]): number {
  let total = 0;
  for (const item of items) {
    total += toTry(lineTotal(item));
  }
  return total;
}

export function formatTry(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} ₺`;
}

export function groupByTag(items: readonly LineItem[]): Map<string, LineItem[]> {
  const out = new Map<string, LineItem[]>();
  for (const item of items) {
    for (const tag of item.tags ?? ['etiketsiz']) {
      const list = out.get(tag) ?? [];
      list.push(item);
      out.set(tag, list);
    }
  }
  return out;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export async function fakeLoad<T>(value: T, ms = 0): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  return value;
}

export class Counter {
  #n = 0;
  constructor(private readonly step = 1) {}
  next(): number {
    this.#n += this.step;
    return this.#n;
  }
}

const SAMPLE: readonly LineItem[] = [
  { sku: 'A-1', title: 'Defter', unit: { amount: 45, currency: 'TRY' }, quantity: 2, tags: ['kırtasiye'] },
  { sku: 'B-2', title: 'Kalem', unit: { amount: 1.5, currency: 'EUR' }, quantity: 3, tags: ['kırtasiye', 'ithal'] },
  { sku: 'C-3', title: 'Çanta', unit: { amount: 20, currency: 'USD' }, quantity: 1 },
];

function useCart(initial: readonly LineItem[]) {
  const [items, setItems] = useState(initial);
  const total = useMemo(() => sum(items), [items]);
  const groups = useMemo(() => groupByTag(items), [items]);
  const bump = (sku: string) =>
    setItems((prev) =>
      prev.map((i) => (i.sku === sku ? { ...i, quantity: clamp(i.quantity + 1, 1, 9) } : i)),
    );
  return { items, total, groups, bump };
}

function Price({ value }: { value: number }) {
  return <data data-ekb3="@" value={value}>{formatTry(value)}</data>;
}

export function Long() {
  const { items, total, groups, bump } = useCart(SAMPLE);
  return (
    <article data-ekb3="@" className="card">
      <header data-ekb3="@">
        <h2 data-ekb3="@">Uzun dosya ({items.length} kalem)</h2>
      </header>
      <ol data-ekb3="@">
        {items.map((item) => (
          <li data-ekb3="@" key={item.sku}>
            <button data-ekb3="@" type="button" onClick={() => bump(item.sku)}>
              {item.title} × {item.quantity}
            </button>{' '}
            <Price value={toTry(lineTotal(item))} />
          </li>
        ))}
      </ol>
      <footer data-ekb3="@">
        Toplam: <Price value={total} /> · {groups.size} etiket
      </footer>
    </article>
  );
}
