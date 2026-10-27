import { memo } from 'react';

export const Price = memo(function Price({ value }: { value: number }) {
  return <b data-testid="price">{value} ₺</b>;
});
