import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IncidentStore, QuotaError, RewindError } from '../src/index.js';
import { draft, tmpDir } from './helpers.js';

const quiet = { log: () => {} };

describe('IncidentStore', () => {
  it('klasörü .gitignore (*) ile oluşturur; POSIX izinleri 0700/0600 (FR-RCV-02, FR-RCV-SEC-06)', () => {
    const dir = path.join(tmpDir(), '.rewind');
    const store = new IncidentStore(dir, quiet);
    store.init();
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toMatch(/^\*$/m);
    const inc = store.create(draft(), 'p');
    if (process.platform !== 'win32') {
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(store.reproDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(dir, `${inc.id}.json`)).mode & 0o777).toBe(0o600);
    }
  });

  it('atomik yazar: geçici dosya kalmaz, içerik her an geçerli JSON', () => {
    const store = new IncidentStore(tmpDir(), quiet);
    store.init();
    const inc = store.create(draft(), 'p');
    for (let i = 0; i < 20; i++) store.update(inc.id, (x) => x.messages.push({ from: 'agent', text: `m${i}`, t: new Date().toISOString() }));
    expect(fs.readdirSync(store.dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(store.dir, `${inc.id}.json`), 'utf8')).messages).toHaveLength(20);
  });

  it('kimlik doğrulaması ve yol sınırı (FR-RCV-SEC-04)', () => {
    const store = new IncidentStore(tmpDir(), quiet);
    store.init();
    for (const bad of ['../../x', 'rw-20261027-000000-abc', 'rw-20261027-000000-ABCD', '', 'rw-20261027-000000-abcd/../x']) {
      expect(() => store.resolvePath(bad)).toThrow(RewindError);
    }
    expect(() => store.require('rw-20261027-000000-abcd')).toThrow(/bulunamadı/);
  });

  it('kota: yalnızca en eski KAPALI olaylar silinir, repro dosyalarıyla birlikte (FR-RCV-09)', () => {
    let clock = Date.UTC(2026, 0, 1);
    const store = new IncidentStore(tmpDir(), { ...quiet, maxIncidents: 3, now: () => new Date((clock += 1000)) });
    store.init();
    const a = store.create(draft(), 'p');
    const b = store.create(draft(), 'p');
    const c = store.create(draft(), 'p');
    store.update(b.id, (i) => (i.status = 'fixed'));
    store.update(c.id, (i) => (i.status = 'cannot_reproduce'));
    fs.writeFileSync(path.join(store.reproDir, `${b.id}.spec.ts`), '//');
    fs.writeFileSync(path.join(store.reproDir, `${b.id}-1.png`), 'png');
    const outside = path.join(store.dir, '..', 'dokunma.txt');
    fs.writeFileSync(outside, 'x');

    const d = store.create(draft(), 'p');
    const ids = store.list().map((i) => i.id);
    expect(ids).toContain(a.id); // açık olay korunur
    expect(ids).not.toContain(b.id); // en eski kapalı silindi
    expect(ids).toContain(c.id);
    expect(ids).toContain(d.id);
    expect(fs.readdirSync(store.reproDir).filter((n) => n.startsWith(b.id))).toEqual([]);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('kota: açık olaylarla doluysa QuotaError (→ 507)', () => {
    const store = new IncidentStore(tmpDir(), { ...quiet, maxIncidents: 2 });
    store.init();
    store.create(draft(), 'p');
    store.create(draft(), 'p');
    expect(() => store.create(draft(), 'p')).toThrow(QuotaError);
    expect(store.list()).toHaveLength(2);
  });

  it('bayt kotası da uygulanır', () => {
    const store = new IncidentStore(tmpDir(), { ...quiet, maxBytes: 12_000 });
    store.init();
    store.create(draft(), 'p');
    expect(() => store.create(draft(undefined, { domSnapshot: 'x'.repeat(10_000) }), 'p')).toThrow(QuotaError);
  });

  it('saklama süresi: yalnızca süresi dolan kapalı olaylar; --all tüm kapalılar (FR-RCV-10)', () => {
    let now = Date.UTC(2026, 0, 1);
    const store = new IncidentStore(tmpDir(), { ...quiet, now: () => new Date(now) });
    store.init();
    const old = store.create(draft(), 'p');
    const oldOpen = store.create(draft(), 'p');
    store.update(old.id, (i) => {
      i.status = 'fixed';
      i.resolution = { kind: 'fixed', summary: 's', t: new Date(now).toISOString() };
    });
    now += 31 * 86_400_000; // saat ilerletildi
    const recent = store.create(draft(), 'p');
    store.update(recent.id, (i) => {
      i.status = 'fixed';
      i.resolution = { kind: 'fixed', summary: 's', t: new Date(now).toISOString() };
    });
    fs.writeFileSync(path.join(store.reproDir, 'rw-20200101-000000-zzzz.spec.ts'), '//'); // sahipsiz
    expect(store.prune({ retentionDays: 30 })).toEqual([old.id]);
    expect(fs.existsSync(path.join(store.reproDir, 'rw-20200101-000000-zzzz.spec.ts'))).toBe(false);
    expect(store.prune({ retentionDays: 30, all: true })).toEqual([recent.id]);
    expect(store.list().map((i) => i.id)).toEqual([oldOpen.id]);
  });

  it('liste hafif kopya döndürür ve yeniden eskiye sıralar', () => {
    let clock = Date.UTC(2026, 0, 1);
    const store = new IncidentStore(tmpDir(), { ...quiet, now: () => new Date((clock += 1000)) });
    store.init();
    const a = store.create(draft(), 'p');
    const b = store.create(draft(), 'p');
    const list = store.list();
    expect(list.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(list[0].domSnapshot).toBe('');
    expect(store.require(b.id).domSnapshot).not.toBe('');
  });

  it('olay başına kilit (FR-REPRO-21)', () => {
    const store = new IncidentStore(tmpDir(), quiet);
    expect(store.tryLock('x')).toBe(true);
    expect(store.tryLock('x')).toBe(false);
    store.unlock('x');
    expect(store.tryLock('x')).toBe(true);
  });
});
