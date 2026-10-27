import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Vue 3 smoke örneği (FR-MARK-06). rewind-devtools React'i eş bağımlılık olarak ister; panel ayrı bir React
// kökünde çalışır (src/rewind.ts).
export default defineConfig({
  plugins: [vue()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['rrweb', 'source-map-js', 'react', 'react-dom/client', 'vue'] },
});
