'use client';
import { useState } from 'react';
import { Badge } from './Badge';
import { Card } from './Card';
import { Cart, type CartItem } from './Cart';
import { Modal } from './Modal';
import { ProductList, type Product } from './ProductList';
import { Stats } from './Stats';

/** Modül düzeyinde oluşturulan öğe (sahibi yok). */
const FOOTER = <footer data-testid="footer">Modül düzeyi öğe</footer>;

function renderTag(label: string) {
  return <i data-testid="tag">{label}</i>;
}

export function Shop({ products }: { products: Product[] }) {
  const [items, setItems] = useState<CartItem[]>([{ ...products[0], qty: 1 }]);
  const add = (p: Product) =>
    setItems((prev) => {
      const found = prev.find((i) => i.id === p.id);
      return found ? prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) : [...prev, { ...p, qty: 1 }];
    });
  return (
    <div className="shop" data-testid="shop">
      <ProductList products={products} onAdd={add} />
      <Cart items={items} />
      <Card title="Notlar">
        <p data-testid="card-body">Kart içeriği üst bileşende yazıldı.</p>
        <Badge label="yeni" />
        <Stats count={items.length} />
        {renderTag('etiket')}
      </Card>
      {FOOTER}
      <Modal />
    </div>
  );
}
