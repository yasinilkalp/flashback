import { LIMITS } from '@rewind/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { NetworkCapture } from '../src/recorder/network.js';

type Fake = { fetch: typeof fetch };

function harness(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const original: typeof fetch = async (input, init) => handler(String(input instanceof Request ? input.url : input), init);
  const target = { fetch: original } as unknown as typeof globalThis & Fake;
  const capture = new NetworkCapture();
  capture.install(target);
  capture.attached = true;
  return { target, capture, original };
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe('NetworkCapture (FR-REC-03/04/05/10/13)', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it('records method, url, status, headers and textual bodies', async () => {
    const { target, capture } = harness(() => new Response('{"error":"internal"}', { status: 500, headers: { 'content-type': 'application/json' } }));
    cleanup = () => capture.uninstall();
    const res = await target.fetch('http://localhost:5173/api/coupon', { method: 'post', headers: { 'Content-Type': 'application/json' }, body: '{"code":"KIS20"}' });
    expect(await res.json()).toEqual({ error: 'internal' }); // uygulama gövdeyi yine okuyabilir
    await flush();
    const [e] = capture.snapshot();
    expect(e).toMatchObject({ method: 'POST', url: 'http://localhost:5173/api/coupon', status: 500, reqBody: '{"code":"KIS20"}', resBody: '{"error":"internal"}', truncated: false });
    expect(e.reqHeaders['content-type']).toBe('application/json');
    expect(e.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not break or read streaming responses (SSE)', async () => {
    const encoder = new TextEncoder();
    const chunks = ['data: 1\n\n', 'data: 2\n\n', 'data: 3\n\n'];
    const makeStream = () =>
      new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const c of chunks) {
            controller.enqueue(encoder.encode(c));
            await new Promise((r) => setTimeout(r, 5));
          }
          controller.close();
        },
      });
    const readAll = async (res: Response) => {
      const reader = res.body!.getReader();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return text;
        text += new TextDecoder().decode(value);
      }
    };
    const respond = () => new Response(makeStream(), { headers: { 'content-type': 'text/event-stream' } });
    const plain = await readAll(respond());
    const { target, capture } = harness(respond);
    cleanup = () => capture.uninstall();
    const recorded = await readAll(await target.fetch('http://localhost:5173/api/stream'));
    expect(recorded).toBe(plain);
    await flush();
    const [e] = capture.snapshot();
    expect(e.status).toBe(200);
    expect(e.resBody).toBeUndefined();
  });

  it('truncates large bodies and keeps the original size; does not store binary bodies', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(200 * 1024) });
    const { target, capture } = harness((url) =>
      url.endsWith('/big') ? new Response(big, { headers: { 'content-type': 'application/json' } }) : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
    );
    cleanup = () => capture.uninstall();
    await (await target.fetch('http://localhost:5173/big')).text();
    await (await target.fetch('http://localhost:5173/img.png', { method: 'PUT', body: new Blob([new Uint8Array([1])]) })).arrayBuffer();
    await flush();
    const [bigEntry, bin] = capture.snapshot();
    expect(bigEntry.truncated).toBe(true);
    expect(bigEntry.bodySize).toBe(new TextEncoder().encode(big).length);
    expect(new TextEncoder().encode(bigEntry.resBody!).length).toBeLessThanOrEqual(LIMITS.bodyBytes);
    expect(bin.resBody).toBeUndefined();
    expect(bin.reqBody).toBeUndefined();
  });

  it('skips the Rewind endpoint and ignoreUrls (prefix or RegExp), including retroactively', async () => {
    const { target, capture } = harness(() => new Response('ok', { headers: { 'content-type': 'text/plain' } }));
    cleanup = () => capture.uninstall();
    await target.fetch('http://localhost:5173/api/health');
    capture.configure({ endpoint: 'http://127.0.0.1:4747/', ignoreUrls: ['/api/health', /analytics/] });
    expect(capture.snapshot()).toHaveLength(0);
    await target.fetch('http://127.0.0.1:4747/incidents');
    await target.fetch('http://localhost:5173/api/health?x=1');
    await target.fetch('https://cdn.example.com/analytics.js');
    await target.fetch('http://localhost:5173/api/products');
    await flush();
    expect(capture.snapshot().map((e) => e.url)).toEqual(['http://localhost:5173/api/products']);
  });

  it('records network failures and restores the original fetch on uninstall', async () => {
    const { target, capture, original } = harness(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(target.fetch('http://localhost:5173/api/x')).rejects.toThrow('Failed to fetch');
    expect(capture.snapshot()[0]).toMatchObject({ status: 0, error: 'TypeError: Failed to fetch' });
    expect(target.fetch).not.toBe(original);
    capture.uninstall();
    expect(target.fetch).toBe(original);
  });
});
