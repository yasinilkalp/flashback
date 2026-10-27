import { create } from 'zustand';

export interface Product {
  id: number;
  name: string;
  price: number;
}

export interface CartItem extends Product {
  qty: number;
}

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  discount: number;
  add: (p: Product) => void;
  applyDiscount: (code: string, discount: number) => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  couponCode: null,
  discount: 0,
  add: (p) =>
    set((s) => {
      const existing = s.items.find((i) => i.id === p.id);
      return {
        items: existing ? s.items.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) : [...s.items, { ...p, qty: 1 }],
      };
    }),
  applyDiscount: (couponCode, discount) => set({ couponCode, discount }),
}));
