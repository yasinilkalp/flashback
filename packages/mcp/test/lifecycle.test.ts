import { IncidentSchema, type Incident, type ReproRun } from '@rewind/shared';
import { describe, expect, it } from 'vitest';
import { RewindError, applyMarkFixed, applyReopen, countedRuns, evaluateVerification, toSummary } from '../src/index.js';
import { draft, fakeRun } from './helpers.js';

function incident(runs: ReproRun[]): Incident {
  return IncidentSchema.parse({
    ...draft(),
    id: 'rw-20261027-120000-abcd',
    projectId: 'p',
    status: 'open',
    createdAt: '2026-10-27T12:00:00.000Z',
    repros: runs,
  });
}

const now = new Date('2026-10-27T13:00:00.000Z');

describe('FR-LIFE-04: doğrulanmış kapanış koşulu', () => {
  it('(1) yalnızca yeşil koşu → fixed_unverified', () => {
    const inc = incident([fakeRun('passed', 'A'), fakeRun('passed', 'A')]);
    expect(() => applyMarkFixed(inc, { resolution: 'fixed', summary: 's' }, now)).toThrow(/reason|Doğrulama/);
    const r = applyMarkFixed(inc, { resolution: 'fixed', summary: 's', reason: 'test ortamı yok' }, now);
    expect(r.status).toBe('fixed_unverified');
    expect(r.verified).toBe(false);
    expect(r.missing).toMatch(/kırmızı/);
  });

  it('(2) kırmızı A, yeşil B (farklı imza) → fixed_unverified', () => {
    const inc = incident([fakeRun('failed_assertion', 'A'), fakeRun('passed', 'B'), fakeRun('passed', 'B')]);
    const r = applyMarkFixed(inc, { resolution: 'fixed', summary: 's', reason: 'r' }, now);
    expect(r.status).toBe('fixed_unverified');
    expect(r.missing).toMatch(/imzaları farklı/);
  });

  it('(3) kırmızı A, yeşil A, yeşil A → fixed', () => {
    const inc = incident([fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A'), fakeRun('passed', 'A')]);
    const r = applyMarkFixed(inc, { resolution: 'fixed', summary: 'Number() eklendi' }, now);
    expect(r).toMatchObject({ status: 'fixed', verified: true, missing: undefined });
    expect(r.note.expected).toBe('Toplam 1380 ₺ olmalı.');
    expect(r.assertion).toBe("await expect(target).toHaveText(\"A\");");
    expect(r.runs).toHaveLength(3);
    expect(inc.status).toBe('fixed');
    expect(inc.resolution).toMatchObject({ kind: 'fixed', summary: 'Number() eklendi' });
  });

  it('(4) kırmızı A, yeşil A, kırmızı A, yeşil A → fixed_unverified; eksik adım bildirilir (FR-LIFE-05)', () => {
    const inc = incident([fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A'), fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A')]);
    const v = evaluateVerification(countedRuns(inc));
    expect(v.verified).toBe(false);
    expect(v.missing).toBe('Aynı imzayla bir yeşil koşu daha gerekiyor.');
    const err = (() => {
      try {
        applyMarkFixed(inc, { resolution: 'fixed', summary: 's' }, now);
      } catch (e) {
        return e as RewindError;
      }
    })();
    expect(err?.code).toBe('reason_required');
    expect(applyMarkFixed(inc, { resolution: 'fixed', summary: 's', reason: 'kararsız' }, now).status).toBe('fixed_unverified');
  });

  it('error ve unsafe koşular hesaba katılmaz', () => {
    const runs = [
      fakeRun('failed_assertion', 'A'),
      fakeRun('error', 'A'),
      fakeRun('passed', 'A'),
      fakeRun('error', 'A'),
      fakeRun('failed_assertion', 'A', { unsafe: true }),
      fakeRun('passed', 'A'),
    ];
    expect(evaluateVerification(countedRuns(incident(runs))).verified).toBe(true);
    expect(evaluateVerification(countedRuns(incident([fakeRun('error', 'A'), fakeRun('passed', 'A'), fakeRun('passed', 'A')]))).verified).toBe(false);
  });

  it('doğrulayan yeşillerden sonra gelen kırmızı (başka imza) doğrulamayı bozar', () => {
    const runs = [fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A'), fakeRun('passed', 'A'), fakeRun('failed_assertion', 'B')];
    expect(evaluateVerification(runs).verified).toBe(false);
  });
});

describe('geçişler (FR-LIFE-01)', () => {
  it('cannot_reproduce en az bir geçerli koşu ister', () => {
    expect(() => applyMarkFixed(incident([fakeRun('error', 'A')]), { resolution: 'cannot_reproduce', summary: 's' }, now)).toThrow(/geçerli/);
    const inc = incident([fakeRun('passed', 'A')]);
    expect(applyMarkFixed(inc, { resolution: 'cannot_reproduce', summary: 'üretilemedi' }, now).status).toBe('cannot_reproduce');
  });

  it('kapalı olay tekrar kapatılamaz; yalnızca yeniden açılabilir', () => {
    const inc = incident([fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A'), fakeRun('passed', 'A')]);
    applyMarkFixed(inc, { resolution: 'fixed', summary: 's' }, now);
    expect(() => applyMarkFixed(inc, { resolution: 'fixed', summary: 's' }, now)).toThrow(/zaten kapalı/);
    applyReopen(inc, 'Test beklentimi kanıtlamıyor', new Date('2026-10-27T14:00:00.000Z'));
    expect(inc.status).toBe('open');
    expect(inc.repros).toHaveLength(3); // geçmiş korunur
    expect(inc.messages.at(-1)?.text).toMatch(/Test beklentimi kanıtlamıyor/);
    expect(() => applyReopen(inc, '', now)).toThrow(/zaten açık/);
  });

  it('yeniden açılan olayda doğrulama baştan aranır (FR-LIFE-06)', () => {
    const inc = incident([fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A'), fakeRun('passed', 'A')]);
    applyMarkFixed(inc, { resolution: 'fixed', summary: 's' }, now);
    applyReopen(inc, 'r', new Date('2030-01-01T00:00:00.000Z'));
    expect(countedRuns(inc)).toHaveLength(0);
    expect(() => applyMarkFixed(inc, { resolution: 'fixed', summary: 's' }, now)).toThrow(RewindError);
  });

  it('özet: assertion metni ve koşular (FR-UI-16)', () => {
    const inc = incident([fakeRun('failed_assertion', 'A'), fakeRun('passed', 'A')]);
    const s = toSummary(inc);
    expect(s.assertionText).toBe('await expect(target).toHaveText("A");');
    expect(s.runs.map((r) => r.status)).toEqual(['failed_assertion', 'passed']);
    expect(s.note.expected).toBe('Toplam 1380 ₺ olmalı.');
  });
});
