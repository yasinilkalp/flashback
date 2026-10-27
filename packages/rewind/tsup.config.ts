import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  entry: ['src/index.ts', 'src/noop.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  platform: 'browser',
  // Çalışma zamanı (rrweb + panel) ayrı parçaya düşer; ana giriş onu yalnızca üretim dışı dalda `import()` eder.
  splitting: true,
  // @rewind/shared yayımlanmaz, pakete gömülür. Kaynağından derlenir ki kullanılmayan modüller (zod şeması)
  // ağaç sallamayla düşsün; tarayıcı paketi zod içermez.
  noExternal: ['@rewind/shared'],
  esbuildOptions(options) {
    options.alias = { ...options.alias, '@rewind/shared': sharedSrc };
    // esbuild tarayıcı platformunda NODE_ENV'i derleme anında sabitler; tüketicinin bundler'ı karar versin diye
    // ifade olduğu gibi bırakılır (FR-CFG-02/08).
    options.define = { ...options.define, 'process.env.NODE_ENV': 'process.env.NODE_ENV' };
  },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'rrweb', 'source-map-js'],
});
