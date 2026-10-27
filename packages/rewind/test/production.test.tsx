// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('production no-op behaviour (FR-CFG-08/09, FR-REC-13)', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('early capture patches fetch at import; enabled=false restores it and adds no DOM', async () => {
    const original = window.fetch;
    const { Rewind } = await import('../src/index.js');
    expect(window.fetch).not.toBe(original);
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<Rewind enabled={false} />));
    expect(window.fetch).toBe(original);
    expect(document.querySelector('rewind-devtools')).toBeNull();
    await act(async () => root.unmount());
  });

  it('NODE_ENV=production + enabled=true: does not start, warns once', async () => {
    const original = window.fetch;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    const { Rewind } = await import('../src/index.js');
    expect(window.fetch).toBe(original); // üretimde erken yakalama da kurulmaz
    for (let i = 0; i < 2; i++) {
      const root = createRoot(document.createElement('div'));
      await act(async () => root.render(<Rewind enabled />));
      await act(async () => root.unmount());
    }
    expect(document.querySelector('rewind-devtools')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('allowProduction');
  });
});
