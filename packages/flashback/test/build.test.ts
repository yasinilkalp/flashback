// @vitest-environment happy-dom
import { IncidentDraftSchema, LIMITS } from '@flashback/shared';
import { describe, expect, it } from 'vitest';
import { buildDraft, type TargetCapture } from '../src/draft/build.js';
import type { NetworkRecord } from '../src/recorder/network.js';
import { draftInput, ENV, HOST_ID, SECRETS, snapshot, T0 } from './fixtures.js';

function net(over: Partial<NetworkRecord> & Pick<NetworkRecord, 'seq' | 'time'>): NetworkRecord {
  return { method: 'GET', url: 'http://localhost:5173/api/x', status: 200, durationMs: 5, reqHeaders: {}, resHeaders: {}, truncated: false, ...over };
}

function target(over: Partial<TargetCapture> = {}): TargetCapture {
  const el = document.createElement('dd');
  el.setAttribute('data-testid', 'total');
  el.textContent = '135030 ₺';
  return {
    selector: '[data-testid="total"]',
    fallbackSelectors: ['dl > dd:nth-of-type(3)'],
    resolution: 'exact',
    location: { file: 'src/Cart.tsx', line: 81, column: 9, resolved: true, snippet: { startLine: 78, lines: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], fileHash: 'sha256:x' } },
    componentStack: ['Cart', 'App'],
    props: {},
    state: [0, ''],
    computedStyle: { display: 'block' },
    element: el,
    ...over,
  };
}

describe('buildDraft', () => {
  it('produces a schema-valid draft with relative times and start context', () => {
    const draft = buildDraft(
      draftInput({
        target: target(),
        snapshot: snapshot({
          network: [net({ seq: 1, time: T0 - 200, url: 'http://localhost:5173/api/shipping', resBody: '{"fee":"30"}', contentType: 'application/json' })],
          steps: [{ time: T0 + 1000, type: 'navigate', url: 'http://localhost:5173/cart', fallbackSelectors: [], pageUrl: 'http://localhost:5173/' }],
        }),
      }),
    );
    expect(IncidentDraftSchema.safeParse(draft).success).toBe(true);
    // Erken yakalanan istek pencere başından önce: taban ona çekilir, t negatif olmaz.
    expect(draft.recordingStartedAt).toBe(new Date(T0 - 200).toISOString());
    expect(draft.network![0].t).toBe(0);
    expect(draft.markedAtMs).toBe(5200);
    expect(draft.context.startUrl).toBe('http://localhost:5173/');
    expect(draft.context.url).toBe('http://localhost:5173/cart');
    expect(draft.context.viewport).toEqual({ width: 1280, height: 800 });
    expect(draft.primaryEvidence).toEqual({ kind: 'target' });
    expect(draft.target).toMatchObject({ file: 'src/Cart.tsx', line: 81, resolved: true, resolution: 'exact', componentStack: ['Cart', 'App'] });
    expect(draft.target!.html).toContain('data-testid="total"');
  });

  it('removes the Flashback UI node from rrweb events and the DOM snapshot', () => {
    const root = document.createElement('html');
    root.innerHTML = '<body><p>app</p><flashback-devtools data-flashback-ui></flashback-devtools></body>';
    const draft = buildDraft(draftInput({ domRoot: root }));
    const json = JSON.stringify(draft.events);
    expect(json).not.toContain(`"id":${HOST_ID}`);
    expect(json).not.toContain(`"id":${HOST_ID + 1}`);
    expect(json).not.toContain('flashback-devtools');
    expect(draft.domSnapshot).toContain('<p>app</p>');
    expect(draft.domSnapshot).not.toContain('flashback-devtools');
  });

  it('redacts seeded secrets everywhere in the payload (FR-RED-01/09)', () => {
    const root = document.createElement('html');
    root.innerHTML = `<body><p data-token="${SECRETS.apiKey}">Kart: ${SECRETS.card}</p><!-- ${SECRETS.email} --></body>`;
    const el = document.createElement('div');
    el.setAttribute('data-email', SECRETS.email);
    el.textContent = `Merhaba ${SECRETS.email}`;
    const draft = buildDraft(
      draftInput({
        domRoot: root,
        note: { what: `${SECRETS.email} ile girdim`, expected: 'Toplam 1380 ₺ olmalı.' },
        target: target({ element: el, props: { password: SECRETS.password, user: { email: SECRETS.email } }, state: [{ accessToken: SECRETS.token }] }),
        snapshot: snapshot({
          network: [
            net({
              seq: 1,
              time: T0 + 100,
              method: 'POST',
              url: `http://localhost:5173/api/login?token=${SECRETS.token}`,
              reqHeaders: { authorization: `Bearer ${SECRETS.token}`, 'content-type': 'application/json', 'x-api-key': SECRETS.apiKey },
              resHeaders: { 'set-cookie': 'sid=abc' },
              reqBody: JSON.stringify({ email: SECRETS.email, password: SECRETS.password }),
              resBody: JSON.stringify({ card: SECRETS.card, note: `kart ${SECRETS.card}` }),
              contentType: 'application/json',
            }),
          ],
          console: [{ seq: 1, time: T0 + 200, level: 'error', message: `login failed for ${SECRETS.email} key ${SECRETS.apiKey}`, stack: `Error: ${SECRETS.token}` }],
          steps: [
            { time: T0 + 50, type: 'input', selector: '#email', fallbackSelectors: [], value: '[REDACTED:email]', valueRedactedAs: 'email', pageUrl: 'http://localhost:5173/login' },
            { time: T0 + 60, type: 'click', selector: `[aria-label="${SECRETS.email}"]`, fallbackSelectors: [], pageUrl: 'http://localhost:5173/login' },
          ],
          store: [{ time: T0 + 300, name: 'auth', path: 'session', before: null, after: { token: SECRETS.token, email: SECRETS.email } }],
        }),
      }),
    );
    const json = JSON.stringify(draft);
    for (const [kind, secret] of Object.entries(SECRETS)) expect(json, kind).not.toContain(secret);
    expect(json).not.toContain('4111111111111111');
    expect(json).not.toContain('sid=abc');
    expect(draft.redaction.enabled).toBe(true);
    // Kayıt anında gizlenen adım da sayaca girer.
    expect(draft.redaction.byType!.email).toBeGreaterThanOrEqual(5);
    expect(draft.redaction.byType!.password).toBeGreaterThanOrEqual(2);
    expect(draft.redaction.count).toBe(Object.values(draft.redaction.byType!).reduce((a, b) => a + b, 0));
    expect(IncidentDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('redacts store changes whose path contains a sensitive key (security #3)', () => {
    const draft = buildDraft(
      draftInput({
        snapshot: snapshot({
          store: [
            { time: T0 + 1, name: 'auth', path: 'auth.token', before: null, after: 'tok-RAW-1' },
            { time: T0 + 2, name: 'auth', path: 'user.password', before: 'pw-RAW-2', after: 'pw-RAW-3' },
            { time: T0 + 3, name: 'cfg', path: 'apiKey', before: '', after: { nested: 'key-RAW-4' } },
            { time: T0 + 4, name: 'cart', path: 'items[0].sessionId', before: 's-RAW-5', after: 's-RAW-6' },
            { time: T0 + 5, name: 'cart', path: 'discount', before: 0, after: 0.1 },
          ],
        }),
      }),
    );
    const json = JSON.stringify(draft);
    expect(json).not.toMatch(/RAW-\d/);
    expect(draft.store!.map((c) => [c.path, c.before, c.after])).toEqual([
      ['auth.token', null, '[REDACTED:token]'],
      ['user.password', '[REDACTED:password]', '[REDACTED:password]'],
      ['apiKey', '', '[REDACTED:secret]'],
      ['items[0].sessionId', '[REDACTED:session]', '[REDACTED:session]'],
      ['discount', 0, 0.1],
    ]);
    expect(draft.redaction.byType).toMatchObject({ token: 1, password: 2, secret: 1, session: 2 });
  });

  it('redacts URLs and sibling-keyed attributes in rrweb events, the DOM snapshot and target.html (security #6)', () => {
    const secretHtml = `
      <head><meta name="csrf-token" content="csrf-RAW-1"><meta property="og:url" content="http://x/?token=tok-RAW-2"></head>
      <body><form action="/pay?access_token=tok-RAW-3"><input type="hidden" name="authenticity_token" value="auth-RAW-4"></form>
      <a href="http://localhost:5173/reset?token=tok-RAW-5#access_token=tok-RAW-6">x</a><img src="/i.png?api_key=key-RAW-7"></body>`;
    const root = document.createElement('html');
    root.innerHTML = secretHtml;
    const form = root.querySelector('form')!;
    const events = [
      { type: 4, data: { href: 'http://localhost:5173/cb?token=tok-RAW-8#access_token=tok-RAW-9', width: 1, height: 1 }, timestamp: T0 },
      {
        type: 2,
        timestamp: T0 + 1,
        data: {
          initialOffset: { left: 0, top: 0 },
          node: {
            type: 0,
            id: 1,
            childNodes: [
              { type: 2, id: 2, tagName: 'meta', attributes: { name: 'csrf-token', content: 'csrf-RAW-10' }, childNodes: [] },
              { type: 2, id: 3, tagName: 'input', attributes: { type: 'hidden', name: 'authenticity_token', value: 'auth-RAW-11' }, childNodes: [] },
              { type: 2, id: 4, tagName: 'a', attributes: { href: '/r?token=tok-RAW-12' }, childNodes: [] },
            ],
          },
        },
      },
      {
        type: 3,
        timestamp: T0 + 2,
        data: {
          source: 0,
          texts: [],
          removes: [],
          attributes: [{ id: 4, attributes: { href: '/r#access_token=tok-RAW-13', style: { color: 'red' } } }],
          adds: [{ parentId: 1, nextId: null, node: { type: 2, id: 5, tagName: 'meta', attributes: { name: 'csrf-token', content: 'csrf-RAW-14' }, childNodes: [] } }],
        },
      },
    ];
    const draft = buildDraft(
      draftInput({
        domRoot: root,
        target: target({ element: form }),
        snapshot: snapshot({ events: events as never }),
      }),
    );
    const json = JSON.stringify(draft);
    expect(json).not.toMatch(/RAW-\d+/);
    expect(draft.domSnapshot).toContain('content="[REDACTED:token]"');
    expect(draft.domSnapshot).toContain('name="csrf-token"'); // anahtarın kendisi korunur
    expect(draft.target!.html).toContain('value="[REDACTED:token]"');
    expect((draft.events![0] as { data: { href: string } }).data.href).toBe('http://localhost:5173/cb?token=[REDACTED:token]#access_token=[REDACTED:token]');
    expect(IncidentDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('keeps data as recorded when redaction is disabled, except record-time password masking', () => {
    const draft = buildDraft(
      draftInput({
        redact: { enabled: false },
        snapshot: snapshot({ console: [{ seq: 1, time: T0, level: 'warn', message: SECRETS.email }] }),
      }),
    );
    expect(draft.console![0].message).toBe(SECRETS.email);
    expect(draft.redaction.enabled).toBe(false);
    expect(draft.confidence!.find((c) => c.key === 'redaction')).toMatchObject({ level: 'warn' });
    expect(draft.confidence!.find((c) => c.key === 'redaction')!.message).toContain('Gizleme: KAPALI');
  });

  describe('primaryEvidence (FR-MARK-08/09)', () => {
    const errors = snapshot({
      network: [
        net({ seq: 1, time: T0 + 1000, method: 'GET', url: 'http://localhost:5173/api/products' }),
        net({ seq: 2, time: T0 + 3000, method: 'POST', url: 'http://localhost:5173/api/coupon', status: 500 }),
      ],
      console: [
        { seq: 1, time: T0 + 3010, level: 'error', message: 'Kupon isteği başarısız' },
        { seq: 2, time: T0 + 7900, level: 'warn', message: 'uyarı' },
      ],
    });

    it('page-level: picks the network error behind the nearest console error', () => {
      const draft = buildDraft(draftInput({ snapshot: errors, markedAt: T0 + 3500 }));
      expect(draft.primaryEvidence).toEqual({ kind: 'network', ref: 1 });
      expect(draft.confidence!.find((c) => c.key === 'element')!.message).toContain('POST /api/coupon → 500');
    });

    it('page-level: a console error with no preceding network error wins when nearest', () => {
      const s = snapshot({ ...errors, console: [{ seq: 5, time: T0 + 9000, level: 'uncaught', message: 'TypeError' }] });
      const draft = buildDraft(draftInput({ snapshot: s, markedAt: T0 + 9100 }));
      expect(draft.primaryEvidence).toEqual({ kind: 'console', ref: 0 });
    });

    it('target present → target, unless the developer picked a marker', () => {
      expect(buildDraft(draftInput({ snapshot: errors, target: target() })).primaryEvidence).toEqual({ kind: 'target' });
      expect(buildDraft(draftInput({ snapshot: errors, target: target(), primaryOverride: { kind: 'console', seq: 2 } })).primaryEvidence).toEqual({ kind: 'console', ref: 1 });
    });

    it('excluded network section falls back to automatic ranking', () => {
      const draft = buildDraft(draftInput({ snapshot: errors, markedAt: T0 + 3500, exclude: { network: true }, primaryOverride: { kind: 'network', seq: 2 } }));
      expect(draft.network).toEqual([]);
      expect(draft.primaryEvidence).toEqual({ kind: 'console', ref: 0 });
      expect(draft.confidence!.find((c) => c.key === 'truncated')!.message).toContain('ağ girdileri (geliştirici hariç tuttu)');
    });
  });

  describe('confidence (FR-PKG-08)', () => {
    const keys = ['source', 'element', 'propsState', 'preWindow', 'truncated', 'redaction', 'synthetic'];

    it('has the fixed keys, ≤ 8 items, always warns about live props/state', () => {
      const c = buildDraft(draftInput({ target: target() })).confidence!;
      expect(c.map((i) => i.key)).toEqual(keys);
      expect(c.length).toBeLessThanOrEqual(8);
      expect(c.find((i) => i.key === 'propsState')).toMatchObject({ level: 'warn', message: 'props/state: canlı (geçmiş değil)' });
      expect(c.find((i) => i.key === 'source')!.level).toBe('ok');
      expect(c.filter((i) => i.level === 'warn').every((i) => !!i.hint)).toBe(true);
    });

    it('warns on unresolved source, ancestor mapping, missing snippet, session state, synthetic input', () => {
      const unresolved = buildDraft(
        draftInput({ target: target({ location: { file: 'http://localhost:5173/src/Cart.tsx', line: 108, column: 21, resolved: false, reason: 'source map bulunamadı' } }) }),
      );
      expect(unresolved.target).toMatchObject({ resolved: false, line: 108 });
      expect(unresolved.target!.resolutionReason).toContain('source map bulunamadı');
      expect(unresolved.confidence!.find((c) => c.key === 'source')!.level).toBe('warn');

      const noSnippet = buildDraft(draftInput({ target: target({ location: { file: 'src/Cart.tsx', line: 81, column: 9, resolved: true } }) }));
      expect(noSnippet.confidence!.find((c) => c.key === 'source')!.message).toContain('kod parçası yok');

      const ancestor = buildDraft(draftInput({ target: target({ resolution: 'ancestor', resolutionReason: 'unmount' }) }));
      expect(ancestor.target!.resolution).toBe('ancestor');
      expect(ancestor.confidence!.find((c) => c.key === 'element')!.level).toBe('warn');

      const session = buildDraft(
        draftInput({
          env: { ...ENV, cookieNames: ['theme', 'sid'] },
          snapshot: snapshot({ steps: [{ time: T0 + 10, type: 'input', selector: '#p', fallbackSelectors: [], value: '[REDACTED:password]', valueRedactedAs: 'password', pageUrl: 'http://localhost:5173/' }] }),
        }),
      );
      expect(session.confidence!.find((c) => c.key === 'preWindow')!.message).toContain('sid');
      expect(session.confidence!.find((c) => c.key === 'synthetic')).toMatchObject({ level: 'warn' });

      const late = buildDraft(draftInput({ snapshot: snapshot({ lateStart: true }) }));
      expect(late.confidence!.find((c) => c.key === 'preWindow')!.level).toBe('warn');
    });
  });

  it('truncates bodies flags and stays under LIMITS.incidentBytes by dropping the oldest rrweb slices (NFR-SIZE-01)', () => {
    const big = 'x'.repeat(1024 * 1024);
    const events = [];
    for (let slice = 0; slice < 3; slice++) {
      const ts = T0 + slice * 30_000;
      events.push({ type: 4, data: { href: 'http://localhost:5173/', width: 1, height: 1 }, timestamp: ts });
      events.push({ type: 2, data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { left: 0, top: 0 } }, timestamp: ts + 1 });
      for (let i = 0; i < 2; i++) events.push({ type: 5, data: { tag: 'pad', payload: big }, timestamp: ts + 2 + i });
    }
    const draft = buildDraft(draftInput({ snapshot: snapshot({ events: events as never }) }));
    const size = new TextEncoder().encode(JSON.stringify(draft)).length;
    expect(size).toBeLessThanOrEqual(LIMITS.incidentBytes);
    expect((draft.events as Array<{ type: number }>)[0].type).toBe(4);
    expect(draft.events!.length).toBeLessThan(events.length);
    expect(draft.confidence!.find((c) => c.key === 'truncated')).toMatchObject({ level: 'warn' });
  });

  it('gizleme işaretleri olayları büyütse de yük 5 MB altında kalır (NFR-SIZE-01)', () => {
    // "a@b.co" (6 B) → "[REDACTED:email]" (16 B): gizleme öncesi sığan olaylar gizlemeden sonra taşar.
    const emails = Array.from({ length: 40_000 }, (_, i) => `u${i % 10}@b.co`).join(' ');
    const events = [];
    for (let slice = 0; slice < 3; slice++) {
      const ts = T0 + slice * 30_000;
      events.push({ type: 4, data: { href: 'http://localhost:5173/', width: 1, height: 1 }, timestamp: ts });
      events.push({ type: 2, data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { left: 0, top: 0 } }, timestamp: ts + 1 });
      for (let i = 0; i < 4; i++) events.push({ type: 5, data: { tag: 'log', payload: emails }, timestamp: ts + 2 + i });
    }
    const draft = buildDraft(draftInput({ snapshot: snapshot({ events: events as never }) }));
    const json = JSON.stringify(draft);
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(LIMITS.incidentBytes);
    expect(json).toContain('[REDACTED:email]');
    expect((draft.events as Array<{ type: number }>)[0].type).toBe(4);
  });
});

describe('byteLength (UTF-8, TextEncoder ile aynı sonuç)', () => {
  it('ASCII, Türkçe, emoji ve tek başına vekil karakter', async () => {
    const { byteLength } = await import('../src/draft/build.js');
    for (const s of ['', 'abc', 'Sipariş sayısı: 4 ₺', '😀 ok', 'x\uD800y', 'a'.repeat(10_000)]) {
      expect(byteLength(s), s.slice(0, 20)).toBe(new TextEncoder().encode(s).length);
    }
  });
});

describe('trimToHistory (NFR-LAT-01)', () => {
  const ev = (type: number, timestamp: number) => ({ type, timestamp, data: {} }) as never;
  const events = [ev(4, 0), ev(2, 0), ev(3, 10_000), ev(4, 30_000), ev(2, 30_000), ev(3, 45_000), ev(4, 60_000), ev(2, 60_000), ev(3, 80_000)];

  it('işaretlenen anı ve en az historyMs geçmişi kapsayan en geç Meta\'dan başlar', async () => {
    const { trimToHistory } = await import('../src/draft/build.js');
    // frozenAt 90 sn, geçmiş 60 sn → kesim 30 sn → 30 sn'deki Meta'dan başlar.
    expect(trimToHistory(events, 85_000, 90_000, 60_000)[0]).toMatchObject({ type: 4, timestamp: 30_000 });
    // İşaretlenen an daha eskiyse onu kapsayan Meta'dan başlar.
    expect(trimToHistory(events, 20_000, 90_000, 60_000)[0]).toMatchObject({ type: 4, timestamp: 0 });
    // Geçmiş verilmemişse dokunmaz.
    expect(trimToHistory(events, 85_000, 90_000, undefined)).toBe(events);
  });
});
