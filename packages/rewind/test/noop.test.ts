import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as full from '../src/index.js';
import * as noop from '../src/noop.js';

describe('rewind-devtools/noop (FR-CFG-08)', () => {
  it('exports the same API as the full entry, as no-ops', () => {
    expect(Object.keys(noop).sort()).toEqual(Object.keys(full).sort());
    expect(noop.Rewind({ enabled: true })).toBeNull();
    const subscribe = vi.fn();
    expect(noop.trackStore('cart', subscribe, () => ({}))).toBeTypeOf('function');
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('imports nothing at runtime (no recorder or rrweb code can enter a production bundle)', () => {
    const source = readFileSync(new URL('../src/noop.ts', import.meta.url), 'utf8');
    const imports = source.split('\n').filter((l) => /^\s*(import|export)\s.*from\s/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((l) => /^\s*(import|export) type /.test(l))).toBe(true);
  });
});

describe('main entry without the `production` export condition (FR-CFG-08, security #9)', () => {
  const RECORDER_SIGNATURES = /rrweb|takeFullSnapshot|checkoutEveryNms|rewindFetch|SourceMapConsumer|rewind-devtools-ui|data-rewind-ui/;

  async function bundle(nodeEnv: string): Promise<string> {
    const { build } = await import('esbuild');
    const result = await build({
      entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      minify: true,
      conditions: [],
      define: { 'process.env.NODE_ENV': JSON.stringify(nodeEnv) },
      alias: { '@rewind/shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)) },
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      logLevel: 'silent',
    });
    return result.outputFiles.map((f) => f.text).join('\n');
  }

  it('a plain bundler with NODE_ENV=production drops the recorder, panel and rrweb', async () => {
    const code = await bundle('production');
    expect(code).not.toMatch(RECORDER_SIGNATURES);
    expect(code.length).toBeLessThan(10_000);
  }, 30_000);

  it('the same bundle in development still contains the recorder', async () => {
    expect(await bundle('development')).toMatch(/takeFullSnapshot/);
  }, 30_000);
});
