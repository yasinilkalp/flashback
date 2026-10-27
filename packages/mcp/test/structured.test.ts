import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { estimateTokens } from '@flashback/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IncidentStore,
  compareNewestFirst,
  createMcpServer,
  decodeCursor,
  encodeCursor,
  loadConfig,
  type FlashbackConfig,
  type ToolContext,
} from '../src/index.js';
import { draft, fakeRun, pageLevelDraft, tmpDir } from './helpers.js';

type TextContent = { type: 'text'; text: string };
const TOOLS = ['list_incidents', 'get_incident', 'get_incident_events', 'get_dom_snapshot', 'run_repro', 'get_repro_script', 'reply_to_incident', 'mark_fixed'];

/** listTools çağrılır: SDK istemcisi çıktı şemalarını önbelleğe alır ve her yanıtın structuredContent'ini ajv ile doğrular. */
async function connect(ctx: ToolContext) {
  const server = createMcpServer(ctx);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as TextContent[]).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { isError: r.isError === true, text, sc: r.structuredContent as Record<string, any> | undefined, raw: r };
  };
  return { client, tools, call, close: () => client.close() };
}

function okContext(over: Partial<FlashbackConfig> = {}, now?: () => Date) {
  const dir = tmpDir();
  const config = { ...loadConfig({ FLASHBACK_DIR: dir }, { cwd: process.cwd(), homedir: '/nonexistent' }), ...over };
  const store = new IncidentStore(dir, { log: () => {}, now });
  store.init();
  return { ctx: { mode: 'ok', config, store } as ToolContext & { mode: 'ok' }, store, config };
}

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.map((f) => f()));
  cleanup = [];
});

describe('FR-MCP-10: outputSchema + structuredContent', () => {
  it('her aracın outputSchema\'sı var — şema snapshot', async () => {
    const { ctx } = okContext();
    const { tools, close } = await connect(ctx);
    cleanup.push(close);
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOLS].sort());
    for (const t of tools) {
      expect(t.outputSchema, t.name).toBeDefined();
      expect(t.outputSchema!.type).toBe('object');
      // Bilinmeyen alan reddedilir: sunucu fazladan alan göndermemeli (structured() şemayla ayrıştırır).
      expect((t.outputSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
    }
    expect(Object.fromEntries(tools.map((t) => [t.name, t.outputSchema]))).toMatchSnapshot();
    // Yeni girdi parametreleri (FR-MCP-13, FR-MCP-14)
    const list = tools.find((t) => t.name === 'list_incidents')!;
    expect(Object.keys(list.inputSchema.properties ?? {})).toEqual(['status', 'limit', 'cursor']);
    const script = tools.find((t) => t.name === 'get_repro_script')!;
    expect(Object.keys(script.inputSchema.properties ?? {})).toContain('portable');
  });

  it('başarılı yanıtlar istemci tarafında şemaya uyar; metin içerik geriye uyumlu kalır', async () => {
    const { ctx, store } = okContext();
    const a = store.create(draft(), 'p');
    const page = store.create(pageLevelDraft(), 'p');
    store.update(a.id, (i) => i.repros.push(fakeRun('failed_assertion', 'S'), fakeRun('passed', 'S'), fakeRun('passed', 'S')));
    const { call, close } = await connect(ctx);
    cleanup.push(close);

    const list = await call('list_incidents', { status: 'all' });
    expect(list.isError).toBe(false);
    expect(list.text).toContain('"pendingQuestion": false');
    expect(list.sc).toMatchObject({ status: 'all', nextCursor: null });
    expect(list.sc!.incidents.map((r: { id: string }) => r.id).sort()).toEqual([a.id, page.id].sort());
    expect(list.sc!.incidents[0]).toHaveProperty('primaryEvidence');

    const inc = await call('get_incident', { id: a.id });
    expect(inc.text.startsWith('Köken: ')).toBe(true);
    expect(inc.sc).toMatchObject({
      id: a.id,
      status: 'open',
      file: 'src/Cart.tsx',
      line: 42,
      column: 7,
      targetResolution: 'exact',
      resolution: null,
      pageLevel: false,
      expected: 'Toplam 1380 ₺ olmalı.',
      primaryEvidence: { kind: 'target', ref: null, summary: 'öğe src/Cart.tsx:42' },
      counts: { steps: 3, network: 3, networkErrors: 1, console: 1, store: 1, events: 1, messages: 0, repros: 3 },
    });
    expect(inc.sc!.confidence).toContainEqual({ key: 'synthetic', level: 'warn' });
    expect(inc.sc!.confidence.every((c: object) => Object.keys(c).join() === 'key,level')).toBe(true);

    const pageInc = await call('get_incident', { id: page.id });
    expect(pageInc.sc).toMatchObject({ pageLevel: true, file: null, line: null, targetResolution: null, primaryEvidence: { kind: 'network', ref: 0 } });

    const ev = await call('get_incident_events', { id: a.id, types: ['step'] });
    expect(ev.sc).toMatchObject({ truncated: false, returned: 3, total: 3 });
    expect(ev.sc!.events.every((e: { kind: string }) => e.kind === 'step')).toBe(true);
    expect(ev.sc!.events[1]).toMatchObject({ kind: 'step', type: 'input', value: 'YAZ10' }); // ek alanlar korunur (looseObject)

    const dom = await call('get_dom_snapshot', { id: a.id, contains: 'total' });
    expect(dom.text).toContain('"matches":1');
    expect(dom.sc).toMatchObject({ matches: 1, returned: 1, truncated: false });
    expect(dom.sc!.html).toContain('data-testid="total"');

    const script = await call('get_repro_script', { id: a.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(script.text).toContain('Adım verisi: ');
    expect(script.sc).toMatchObject({ portable: false, assertion: 'await expect(target).toHaveText("1380 ₺");' });
    expect(script.sc!.stepsPath).toMatch(/\.steps\.json$/);
    expect(script.sc!.spec).toContain('flashback repro');
    expect(script.text).toContain(script.sc!.spec);

    const reply = await call('reply_to_incident', { id: a.id, message: 'Hangi kupon?' });
    expect(reply.text).toBe('{"delivered":true}');
    expect(reply.sc).toEqual({ delivered: true, reply: null, code: null });
    const none = await call('reply_to_incident', { id: a.id, message: 'Başka?', wait_seconds: 1 });
    expect(none.sc).toEqual({ delivered: true, reply: null, code: 'no_reply_yet' });

    const fixed = await call('mark_fixed', { id: a.id, resolution: 'fixed', summary: 'Number() eklendi' });
    expect(fixed.text).toContain('"verified": true');
    expect(fixed.sc).toMatchObject({ status: 'fixed', verified: true, note: { expected: 'Toplam 1380 ₺ olmalı.' } });
    expect(fixed.sc!.runs).toHaveLength(3);
    expect(fixed.sc).not.toHaveProperty('missing');

    const closed = await call('get_incident', { id: a.id });
    expect(closed.sc!.resolution).toMatchObject({ kind: 'fixed', summary: 'Number() eklendi' });
  });

  it('get_incident yapılandırılmış özeti kompakt kalır (NFR-TOK-01) ve raporun kopyası değildir', async () => {
    const { ctx, store } = okContext();
    const d = draft(undefined, { domSnapshot: `<main>${'x'.repeat(200_000)}</main>` });
    d.target!.html = `<div>${'h'.repeat(50_000)}</div>`;
    d.note.expected = 'E'.repeat(5000);
    const inc = store.create(d, 'p');
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    const r = await call('get_incident', { id: inc.id });
    const json = JSON.stringify(r.sc);
    expect(estimateTokens(json)).toBeLessThan(400);
    expect(json).not.toContain('hhhh');
    expect(json).not.toContain('const total'); // kaynak parçası yok
    expect(r.sc!.expected.length).toBeLessThanOrEqual(500);
    expect(r.sc!.counts.domSnapshotBytes).toBeGreaterThan(200_000);
  });

  it('hata yanıtları (isError) structuredContent olmadan döner; SDK istemcisi reddetmez', async () => {
    const { ctx, store } = okContext();
    const page = store.create(pageLevelDraft(), 'p');
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    for (const [name, args, code] of [
      ['get_incident', { id: '../../x' }, 'invalid_id'],
      ['get_incident_events', { id: 'fb-20200101-000000-zzzz' }, 'incident_not_found'],
      ['get_repro_script', { id: page.id, assertions: "require('fs').writeFileSync('/tmp/x','x')" }, 'assertion_rejected'],
      ['get_repro_script', { id: page.id, assertions: "await expect(page.getByRole('alert')).toBeVisible()", portable: true, base_url: 'https://example.com' }, 'base_url_rejected'],
      ['mark_fixed', { id: page.id, resolution: 'fixed', summary: 's' }, 'reason_required'],
      ['list_incidents', { cursor: 'bozuk!!' }, 'invalid_cursor'],
    ] as const) {
      const r = await call(name, args);
      expect(r.isError, name).toBe(true);
      expect(r.sc, name).toBeUndefined();
      expect(r.text).toMatch(new RegExp(`^Hata \\(${code}\\): .+\\nÖneri: `));
    }
  });

  it('wrong_project modunda hata yanıtı outputSchema ile çakışmaz', async () => {
    const { call, close } = await connect({ mode: 'wrong_project', message: 'Port 4747 başka bir projede.' });
    cleanup.push(close);
    const r = await call('list_incidents', {});
    expect(r).toMatchObject({ isError: true, sc: undefined });
    expect(r.text).toMatch(/^Hata \(wrong_project\)/);
  });

  it('run_repro error sonucu (server_down): isError + şemaya uyan koşu kaydı', async () => {
    const { ctx, store } = okContext();
    const inc = store.create(draft('http://127.0.0.1:9'), 'p');
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    const r = await call('run_repro', { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^Hata \(dev_server_down\): /);
    expect(r.text).toContain('Sonuç: error (server_down)');
    expect(r.sc).toMatchObject({
      status: 'error',
      errorKind: 'server_down',
      repeat: 1,
      mixed: false,
      previousRuns: [],
      screenshotPath: null,
      assertion: 'await expect(target).toHaveText("1380 ₺");',
    });
    expect(r.sc!.sideEffects).toEqual(['POST /api/coupon → 200']);
    const again = await call('run_repro', { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')" });
    expect(again.sc!.previousRuns).toHaveLength(1);
    expect(again.sc!.previousRuns[0]).toMatchObject({ status: 'error', errorKind: 'server_down', signature: r.sc!.signature });
  });

  it('gizli değerler (FLASHBACK_PASSWORD) structuredContent\'e ve metne girmez', async () => {
    const PW = 'Sup3r-Secret-Pw!';
    const { ctx, store } = okContext({ password: PW });
    const d = draft(undefined, { note: { expected: `Parola ${PW} ile giriş yapılabilmeli.` } });
    d.context.url = `http://localhost:5173/?pw=${encodeURIComponent(PW)}`;
    d.steps.push({ t: 4000, type: 'input', selector: '#note', fallbackSelectors: [], value: PW });
    const inc = store.create(d, 'p');
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    for (const [name, args] of [
      ['list_incidents', {}],
      ['get_incident', { id: inc.id }],
      ['get_incident_events', { id: inc.id, types: ['step'] }],
      ['get_repro_script', { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')" }],
      ['get_repro_script', { id: inc.id, assertions: "await expect(target).toHaveText('1380 ₺')", portable: true }],
    ] as const) {
      const r = await call(name, args);
      expect(r.isError, `${name}: ${r.text}`).toBe(false);
      const all = JSON.stringify(r.sc) + r.text;
      expect(all, name).not.toContain(PW);
      expect(all, name).not.toContain(encodeURIComponent(PW));
    }
    const ev = await call('get_incident_events', { id: inc.id, types: ['step'] });
    expect(JSON.stringify(ev.sc)).toContain('[REDACTED:password]');
  });
});

describe('FR-MCP-13: list_incidents cursor sayfalaması', () => {
  function seeded(n: number, opts: { sameTime?: boolean } = {}) {
    let clock = Date.UTC(2026, 9, 27, 10, 0, 0);
    const c = okContext({}, () => new Date(opts.sameTime ? clock : (clock += 1000)));
    const ids = Array.from({ length: n }, () => c.store.create(draft(), 'p').id);
    return { ...c, ids, tick: () => (clock += 1000) };
  }

  async function collect(call: (n: string, a: Record<string, unknown>) => Promise<{ sc?: Record<string, any>; text: string; isError: boolean }>, args: Record<string, unknown>) {
    const pages: string[][] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await call('list_incidents', { ...args, ...(cursor ? { cursor } : {}) });
      expect(r.isError, r.text).toBe(false);
      pages.push(r.sc!.incidents.map((x: { id: string }) => x.id));
      cursor = r.sc!.nextCursor ?? undefined;
      if (cursor) expect(r.text).toContain(`cursor: "${cursor}"`);
      else expect(r.text).not.toContain('Sonraki sayfa');
      if (!cursor) break;
    }
    return pages;
  }

  it('varsayılan limit 20; nextCursor ile tüm olaylar tekrar ve boşluk olmadan, yeniden eskiye gelir', async () => {
    const { ctx, ids } = seeded(23);
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    const first = await call('list_incidents', {});
    expect(first.sc!.incidents).toHaveLength(20);
    expect(first.sc!.nextCursor).toEqual(expect.any(String));
    const pages = await collect(call, { limit: 5 });
    expect(pages.map((p) => p.length)).toEqual([5, 5, 5, 5, 3]);
    expect(pages.flat()).toEqual([...ids].reverse());
  });

  it('aynı createdAt: kimliğe göre kararlı sıra (tie-break)', async () => {
    const { ctx, store } = seeded(7, { sameTime: true });
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    const expected = store.list().sort(compareNewestFirst).map((i) => i.id);
    expect(new Set(store.list().map((i) => i.createdAt)).size).toBe(1);
    expect([...expected].sort().reverse()).toEqual(expected);
    const pages = await collect(call, { limit: 3 });
    expect(pages.flat()).toEqual(expected);
  });

  it('sayfalar arasında yeni olay gelse de sonraki sayfa kaymaz', async () => {
    const { ctx, store, ids, tick } = seeded(6);
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    const p1 = await call('list_incidents', { limit: 3 });
    tick();
    const fresh = store.create(draft(), 'p');
    const p2 = await call('list_incidents', { limit: 3, cursor: p1.sc!.nextCursor });
    expect([...p1.sc!.incidents, ...p2.sc!.incidents].map((x: { id: string }) => x.id)).toEqual([...ids].reverse());
    expect(p2.sc!.nextCursor).toBeNull();
    expect((await call('list_incidents', { limit: 1 })).sc!.incidents[0].id).toBe(fresh.id);
  });

  it('status filtresi imlece bağlıdır; bozuk ya da başka filtreye ait imleç invalid_cursor döner', async () => {
    const { ctx, store, ids } = seeded(4);
    store.update(ids[0], (i) => {
      i.status = 'fixed';
    });
    const { call, close } = await connect(ctx);
    cleanup.push(close);
    const open = await call('list_incidents', { status: 'open', limit: 1 });
    const cur = open.sc!.nextCursor as string;
    expect(cur).toMatch(/^[A-Za-z0-9_-]+$/);
    const mismatch = await call('list_incidents', { status: 'all', cursor: cur });
    expect(mismatch.isError).toBe(true);
    expect(mismatch.text).toMatch(/^Hata \(invalid_cursor\): Geçersiz cursor: imleç status "open" listesine ait/);
    expect(mismatch.text).toContain('Öneri: cursor değerini yalnızca önceki list_incidents yanıtındaki nextCursor');
    const tampered = Buffer.from(JSON.stringify({ v: 1, s: 'open', c: '2026', i: '../../etc/passwd' })).toString('base64url');
    for (const bad of [tampered, 'eyJ2IjoyfQ', '%%%', Buffer.from('not json').toString('base64url')]) {
      const r = await call('list_incidents', { status: 'open', cursor: bad });
      expect(r.isError, bad).toBe(true);
      expect(r.text).toMatch(/^Hata \(invalid_cursor\)/);
    }
    const closed = await call('list_incidents', { status: 'closed' });
    expect(closed.sc).toMatchObject({ nextCursor: null });
    expect(closed.sc!.incidents.map((x: { id: string }) => x.id)).toEqual([ids[0]]);
    // Son sayfadan sonra boş sayfa: hata değil.
    const lastKey = store.require(ids[1]);
    const empty = await call('list_incidents', { status: 'open', cursor: encodeCursor('open', lastKey) });
    expect(empty).toMatchObject({ isError: false, text: 'Olay yok (status: open).' });
    expect(empty.sc).toEqual({ status: 'open', incidents: [], nextCursor: null });
  });

  it('encodeCursor / decodeCursor gidiş-dönüş', () => {
    const key = { createdAt: '2026-10-27T10:00:00.000Z', id: 'fb-20261027-100000-abcd' };
    expect(decodeCursor(encodeCursor('all', key), 'all')).toEqual(key);
    expect(() => decodeCursor(encodeCursor('all', key), 'open')).toThrow(/imleç status/);
  });
});
