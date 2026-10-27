import { useEffect, useState } from 'react';
import { formatTry } from './format';
import { useCartStore, type Product } from './store';

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const add = useCartStore((s) => s.add);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data: Product[]) => setProducts(data));
  }, []);

  return (
    <section className="products" aria-labelledby="products-title">
      <h2 id="products-title">Ürünler</h2>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span>{formatTry(p.price)}</span>
            <button type="button" data-testid={`add-${p.id}`} onClick={() => add(p)}>
              Sepete ekle
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
