import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Rewind } from 'rewind-devtools';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Rewind enabled={import.meta.env.DEV} endpoint={import.meta.env.VITE_REWIND_ENDPOINT} />
  </StrictMode>,
);
