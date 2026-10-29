#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { findReportsDir } from './reports.js';
import { createMcpServer } from './server.js';
import { VERSION } from './version.js';

const arg = process.argv[2];
if (arg === '--version' || arg === '-v') {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (arg === '--help' || arg === '-h') {
  process.stdout.write(`flashback-mcp ${VERSION}

Flashback raporlarını (.flashback/*.md) MCP üzerinden ajana verir. Ajan yapılandırmasına ekleyin:
  { "mcpServers": { "flashback": { "command": "npx", "args": ["--no-install", "flashback-mcp"] } } }

Ortam değişkenleri:
  FLASHBACK_PROJECT_ROOT   Rapor klasörünün aranacağı proje kökü (varsayılan: çalışma klasörü)
  FLASHBACK_DIR            Rapor klasörü (varsayılan: proje kökündeki .flashback)
`);
  process.exit(0);
}

const dir = findReportsDir();
// stdout MCP protokolüne aittir; günlükler stderr'e gider.
process.stderr.write(`[flashback-mcp] ${VERSION} · raporlar: ${dir}\n`);
await createMcpServer(dir).connect(new StdioServerTransport());
