import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// React 18.3 örneği (EK-B3). Kaynak satırı `_debugSource`'tan gelir: JSX geliştirme dönüşümü `jsxDEV`'e
// `{ fileName, lineNumber, columnNumber }` geçirir (plugin-react 6 / Oxc).
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['rrweb', 'source-map-js', 'react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime'] },
});
