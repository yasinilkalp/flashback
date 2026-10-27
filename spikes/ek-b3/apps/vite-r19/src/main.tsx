import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Rewind } from 'rewind-devtools';
import { ClientRoot } from './fixture/ClientRoot';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientRoot />
    <Rewind />
  </StrictMode>,
);
