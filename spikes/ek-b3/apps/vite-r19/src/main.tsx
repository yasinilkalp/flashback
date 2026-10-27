import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Flashback } from 'flashback-devtools';
import { ClientRoot } from './fixture/ClientRoot';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientRoot />
    <Flashback />
  </StrictMode>,
);
