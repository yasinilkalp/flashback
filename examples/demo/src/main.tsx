import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Flashback, trackStore } from 'flashback-devtools';
import { App } from './App';
import { useCartStore } from './store';
import './styles.css';

trackStore('cart', useCartStore.subscribe, useCartStore.getState);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Flashback enabled={import.meta.env.DEV} endpoint={import.meta.env.VITE_FLASHBACK_ENDPOINT} />
  </StrictMode>,
);
