import type { MouseEvent, ReactNode } from 'react';
import { Account } from './Account';
import { Cart } from './Cart';
import { Login } from './Login';
import { ProductList } from './ProductList';
import { navigate, usePath } from './router';

function Link({ to, children }: { to: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  );
}

export function App() {
  const path = usePath();
  return (
    <div className="app">
      <header>
        <h1>Rewind Mağaza</h1>
        <nav aria-label="Ana menü">
          <Link to="/">Ürünler</Link>
          <Link to="/account">Hesabım</Link>
          <Link to="/login">Giriş</Link>
        </nav>
      </header>
      <main>
        {path === '/login' ? (
          <Login />
        ) : path === '/account' ? (
          <Account />
        ) : (
          <div className="shop">
            <ProductList />
            <Cart />
          </div>
        )}
      </main>
    </div>
  );
}
