import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer, findReportsDir, listReports, readReport } from '../src/index.js';

let root: string;
let dir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-mcp-'));
  dir = path.join(root, '.flashback');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Rapor yazar; dosya zamanı kimlikteki zamandır (sıra dosya zamanından gelir). */
function write(id: string, title: string) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  fs.writeFileSync(file, `# ${title}\n\n> Flashback raporu\n`);
  const [, d, t] = id.split('-');
  const at = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4));
  fs.utimesSync(file, at, at);
}

async function connect() {
  const server = createMcpServer(dir);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const text = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean; structuredContent?: unknown };
    return { text: res.content[0].text, isError: !!res.isError, structured: res.structuredContent };
  };
  return { client, text, close: () => client.close() };
}

describe('rapor klasörü', () => {
  it('yukarı doğru ilk .flashback; yoksa git kökü; FLASHBACK_DIR önce gelir', () => {
    const deep = path.join(root, 'packages', 'web', 'src');
    fs.mkdirSync(deep, { recursive: true });
    fs.mkdirSync(path.join(root, '.git'));
    expect(findReportsDir({}, deep)).toBe(path.join(root, '.flashback'));
    fs.mkdirSync(path.join(root, 'packages', 'web', '.flashback'));
    expect(findReportsDir({}, deep)).toBe(path.join(root, 'packages', 'web', '.flashback'));
    expect(findReportsDir({ FLASHBACK_DIR: 'x' }, root)).toBe(path.join(root, 'x'));
    expect(findReportsDir({ FLASHBACK_PROJECT_ROOT: root }, os.tmpdir())).toBe(path.join(root, '.flashback'));
  });

  it('yeniden eskiye listeler, rapor olmayan dosyaları atlar, kimlikle yol dışına çıkılamaz', () => {
    write('fb-20261030-141205-k3pz', 'Toplam yanlış');
    write('fb-20261029-090000-abcd', 'Eski hata');
    fs.writeFileSync(path.join(dir, 'notlar.md'), '# değil');
    expect(listReports(dir).map((r) => [r.id, r.title, r.createdAt])).toEqual([
      ['fb-20261030-141205-k3pz', 'Toplam yanlış', '2026-10-30 14:12:05'],
      ['fb-20261029-090000-abcd', 'Eski hata', '2026-10-29 09:00:00'],
    ]);
    expect(readReport(dir)?.info.id).toBe('fb-20261030-141205-k3pz');
    expect(readReport(dir, '../../etc/passwd')).toBeNull();
    expect(listReports(path.join(root, 'yok'))).toEqual([]);
  });
});

describe('MCP araçları', () => {
  it('yalnızca iki salt okunur araç var', async () => {
    const { client, close } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_report', 'list_reports']);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    await close();
  });

  it('rapor yokken yol gösterir', async () => {
    const { text, close } = await connect();
    expect((await text('get_report')).text).toContain('Henüz rapor yok');
    expect((await text('list_reports')).text).toContain('Henüz rapor yok');
    await close();
  });

  it('get_report id vermeden en yeni raporu, id ile istenen raporu verir', async () => {
    write('fb-20261029-090000-abcd', 'Eski hata');
    write('fb-20261030-141205-k3pz', 'Toplam yanlış');
    const { text, close } = await connect();
    expect((await text('get_report')).text).toContain('# Toplam yanlış');
    expect((await text('get_report', { id: 'fb-20261029-090000-abcd' })).text).toContain('# Eski hata');
    const missing = await text('get_report', { id: 'fb-20200101-000000-zzzz' });
    expect(missing.isError).toBe(true);
    const list = await text('list_reports', { limit: 1 });
    expect(list.structured).toEqual({ reports: [{ id: 'fb-20261030-141205-k3pz', createdAt: '2026-10-30 14:12:05', title: 'Toplam yanlış' }] });
    await close();
  });
});
