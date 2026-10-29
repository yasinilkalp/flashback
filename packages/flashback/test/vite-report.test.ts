import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Report } from '../src/report/types.js';
import { isReport, KEEP_REPORTS, projectPath, reportHandler, reportId, writeReport } from '../src/vite.js';

const AT = Date.parse('2026-10-30T14:12:05Z');

function report(over: Partial<Report> = {}): Report {
  return {
    v: 1,
    lang: 'tr',
    createdAt: new Date(AT).toISOString(),
    note: 'Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor',
    page: { url: 'http://localhost:5173/cart', title: 'Demo', viewport: '1280×720' },
    target: {
      selector: '[data-testid="total"]',
      file: 'src/Cart.tsx',
      line: 69,
      column: 9,
      resolved: true,
      snippet: { startLine: 68, lines: ['        <dt>Toplam</dt>', '        <dd data-testid="total">{formatTry(total)}</dd>'] },
      components: ['Cart', 'App'],
      html: '<dd data-testid="total">135030 ₺</dd>',
    },
    network: [{ ago: 12_300, method: 'GET', url: 'http://localhost:5173/api/shipping', status: 200, durationMs: 4, resBody: '{"fee":"30"}' }],
    console: [{ ago: 2000, level: 'error', message: 'boom', source: 'src/Cart.tsx:25:3' }],
    steps: [{ ago: 20_000, type: 'click', selector: '[data-testid="add-1"]', label: 'Sepete ekle' }],
    store: [],
    redacted: 0,
    ...over,
  };
}

describe('Vite eklentisi: rapor ucu', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'flashback-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('kimlik biçimi', () => {
    expect(reportId(new Date(2026, 9, 30, 14, 12, 5))).toMatch(/^fb-20261030-141205-[a-z0-9]{4}$/);
  });

  it('yollar proje köküne göreli olur; URL ve kök dışı yollar olduğu gibi kalır', () => {
    const project = join(dir, 'repo');
    const vite = join(project, 'examples', 'demo');
    expect(projectPath('src/Cart.tsx', vite, project)).toBe('examples/demo/src/Cart.tsx');
    expect(projectPath('src/Cart.tsx:25:3', vite, project)).toBe('examples/demo/src/Cart.tsx:25:3');
    expect(projectPath('/src/Cart.tsx', vite, project)).toBe('examples/demo/src/Cart.tsx');
    expect(projectPath('http://localhost:5173/src/x.js:1:2', vite, project)).toBe('http://localhost:5173/src/x.js:1:2');
    expect(projectPath('../../../outside/x.ts', vite, project)).toBe('../../../outside/x.ts');
  });

  it('raporu yazar, .gitignore ekler, en yeni 50 raporu tutar', () => {
    const project = join(dir, 'w');
    const out = join(project, '.flashback');
    mkdirSync(out, { recursive: true });
    for (let i = 0; i < KEEP_REPORTS + 3; i++) writeFileSync(join(out, `fb-20200101-0000${String(i).padStart(2, '0')}-aaaa.md`), 'eski');
    const saved = writeReport(report(), { viteRoot: join(project, 'web'), projectRoot: project, dir: out });
    expect(saved.path).toBe(`.flashback/${saved.id}.md`);
    const md = readFileSync(join(project, saved.path), 'utf8');
    expect(md).toContain('`web/src/Cart.tsx:69`');
    expect(md).toContain('`web/src/Cart.tsx:25:3`');
    expect(existsSync(join(out, '.gitignore'))).toBe(true);
    const left = readdirSync(out).filter((f) => f.endsWith('.md'));
    expect(left).toHaveLength(KEEP_REPORTS);
    expect(left).toContain(`${saved.id}.md`);
    expect(left).not.toContain('fb-20200101-000000-aaaa.md');
  });

  it('biçim denetimi', () => {
    expect(isReport(report())).toBe(true);
    expect(isReport({ ...report(), note: '  ' })).toBe(false);
    expect(isReport({ ...report(), v: 2 })).toBe(false);
    expect(isReport({ ...report(), steps: 'x' })).toBe(false);
  });

  describe('HTTP', () => {
    let server: Server;
    let base: string;
    const out = () => join(dir, 'http', '.flashback');
    beforeAll(async () => {
      const handler = reportHandler(() => ({ viteRoot: join(dir, 'http'), projectRoot: join(dir, 'http'), dir: out() }));
      server = createServer(handler);
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    const post = (body: string, headers: Record<string, string> = {}) =>
      fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

    it('aynı kökenden gelen raporu yazar', async () => {
      const res = await post(JSON.stringify(report()), { Origin: base, 'Sec-Fetch-Site': 'same-origin' });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; path: string };
      expect(body.path).toBe(`.flashback/${body.id}.md`);
      expect(existsSync(join(out(), `${body.id}.md`))).toBe(true);
    });

    it('başka kökeni, JSON olmayanı, bozuk raporu ve GET isteğini reddeder', async () => {
      expect((await post(JSON.stringify(report()), { Origin: 'https://kotu.example' })).status).toBe(403);
      expect((await post(JSON.stringify(report()), { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
      expect((await fetch(base, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
      expect((await post('{"v":1}')).status).toBe(400);
      expect((await post('nope')).status).toBe(400);
      expect((await fetch(base)).status).toBe(405);
    });
  });
});
