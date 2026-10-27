import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  target: 'node22',
  noExternal: ['@rewind/shared'],
  banner: ({ format }) => (format === 'esm' ? {} : {}),
});
