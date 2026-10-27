import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Rewind, trackStore } from 'rewind-devtools';
import { App } from './App';
import { useCartStore } from './store';
import './styles.css';

trackStore('cart', useCartStore.subscribe, useCartStore.getState);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Rewind enabled={import.meta.env.DEV} endpoint={import.meta.env.VITE_REWIND_ENDPOINT} />
  </StrictMode>,
);
