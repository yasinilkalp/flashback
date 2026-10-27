import { useState } from 'react';
import { Badge } from './Badge';
import { Card } from './Card';
import { Cart, type CartItem } from './Cart';
import { Modal } from './Modal';
import { ProductList, type Product } from './ProductList';
import { Stats } from './Stats';

const PRODUCTS: Product[] = [
  { id: 1, name: 'Seramik kupa', price: 250 },
  { id: 2, name: 'Noktalı defter', price: 500 },
  { id: 3, name: 'Kanvas çanta', price: 750 },
];

/** Modül düzeyinde oluşturulan öğe (sahibi yok). */
const FOOTER = <footer data-testid="footer">Modül düzeyi öğe</footer>;

function renderTag(label: string) {
  return <i data-testid="tag">{label}</i>;
}

export function App() {
  const [items, setItems] = useState<CartItem[]>([{ ...PRODUCTS[0], qty: 1 }]);
  const add = (p: Product) =>
    setItems((prev) => {
      const found = prev.find((i) => i.id === p.id);
      return found ? prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) : [...prev, { ...p, qty: 1 }];
    });
  return (
    <>
      <h1 data-testid="title">Flashback React 18</h1>
      <div className="shop" data-testid="shop">
        <ProductList products={PRODUCTS} onAdd={add} />
        <Cart items={items} />
        <Card title="Notlar">
          <p data-testid="card-body">Kart içeriği üst bileşende yazıldı.</p>
          <Badge label="yeni" />
          <Stats count={items.length} />
          {renderTag('etiket')}
        </Card>
      </div>
      {FOOTER}
      <Modal />
    </>
  );
}
