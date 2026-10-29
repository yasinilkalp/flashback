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
    <Flashback />
  </StrictMode>,
);
