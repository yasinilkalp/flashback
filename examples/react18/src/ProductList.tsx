import { ProductRow } from './ProductRow';

export interface Product {
  id: number;
  name: string;
  price: number;
}

export function ProductList({ products, onAdd }: { products: Product[]; onAdd: (p: Product) => void }) {
  return (
    <section className="card" data-testid="products">
      <h2 data-testid="products-title">Ürünler</h2>
      <ul>
        {products.map((p) => (
          <ProductRow key={p.id} product={p} onAdd={() => onAdd(p)} />
        ))}
      </ul>
    </section>
  );
}
