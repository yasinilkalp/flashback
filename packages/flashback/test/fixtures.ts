import type { eventWithTime } from 'rrweb';
import type { DraftEnv, DraftInput } from '../src/draft/build.js';
import type { FrozenSnapshot } from '../src/recorder/recorder.js';

export const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);

// Sahte sırlar parçalardan birleştirilir; kaynakta tam biçimli sır olmadığı için
// GitHub secret scanning bu test verisini gerçek sır sanmaz.
const fake = (...parts: string[]): string => parts.join('');

export const SECRETS = {
  password: 'Hunter2-Sup3rS3cret!',
  email: 'ayse.yilmaz@example.com',
  token: fake('eyJhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'),
  card: '4111 1111 1111 1111',
  apiKey: fake('sk-', 'proj-', 'abcdefghijklmnopqrstuvwx'),
};

/** Flashback arayüz kökünün sahte rrweb kimliği. */
export const HOST_ID = 99;

export function rrwebEvents(text = 'Toplam 135030 ₺'): eventWithTime[] {
  return [
    { type: 4, data: { href: 'http://localhost:5173/', width: 1280, height: 800 }, timestamp: T0 },
    {
      type: 2,
      timestamp: T0 + 1,
      data: {
        initialOffset: { left: 0, top: 0 },
        node: {
          type: 0,
          id: 1,
          childNodes: [
            {
              type: 2,
              id: 2,
              tagName: 'html',
              attributes: {},
              childNodes: [
                {
                  type: 2,
                  id: 3,
                  tagName: 'body',
                  attributes: {},
                  childNodes: [
                    { type: 2, id: 4, tagName: 'p', attributes: { 'data-contact': SECRETS.email }, childNodes: [{ type: 3, id: 5, textContent: text }] },
                    { type: 2, id: HOST_ID, tagName: 'flashback-devtools', attributes: { rr_width: '0px', rr_height: '0px' }, childNodes: [] },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { type: 3, timestamp: T0 + 500, data: { source: 5, id: 4, text: `[REDACTED:email]`, isChecked: false } },
    { type: 3, timestamp: T0 + 900, data: { source: 0, adds: [], removes: [], attributes: [], texts: [{ id: 5, value: `Bearer ${SECRETS.token}` }] } },
    // StrictMode yeniden montajı: yeni arayüz kökü eklenir, eskisi çıkarılır.
    {
      type: 3,
      timestamp: T0 + 950,
      data: { source: 0, adds: [{ parentId: 3, nextId: null, node: { type: 2, id: HOST_ID + 1, tagName: 'flashback-devtools', attributes: {}, childNodes: [] } }], removes: [{ parentId: 3, id: HOST_ID }], attributes: [{ id: HOST_ID + 1, attributes: { style: 'x' } }], texts: [] },
    },
  ] as unknown as eventWithTime[];
}

export function snapshot(over: Partial<FrozenSnapshot> = {}): FrozenSnapshot {
  return {
    events: rrwebEvents(),
    network: [],
    console: [],
    steps: [],
    store: [],
    windowStart: T0,
    evicted: false,
    memoryWarning: false,
    frozenAt: T0 + 10_000,
    ...over,
  };
}

export const ENV: DraftEnv = {
  origin: 'http://localhost:5173',
  userAgent: 'test-agent',
  tabId: 'tab-test',
  locale: 'tr-TR',
  timezone: 'Europe/Istanbul',
  storageKeys: [],
  cookieNames: [],
  viewport: { width: 1280, height: 800 },
};

export function draftInput(over: Partial<DraftInput> = {}): DraftInput {
  return {
    snapshot: snapshot(),
    markedAt: T0 + 5000,
    note: { expected: 'Toplam 1380 ₺ olmalı.' },
    target: null,
    env: ENV,
    redact: { enabled: true },
    ...over,
  };
}
