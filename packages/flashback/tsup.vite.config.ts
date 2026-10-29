import { defineConfig } from 'tsup';

// `flashback-devtools/vite`: Node'da çalışan derleme eklentisi (R13). Tarayıcı paketinden (tsup.config.ts) sonra
// ayrı derlenir: o yapılandırma `dist`'i temizler, aynı anda çalışsalar bu çıktıyı silebilirdi.
export default defineConfig({
  entry: ['src/vite.ts'],
  format: ['esm'],
  dts: true,
  target: 'node22',
  platform: 'node',
  external: ['vite', '@babel/parser', 'magic-string'],
});
