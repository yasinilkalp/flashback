import { Price } from './Price';
import type { Product } from './ProductList';

export function ProductRow({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <li data-testid="product-row">
      <span data-testid="product-name">{product.name}</span>{' '}
      <Price value={product.price} />{' '}
      <button type="button" onClick={onAdd} data-testid="add-button">
        Ekle
      </button>
    </li>
  );
}
