import type { IncidentSummary } from '@rewind/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { unreadCount } from '../src/controller.js';
import { strings } from '../src/ui/i18n.js';
import { IncidentCard, statusBadge } from '../src/ui/Incidents.js';

const t = strings('tr');
const noop = async () => {};

function incident(over: Partial<IncidentSummary> = {}): IncidentSummary {
  return {
    id: 'rw-20261027-120000-abcd',
    status: 'fixed',
    createdAt: '2026-10-27T12:00:00.000Z',
    url: 'http://localhost:5173/',
    note: { expected: 'Toplam 1380 ₺ olmalı.' },
    pendingQuestion: false,
    assertionText: "await expect(target).toHaveText('1380 ₺');",
    runs: [
      { t: '2026-10-27T12:01:00.000Z', status: 'failed_assertion', signature: 's', durationMs: 7000 },
      { t: '2026-10-27T12:03:00.000Z', status: 'passed', signature: 's', durationMs: 2500 },
      { t: '2026-10-27T12:03:10.000Z', status: 'passed', signature: 's', durationMs: 2400 },
    ],
    messages: [],
    ...over,
  };
}

const render = (inc: IncidentSummary) => renderToStaticMarkup(<IncidentCard inc={inc} t={t} onReply={noop} onReopen={noop} onChanged={() => {}} />);

describe('Kayıtlar (FR-UI-15/16/18)', () => {
  it('a fixed incident shows the note and the assertion side by side, with ❌ → ✅ ✅ runs', () => {
    const html = render(incident());
    expect(html).toContain('Doğrulandı');
    expect(html).toContain('Toplam 1380 ₺ olmalı.');
    expect(html).toContain('toHaveText(&#x27;1380 ₺&#x27;)');
    expect(html.indexOf('data-rw="note"')).toBeLessThan(html.indexOf('data-rw="assertion"'));
    expect(html).toMatch(/❌[\s\S]*✅[\s\S]*✅/);
    expect(html).toContain('Bu test beklentimi kanıtlamıyor');
  });

  it('never shows the verified badge without the assertion text; fixed_unverified is distinct', () => {
    expect(statusBadge(incident({ assertionText: undefined }), t)).toEqual({ label: t.statusFixedNoAssertion, cls: 'fixed_unverified' });
    expect(render(incident({ assertionText: undefined }))).not.toContain(`>${t.statusFixed}<`);
    expect(statusBadge(incident({ status: 'fixed_unverified' }), t).label).toBe('Doğrulanmadan kapatıldı');
    expect(statusBadge(incident({ status: 'open' }), t).label).toBe('Açık');
    expect(render(incident({ status: 'open' }))).not.toContain('Bu test beklentimi kanıtlamıyor');
  });

  it('renders agent messages as plain text (no HTML interpretation)', () => {
    const html = render(
      incident({
        pendingQuestion: true,
        messages: [{ from: 'agent', text: '<img src=x onerror="alert(1)"> Kuponu nereye yazdınız?', t: '2026-10-27T12:02:00.000Z' }],
      }),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; Kuponu nereye yazdınız?');
    expect(html).toContain('Ajan yanıt bekliyor');
    expect(html).toContain('data-rw="reply"');
  });

  it('counts unread agent messages since the last seen timestamp', () => {
    const inc = incident({
      messages: [
        { from: 'agent', text: 'a', t: '2026-10-27T12:02:00.000Z' },
        { from: 'dev', text: 'b', t: '2026-10-27T12:02:30.000Z' },
        { from: 'agent', text: 'c', t: '2026-10-27T12:04:00.000Z' },
      ],
    });
    expect(unreadCount([inc], {})).toBe(2);
    expect(unreadCount([inc], { [inc.id]: '2026-10-27T12:02:00.000Z' })).toBe(1);
  });
});
