// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('üretimde etkisiz', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('early capture patches fetch at import; enabled=false restores it and adds no DOM', async () => {
    const original = window.fetch;
    const { Flashback } = await import('../src/index.js');
    expect(window.fetch).not.toBe(original);
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<Flashback enabled={false} />));
    expect(window.fetch).toBe(original);
    expect(document.querySelector('flashback-devtools')).toBeNull();
    await act(async () => root.unmount());
  });

  it("NODE_ENV=production + enabled=true: başlamaz, fetch'e dokunmaz", async () => {
    const original = window.fetch;
    process.env.NODE_ENV = 'production';
    const { Flashback } = await import('../src/index.js');
    expect(window.fetch).toBe(original); // üretimde erken yakalama da kurulmaz
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Flashback enabled />));
    await act(async () => root.unmount());
    expect(document.querySelector('flashback-devtools')).toBeNull();
  });
});
