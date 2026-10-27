import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncidentStore, createReceiver, probePort, suggestFreePort, type Receiver } from '../src/index.js';
import { tmpDir } from './helpers.js';

describe('port çakışması (FR-RCV-05)', () => {
  let receiver: Receiver;
  let port: number;
  beforeAll(async () => {
    const store = new IncidentStore(tmpDir(), { log: () => {} });
    store.init();
    receiver = createReceiver({
      config: { port: 0, host: '127.0.0.1', allowOrigins: [], maxBodyBytes: 1024, projectId: 'proj-a', projectName: 'a', rateLimitPerMin: 0 },
      store,
      log: () => {},
    });
    port = await receiver.listen();
  });
  afterAll(() => receiver.close());

  it('aynı projectId → same_project; farklı → other_project; boş port → free', async () => {
    expect((await probePort({ host: '127.0.0.1', port, projectId: 'proj-a' })).kind).toBe('same_project');
    const other = await probePort({ host: '127.0.0.1', port, projectId: 'proj-b' });
    expect(other.kind).toBe('other_project');
    const free = await suggestFreePort('127.0.0.1', port + 1);
    expect(free).toBeGreaterThan(port);
    expect((await probePort({ host: '127.0.0.1', port: free!, projectId: 'proj-a' })).kind).toBe('free');
  });
});
