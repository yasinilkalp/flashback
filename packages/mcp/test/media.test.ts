import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncidentSchema, type IncidentDraftInput } from '@flashback/shared';
import { createMcpServer, createReceiver, IncidentStore, loadConfig, type Receiver, type ToolContext } from '../src/index.js';
import { draftInput, tmpDir } from './helpers.js';

/** En küçük geçerli imzalar: alıcı yalnızca dosya imzasına bakar. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2048, 7)]);

function mediaDraft(over: Partial<NonNullable<IncidentDraftInput['media']>> = {}): IncidentDraftInput {
  return draftInput('http://localhost:5173', {
    media: {
      source: 'screen',
      mimeType: 'video/webm;codecs=vp9,opus',
      video: true,
      audio: true,
      durationMs: 42_000,
      bytes: WEBM.length,
      // Tarayıcının uydurduğu yol yok sayılır; yolları alıcı atar.
      file: '../../../etc/passwd',
      keyframes: [
        { t: 1200, width: 960, height: 540, jpeg: JPEG.toString('base64'), file: '/etc/shadow' },
        { t: 3400, width: 960, height: 540, jpeg: JPEG.toString('base64') },
        { t: 5000, width: 960, height: 540, jpeg: Buffer.from('not a jpeg').toString('base64') },
      ],
      ...over,
    },
  });
}

describe('Ekran kaydı (FR-REC-16): alıcı, depo ve get_incident', () => {
  let dir: string;
  let store: IncidentStore;
  let receiver: Receiver;
  let base: string;

  const post = (p: string, body: BodyInit, type: string) =>
    fetch(base + p, { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': type }, body });
  const createIncident = async (d: IncidentDraftInput) => {
    const r = await post('/incidents', JSON.stringify(d), 'application/json');
    expect(r.status).toBe(201);
    return ((await r.json()) as { id: string }).id;
  };

  beforeAll(async () => {
    dir = tmpDir();
    store = new IncidentStore(dir, { log: () => {} });
    store.init();
    receiver = createReceiver({
      config: { port: 0, host: '127.0.0.1', allowOrigins: [], maxBodyBytes: 5 * 1024 * 1024, projectId: 'p1', projectName: 'demo', rateLimitPerMin: 0 },
      store,
      log: () => {},
    });
    base = `http://127.0.0.1:${await receiver.listen()}`;
  });
  afterAll(() => receiver.close());

  it('anahtar kareler dosyaya yazılır; olay JSON\'unda base64 ve tarayıcının yolları kalmaz', async () => {
    const id = await createIncident(mediaDraft());
    const raw = fs.readFileSync(path.join(dir, `${id}.json`), 'utf8');
    expect(raw).not.toContain(JPEG.toString('base64'));
    expect(raw).not.toContain('passwd');
    expect(raw).not.toContain('shadow');
    const inc = IncidentSchema.parse(JSON.parse(raw));
    expect(inc.media).toMatchObject({ source: 'screen', video: true, audio: true, durationMs: 42_000 });
    expect(inc.media!.file).toBeUndefined();
    expect(inc.media!.keyframes.map((k) => k.file)).toEqual([`media/${id}-k1.jpg`, `media/${id}-k2.jpg`, undefined]);
    expect(fs.readFileSync(path.join(dir, 'media', `${id}-k1.jpg`))).toEqual(JPEG);
    expect(fs.existsSync(path.join(dir, 'media', `${id}-k3.jpg`))).toBe(false);
  });

  it('kayıt POST /incidents/:id/media ile bir kez yüklenir; tür, imza ve bildirim denetlenir', async () => {
    const id = await createIncident(mediaDraft());
    expect((await post(`/incidents/${id}/media`, WEBM, 'application/octet-stream')).status).toBe(415);
    expect((await post(`/incidents/${id}/media`, Buffer.from('hello world'), 'video/webm')).status).toBe(400);
    const ok = await post(`/incidents/${id}/media`, WEBM, 'video/webm;codecs=vp9,opus');
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ file: `media/${id}.webm`, bytes: WEBM.length });
    expect(fs.readFileSync(path.join(dir, 'media', `${id}.webm`))).toEqual(WEBM);
    expect(store.require(id).media).toMatchObject({ file: `media/${id}.webm`, bytes: WEBM.length });
    expect((await post(`/incidents/${id}/media`, WEBM, 'video/webm')).status).toBe(409);

    const plain = await createIncident(draftInput());
    expect((await post(`/incidents/${plain}/media`, WEBM, 'audio/webm')).status).toBe(409);
    expect((await post('/incidents/fb-20200101-000000-zzzz/media', WEBM, 'video/webm')).status).toBe(404);
  });

  it('tarayıcı ön isteği (preflight) video/webm için izinli', async () => {
    const r = await fetch(`${base}/incidents/fb-20200101-000000-zzzz/media`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toContain('content-type');
  });

  it('get_incident anahtar kareleri görüntü olarak ve dosya yollarını mutlak olarak verir; NO_IMAGES yalnızca yolları', async () => {
    const id = await createIncident(mediaDraft());
    await post(`/incidents/${id}/media`, WEBM, 'video/webm');
    for (const noImages of [false, true]) {
      const config = { ...loadConfig({ FLASHBACK_DIR: dir }, { cwd: process.cwd(), homedir: '/nonexistent' }), noImages };
      const server = createMcpServer({ mode: 'ok', config, store } as ToolContext);
      const [a, b] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test', version: '0.0.0' });
      await Promise.all([server.connect(a), client.connect(b)]);
      const r = await client.callTool({ name: 'get_incident', arguments: { id } });
      await client.close();
      const content = r.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const images = content.filter((c) => c.type === 'image');
      const video = path.join(store.dir, 'media', `${id}.webm`);
      expect(text).toContain('## Ekran kaydı');
      expect(text).toContain('Ekran/pencere videosu + mikrofon sesi · WebM · 0:42');
      expect(text).toContain(video);
      expect(text).toContain(path.join(store.dir, 'media', `${id}-k2.jpg`));
      expect(text.indexOf('## Ekran kaydı')).toBeLessThan(text.indexOf('## Ayrıntılar'));
      expect(r.structuredContent).toMatchObject({
        media: { source: 'screen', video: true, audio: true, file: video, keyframes: [{ t: 1200 }, { t: 3400 }] },
      });
      if (noImages) {
        expect(images).toEqual([]);
        expect(text).toContain('Anahtar kareler (2):');
      } else {
        expect(images).toEqual([
          { type: 'image', data: JPEG.toString('base64'), mimeType: 'image/jpeg' },
          { type: 'image', data: JPEG.toString('base64'), mimeType: 'image/jpeg' },
        ]);
        expect(text).toContain('görüntü olarak eklendi');
      }
    }
  });

  it('olay silinince ya da kapalı olay budanınca medya dosyaları da gider', async () => {
    const id = await createIncident(mediaDraft());
    await post(`/incidents/${id}/media`, WEBM, 'video/webm');
    const mine = () => fs.readdirSync(store.mediaDir).filter((n) => n.startsWith(id));
    expect(mine().sort()).toEqual([`${id}-k1.jpg`, `${id}-k2.jpg`, `${id}.webm`]);
    store.delete(id);
    expect(mine()).toEqual([]);
    fs.writeFileSync(path.join(store.mediaDir, 'fb-20200101-000000-orph.webm'), WEBM);
    store.prune({ retentionDays: 30 });
    expect(fs.existsSync(path.join(store.mediaDir, 'fb-20200101-000000-orph.webm'))).toBe(false);
  });

  it('mediaPath klasör dışına çıkan yolu reddeder', () => {
    expect(store.mediaPath('media/fb-20200101-000000-abcd.webm')).toBe(path.join(store.mediaDir, 'fb-20200101-000000-abcd.webm'));
    expect(store.mediaPath('../outside.webm')).toBeUndefined();
    expect(store.mediaPath('fb-20200101-000000-abcd.json')).toBeUndefined();
    expect(store.mediaPath(undefined)).toBeUndefined();
  });
});
