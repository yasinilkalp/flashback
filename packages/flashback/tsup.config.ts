import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/noop.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  platform: 'browser',
  // Çalışma zamanı (yakalama + arayüz) ayrı parçaya düşer; ana giriş onu yalnızca üretim dışı dalda `import()` eder.
  splitting: true,
  esbuildOptions(options) {
    // esbuild tarayıcı platformunda NODE_ENV'i derleme anında sabitler; tüketicinin bundler'ı karar versin diye
    // ifade olduğu gibi bırakılır.
    options.define = { ...options.define, 'process.env.NODE_ENV': 'process.env.NODE_ENV' };
  },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'source-map-js'],
});
