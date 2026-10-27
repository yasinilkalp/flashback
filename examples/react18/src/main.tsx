import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Flashback } from 'flashback-devtools';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Flashback enabled={import.meta.env.DEV} endpoint={import.meta.env.VITE_FLASHBACK_ENDPOINT} />
  </StrictMode>,
);
