import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { CLIENT_HEADER, type HealthResponse } from '@flashback/shared';
import type { FlashbackConfig } from './config.js';
import { resolvePlaywright } from './repro.js';
import { IncidentStore } from './store.js';

export type PortStatus =
  | { kind: 'free' }
  | { kind: 'same_project'; health: HealthResponse }
  | { kind: 'other_project'; health: HealthResponse }
  | { kind: 'foreign' };

/** Port doluysa GET /health ile kimin dinlediğini öğrenir (FR-RCV-05). */
export async function probePort(config: Pick<FlashbackConfig, 'host' | 'port' | 'projectId'>): Promise<PortStatus> {
  const host = config.host.includes(':') ? `[${config.host}]` : config.host;
  try {
    const res = await fetch(`http://${host}:${config.port}/health`, {
      headers: { [CLIENT_HEADER]: 'flashback-mcp' },
      signal: AbortSignal.timeout(2000),
    });
    const body = (await res.json()) as Partial<HealthResponse>;
    if (body.name !== 'flashback-mcp' || typeof body.projectId !== 'string') return { kind: 'foreign' };
    const health = body as HealthResponse;
    return health.projectId === config.projectId ? { kind: 'same_project', health } : { kind: 'other_project', health };
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    return code === 'ECONNREFUSED' ? { kind: 'free' } : { kind: 'foreign' };
  }
}

/** `from`'dan başlayarak boş bir port önerir. */
export async function suggestFreePort(host: string, from: number): Promise<number | undefined> {
  for (let p = from; p < from + 20 && p <= 65535; p++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.listen(p, host, () => srv.close(() => resolve(true)));
    });
    if (free) return p;
  }
  return undefined;
}

export function wrongProjectMessage(config: Pick<FlashbackConfig, 'port'>, status: PortStatus, free?: number): string {
  const who =
    status.kind === 'other_project'
      ? `başka bir projenin (${status.health.projectName}, projectId ${status.health.projectId}) flashback-mcp sunucusu`
      : 'Flashback olmayan bir uygulama';
  const hint = free
    ? ` Bu projede FLASHBACK_PORT=${free} ile başlat ve <Flashback endpoint="http://127.0.0.1:${free}" /> ver.`
    : ' FLASHBACK_PORT ile boş bir port seç.';
  return `Port ${config.port} ${who} tarafından kullanılıyor; başka projenin olayları okunmaz.${hint}`;
}

export interface CheckItem {
  ok: boolean;
  label: string;
  detail: string;
}

/** FR-CFG-11: port/projectId, Playwright, Chromium, olay klasörü. */
export async function runChecks(config: FlashbackConfig): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const port = await probePort(config);
  items.push(
    port.kind === 'free'
      ? { ok: true, label: 'Port', detail: `${config.host}:${config.port} boş (projectId ${config.projectId})` }
      : port.kind === 'same_project'
        ? { ok: true, label: 'Port', detail: `${config.port} bu projenin flashback-mcp sunucusunda (projectId ${config.projectId})` }
        : { ok: false, label: 'Port', detail: wrongProjectMessage(config, port, await suggestFreePort(config.host, config.port + 1)) },
  );

  const pw = resolvePlaywright(config.projectRoot);
  items.push(
    pw
      ? { ok: true, label: 'Playwright', detail: `@playwright/test ${pw.version}` }
      : { ok: false, label: 'Playwright', detail: `${config.projectRoot} konumundan @playwright/test çözülemedi → npm i -D @playwright/test` },
  );
  if (pw) {
    const exists = !!pw.chromiumPath && fs.existsSync(pw.chromiumPath);
    items.push(
      exists
        ? { ok: true, label: 'Chromium', detail: pw.chromiumPath! }
        : { ok: false, label: 'Chromium', detail: 'Chromium bulunamadı → npx playwright install chromium' },
    );
  }

  try {
    const store = new IncidentStore(config.dir, { log: () => {} });
    store.init();
    const probe = path.join(config.dir, `.write-check-${process.pid}`);
    store.writeAtomic(probe, 'ok');
    fs.rmSync(probe, { force: true });
    const { count } = store.usage();
    items.push({ ok: true, label: 'Olay klasörü', detail: `${config.dir} yazılabilir (${count} olay)` });
  } catch (e) {
    items.push({ ok: false, label: 'Olay klasörü', detail: `${config.dir} yazılamıyor: ${(e as Error).message}` });
  }

  if (config.storageState && !fs.existsSync(config.storageState)) {
    items.push({ ok: false, label: 'storageState', detail: `FLASHBACK_STORAGE_STATE dosyası yok: ${config.storageState}` });
  }
  if (config.allowUnsafeAssertions) {
    items.push({ ok: false, label: 'Assertion', detail: 'FLASHBACK_ALLOW_UNSAFE_ASSERTIONS bu sürümde desteklenmiyor; yok sayıldı.' });
  }
  return items;
}

export function formatChecks(items: CheckItem[]): string {
  return items.map((i) => `${i.ok ? '✓' : '✗'} ${i.label}: ${i.detail}`).join('\n');
}
