#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { formatChecks, probePort, runChecks, suggestFreePort, wrongProjectMessage } from './checks.js';
import { ConfigError, isLoopbackHost, loadConfig, type FlashbackConfig } from './config.js';
import { createReceiver, type Receiver } from './http.js';
import { IncidentStore } from './store.js';
import { SERVER_INSTRUCTIONS, createMcpServer, type ToolContext } from './tools.js';
import { VERSION } from './version.js';

// stdout MCP protokolüne aittir; tüm günlükler stderr'e gider.
const log = (m: string) => process.stderr.write(`[flashback-mcp] ${m}\n`);

const USAGE = `flashback-mcp ${VERSION}

Kullanım:
  flashback-mcp                 MCP (stdio) + HTTP alıcı (varsayılan)
  flashback-mcp serve           Yalnızca HTTP alıcı
  flashback-mcp check           Başlangıç kontrolleri (port, Playwright, Chromium, olay klasörü)
  flashback-mcp prune [--all]   Saklama süresini aşan kapalı olayları sil (--all: tüm kapalı olaylar)

Bayraklar:
  --unsafe-expose            Loopback dışı FLASHBACK_HOST'a izin ver (önerilmez)`;

function config(unsafeExpose: boolean): FlashbackConfig {
  try {
    const c = loadConfig(process.env, { unsafeExpose });
    if (!isLoopbackHost(c.host)) {
      log('!!! UYARI: alıcı loopback dışı bir adreste dinliyor (--unsafe-expose). Ağdaki herkes olay gönderebilir. !!!');
    }
    return c;
  } catch (e) {
    if (e instanceof ConfigError) {
      log(`Hata: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

function openStore(c: FlashbackConfig): IncidentStore {
  const store = new IncidentStore(c.dir, { log });
  store.init();
  const pruned = store.prune({ retentionDays: c.retentionDays });
  if (pruned.length) log(`Saklama süresi (${c.retentionDays} gün) dolan ${pruned.length} kapalı olay silindi.`);
  return store;
}

async function serve(c: FlashbackConfig) {
  const store = openStore(c);
  const receiver = createReceiver({ config: c, store, log });
  const port = await receiver.listen();
  log(`Alıcı http://${c.host}:${port} adresinde (olay klasörü ${c.dir}, projectId ${c.projectId}).`);
}

async function mcp(c: FlashbackConfig) {
  const store = openStore(c);
  let ctx: ToolContext = { mode: 'ok', config: c, store };
  let receiver: Receiver | undefined = createReceiver({ config: c, store, log });
  try {
    const port = await receiver.listen();
    log(`Alıcı http://${c.host}:${port} adresinde (olay klasörü ${c.dir}).`);
  } catch (e) {
    receiver = undefined;
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    const status = await probePort(c);
    if (status.kind === 'same_project') {
      log(`Port ${c.port} bu projenin çalışan sunucusunda; olaylar aynı klasörden (${c.dir}) okunacak.`);
    } else {
      const message = wrongProjectMessage(c, status, await suggestFreePort(c.host, c.port + 1));
      log(message);
      ctx = { mode: 'wrong_project', message };
    }
  }

  // FR-CFG-11: başlangıç kontrolleri günlüğe ve ajana (instructions) yazılır.
  const problems = (await runChecks(c)).filter((i) => !i.ok);
  let instructions = SERVER_INSTRUCTIONS;
  if (problems.length) {
    log(`Başlangıç kontrolleri:\n${formatChecks(problems)}`);
    instructions += `\n\nBaşlangıç kontrollerinde sorun var:\n${formatChecks(problems)}`;
  }

  const server = createMcpServer(ctx, { instructions });
  await server.connect(new StdioServerTransport());
  const shutdown = async () => {
    await receiver?.close();
    process.exit(0);
  };
  process.stdin.on('close', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

async function main(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const [cmd = 'mcp'] = argv.filter((a) => !a.startsWith('--'));
  if (flags.has('--help') || flags.has('-h') || cmd === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (flags.has('--version')) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const unsafeExpose = flags.has('--unsafe-expose');
  switch (cmd) {
    case 'mcp':
      return mcp(config(unsafeExpose));
    case 'serve':
      return serve(config(unsafeExpose));
    case 'check': {
      const c = config(unsafeExpose);
      const items = await runChecks(c);
      process.stdout.write(`flashback-mcp ${VERSION} — başlangıç kontrolleri (${c.projectName})\n${formatChecks(items)}\n`);
      process.exitCode = items.every((i) => i.ok) ? 0 : 1;
      return;
    }
    case 'prune': {
      const c = config(unsafeExpose);
      const store = new IncidentStore(c.dir, { log });
      store.init();
      const deleted = store.prune({ retentionDays: c.retentionDays, all: flags.has('--all') });
      process.stdout.write(`${deleted.length} kapalı olay silindi (${c.dir}). Açık olaylara dokunulmadı.\n`);
      return;
    }
    default:
      process.stderr.write(`Bilinmeyen komut: ${cmd}\n\n${USAGE}\n`);
      process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((e) => {
  log(`Beklenmeyen hata: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
