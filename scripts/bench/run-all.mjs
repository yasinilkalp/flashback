#!/usr/bin/env node
/**
 * Tüm NFR ölçümleri (KK-7): NFR-PERF-01, NFR-MEM-01, NFR-LAT-01 → results/*.json + Markdown tablo.
 *
 *   npm run bench                       # tam ölçüm (~55 dk, 2 çekirdekli makinede)
 *   npm run bench -- --quick            # duman testi (~12 dk; sonuçlar resmî değildir)
 *   npm run bench -- --only=perf,lat    # seçili ölçümler
 *   npm run bench -- --runs=7 --throttle=1,4 --pages=demo,list
 *
 * Önkoşul: npm run build (rewind-devtools, rewind-mcp dist) ve Playwright Chromium.
 */
import { environment, isMain, log, parseArgs, requireBuild, writeResult } from './lib/common.mjs';
import { runLat } from './lat.mjs';
import { runMem } from './mem.mjs';
import { runPerf } from './perf.mjs';
import { buildRows, renderEnv, renderTable } from './report.mjs';

if (isMain(import.meta.url)) {
  const opts = parseArgs();
  requireBuild();
  const only = String(opts.raw.only ?? 'perf,mem,lat').split(',');
  const started = Date.now();
  const builtAt = environment().rewindDistBuiltAt;
  if (only.includes('perf')) log(`PERF → ${writeResult('perf', await runPerf(opts))}`);
  if (only.includes('lat')) log(`LAT → ${writeResult('lat', await runLat(opts))}`);
  if (only.includes('mem')) log(`MEM → ${writeResult('mem', await runMem(opts))}`);
  log(`Toplam ${Math.round((Date.now() - started) / 60000)} dk`);
  if (environment().rewindDistBuiltAt !== builtAt) log('UYARI: ölçüm sırasında packages/rewind/dist yeniden derlendi; sonuçlar karışık sürümden olabilir.');
  const { rows, env } = buildRows();
  console.log(`\n${renderEnv(env)}\n\n${renderTable(rows)}`);
}
