#!/usr/bin/env node
/**
 * `results/{perf,mem,lat}-latest.json` → NFR tablosu (Markdown, stdout).
 *
 *   node scripts/bench/report.mjs [--dir=scripts/bench/results]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS_DIR, isMain, parseArgs } from './lib/common.mjs';

const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '—');
const f1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : '—');
const sign = (x) => (Number.isFinite(x) ? `${x > 0 ? '+' : ''}${f0(x)}` : '—');
const ok = (b) => (b === null || b === undefined ? '—' : b ? '✅ geçti' : '❌ kaldı');

function load(dir, name) {
  const p = join(dir, `${name}-latest.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/** `{1: x, 4: y}` → "x / y" */
const pair = (by, fmt) => [1, 4].map((t) => (by[t] === undefined ? '—' : fmt(by[t]))).join(' / ');
const allPass = (by, pred) => {
  const v = Object.values(by);
  return v.length ? v.every(pred) : null;
};

export function buildRows(dir = RESULTS_DIR) {
  const perf = load(dir, 'perf');
  const mem = load(dir, 'mem');
  const lat = load(dir, 'lat');
  const rows = [];

  if (perf) {
    for (const page of ['demo', 'list']) {
      const by = Object.fromEntries(perf.results.filter((r) => r.page === page).map((r) => [r.throttle, r.summary]));
      if (!Object.keys(by).length) continue;
      const name = page === 'demo' ? 'demo' : '5.000 düğüm';
      rows.push({
        id: 'NFR-PERF-01',
        target: `INP p75 artışı ≤ 20 ms (${name})`,
        measured: `${pair(by, (s) => `${sign(s.inpP75Increase)} ms (${f0(s.inpOff.p75)}→${f0(s.inpOn.p75)})`)}`,
        pass: { 1: by[1] ? by[1].inpP75Increase <= 20 : undefined, 4: by[4] ? by[4].inpP75Increase <= 20 : undefined },
        note: `Etkileşim p75 artışı: ${pair(by, (s) => `${sign(s.latencyP75Increase)} ms`)}`,
      });
      rows.push({
        id: 'NFR-PERF-01',
        target: `Checkout dışı kayıttan kaynaklanan > 50 ms long task yok (${name})`,
        measured: pair(by, (s) => `${s.longTasks.recordingAttributable} adet`),
        pass: Object.fromEntries(Object.entries(by).map(([t, s]) => [t, s.longTasks.recordingAttributable === 0])),
        note: `Checkout dışı long task/koşu medyanı açık·kapalı: ${pair(by, (s) => `${f0(s.longTasks.onNonCheckoutPerRun.median)}·${f0(s.longTasks.offPerRun.median)}`)}`,
      });
      if (page === 'list') {
        rows.push({
          id: 'NFR-PERF-01',
          target: '5.000 düğümde tam anlık görüntü ≤ 100 ms',
          measured: pair(by, (s) => `${f0(s.checkout?.takeFullSnapshot.median)} ms (p95 ${f0(s.checkout?.takeFullSnapshot.p95)})`),
          pass: Object.fromEntries(Object.entries(by).map(([t, s]) => [t, s.checkout ? s.checkout.takeFullSnapshot.median <= 100 : undefined])),
          note: `${by[1]?.checkout?.mirrorNodes ?? '?'} rrweb düğümü, görüntü ≈ ${f0((by[1]?.checkout?.snapshotBytes ?? NaN) / 1024)} KB`,
        });
      }
    }
  }

  if (mem) {
    for (const r of mem.results) {
      rows.push({
        id: 'NFR-MEM-01',
        target: `Tampon ≤ 50 MB, sınırlı (${r.scenario}, ${mem.params.durationS} sn)`,
        measured: `${f1(r.maxDeltaMB)} MB en çok (90 sn sonrası medyan ${f1(r.steadyDeltaMB.median)} MB) / —`,
        pass: { 1: r.maxDeltaMB <= 50 && r.bounded !== false },
        note: `Son yarı − ilk yarı: ${sign(r.growthLateVsEarlyMB)} MB; bellek uyarısı: ${r.memoryWarning ? 'evet' : 'hayır'}`,
      });
    }
  }

  if (lat) {
    for (const page of ['demo', 'list']) {
      const by = Object.fromEntries(lat.results.filter((r) => r.page === page).map((r) => [r.throttle, r]));
      if (!Object.keys(by).length) continue;
      const name = page === 'demo' ? 'demo' : '5.000 düğüm';
      rows.push({
        id: 'NFR-LAT-01',
        target: `Panel ≤ 500 ms'de açılır (${name}, dolu tampon)`,
        measured: pair(by, (r) => `medyan ${f0(r.panelOpenMs.median)} / p95 ${f0(r.panelOpenMs.p95)} ms`),
        pass: Object.fromEntries(Object.entries(by).map(([t, r]) => [t, r.panelOpenMs.p95 <= 500])),
        note: '',
      });
      rows.push({
        id: 'NFR-LAT-01',
        target: `Kaydet → alıcı onayı p95 ≤ 2 sn (${name})`,
        measured: pair(by, (r) => `p95 ${f0(r.saveToAckMs.p95)} ms`),
        pass: Object.fromEntries(Object.entries(by).map(([t, r]) => [t, r.saveToAckMs.p95 <= 2000])),
        note: `İlk gönderim (önizleme zorunlu) kaydet→önizleme: ${pair(by, (r) => `${f0(r.firstSend?.saveToPreviewMs)} ms`)}`,
      });
      if (page === 'demo') {
        rows.push({
          id: 'NFR-LAT-01',
          target: 'Ajanın sorusu panelde ≤ 5 sn',
          measured: pair(by, (r) => `p95 ${f0(r.questionToPanelMs?.p95)} / en çok ${f0(r.questionToPanelMs?.max)} ms`),
          pass: Object.fromEntries(Object.entries(by).map(([t, r]) => [t, r.questionToPanelMs ? r.questionToPanelMs.max <= 5000 : undefined])),
          note: 'Panel 3 sn aralıkla yoklar',
        });
      }
    }
  }
  return { rows, env: (perf ?? mem ?? lat)?.env, perf, mem, lat };
}

export function renderTable(rows) {
  const lines = ['| NFR | Hedef | Ölçülen (1x / 4x CPU) | Sonuç (1x / 4x) | Not |', '|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.id} | ${r.target} | ${r.measured} | ${pair(r.pass, ok)} | ${r.note} |`);
  return lines.join('\n');
}

export function renderEnv(env) {
  if (!env) return '';
  return [
    `- CPU: ${env.cpu}, RAM ${env.memoryGB} GB, ${env.os}`,
    `- Node ${env.node}, Chromium ${env.chromium} (headless), Playwright ${env.playwright}, rrweb ${env.rrweb}`,
    `- flashback-devtools ${env.flashbackDevtools} (dist: ${env.flashbackDistBuiltAt}), git ${env.git}`,
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const opts = parseArgs();
  const { rows, env } = buildRows(opts.raw.dir ?? RESULTS_DIR);
  if (!rows.length) {
    console.error('Sonuç yok: önce npm run bench (ya da perf/mem/lat betikleri).');
    process.exit(1);
  }
  console.log(renderEnv(env));
  console.log();
  console.log(renderTable(rows));
}
