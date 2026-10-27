/**
 * EK-B3 ölçümü (FRD §3.5): her kurulumda etiketli her öğe için dosya:satır çözümlemesini panelin kendi koduyla dener.
 *
 *   node spikes/ek-b3/prepare.mjs
 *   node spikes/ek-b3/measure.mjs [--only=vite-r19,next-webpack] [--browsers=chromium,firefox] [--no-panel] [--no-hmr]
 *
 * İki ölçüm yapılır:
 *  - probe: `probe.ts` sayfaya enjekte edilir; tüm `data-ekb3` / `data-ekb3-rsc` öğeleri `locateSource` ile çözülür.
 *  - hmr: dosyaların başına satır eklenir (sunucu çalışırken); aynı resolver ile probe tekrarlanır. Önbellekteki
 *    eski harita yeni satırları eski yerlerine eşlerse burada `wrong` olarak görünür.
 *  - panel: gerçek akış (panel → S → tekrar oynatmadaki öğeye tıkla → `selected-source`), örneklenen öğelerde.
 *
 * Sınıflar: `correct` (dosya ve satır doğru), `unresolved` (`resolved:false` ya da konum yok; kabul edilebilir düşüş),
 * `wrong` (resolved:true ama yanlış — FRD'ye göre hiç olmamalı).
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { writeFixture } from './fixture.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = join(here, '../..');
const isWin = process.platform === 'win32';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]?.split(',');

const SETUPS = [
  { name: 'vite-r19', app: 'vite-r19', label: 'Vite 8.3.5 + React 19.3.1', bin: 'node_modules/vite/bin/vite.js', args: (p) => ['--port', p, '--strictPort'] },
  { name: 'vite-r18', app: 'vite-r18', label: 'Vite 8.3.5 + React 18.3.1', bin: 'node_modules/vite/bin/vite.js', args: (p) => ['--port', p, '--strictPort'] },
  { name: 'next-turbopack', app: 'next16', label: 'Next.js 16.4.3 App Router + Turbopack (React 19.3.1)', bin: 'node_modules/next/dist/bin/next', args: (p) => ['dev', '--turbopack', '-p', p], clean: '.next' },
  { name: 'next-webpack', app: 'next16', label: 'Next.js 16.4.3 App Router + webpack (React 19.3.1)', bin: 'node_modules/next/dist/bin/next', args: (p) => ['dev', '--webpack', '-p', p], clean: '.next' },
];
const BROWSERS = { chromium, firefox };
const only = arg('only');
const browsers = arg('browsers') ?? ['chromium', 'firefox'];
const withPanel = !process.argv.includes('--no-panel');
const withHmr = !process.argv.includes('--no-hmr');

const PANEL_SAMPLE = 12;
const SAMPLE = 20;
const PORT = '5191';

const logs = join(here, '.logs');
mkdirSync(logs, { recursive: true });
mkdirSync(join(here, 'results'), { recursive: true });

/** Deterministik karıştırma (mulberry32): "20 rastgele seçim" her koşuda aynı örnek olsun. */
function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample(list, n, seed) {
  const rnd = seeded(seed);
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function splitLoc(s) {
  const i = s.lastIndexOf(':');
  return { file: s.slice(0, i), line: Number(s.slice(i + 1)) };
}

function classify(expected, loc) {
  if (!loc || !loc.resolved) return 'unresolved';
  const exp = splitLoc(expected);
  const file = loc.file.replace(/\\/g, '/');
  const fileOk = file === exp.file || file.endsWith(`/${exp.file}`);
  return fileOk && loc.line === exp.line ? 'correct' : 'wrong';
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (isWin) execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    /* zaten kapanmış */
  }
}

async function waitForServer(url, child, timeoutMs = 240_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`sunucu kapandı (kod ${child.exitCode})`);
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* henüz açılmadı */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('sunucu zamanında açılmadı');
}

async function probeBundle() {
  const out = await build({
    entryPoints: [join(here, 'probe.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

async function loadFixture(page, url) {
  await page.goto(url, { timeout: 240_000, waitUntil: 'load' });
  // Lazy parça, portal, gecikmeli içerik ve panel düğmesi hazır olana kadar bekle.
  for (const sel of ['figure[data-ekb3]', 'aside[data-ekb3]', 'mark[data-ekb3]', '[data-rw="launcher"]']) {
    await page.locator(sel).first().waitFor({ state: 'attached', timeout: 120_000 });
  }
  await page.waitForTimeout(1500);
}

/** HMR uygulanana kadar bekler: tüm etiketli öğeler fixture'ın 2. sürümünden. */
async function waitForHmr(page) {
  await page.waitForFunction(
    () => {
      const els = document.querySelectorAll('[data-ekb3],[data-ekb3-rsc]');
      return els.length > 0 && Array.from(els).every((el) => el.getAttribute('data-ekb3-v') === '2');
    },
    undefined,
    { timeout: 120_000, polling: 500 },
  );
  await page.waitForTimeout(1000);
}

async function probeRun(page) {
  const rows = await page.evaluate(() => window.__ekb3.run());
  for (const r of rows) {
    r.verdict = classify(r.expected, r.loc);
    // Teşhis alanları (ham yığın, derlenmiş kod) yalnızca yanlış satırlarda saklanır; sonuç dosyası küçük kalsın.
    if (r.verdict !== 'wrong') {
      delete r.rawStack;
      delete r.compiled;
    }
    if (r.verdict === 'correct') delete r.hint;
  }
  return rows;
}

function summarizeProbe(rows) {
  const client = rows.filter((r) => r.kind === 'client');
  const rsc = rows.filter((r) => r.kind === 'rsc');
  return {
    client: summarize(client),
    sample20: summarize(sample(client, SAMPLE, 42)),
    rsc: rsc.length ? summarize(rsc) : null,
    relativePaths: client.filter((r) => r.loc?.resolved && r.loc.file.replace(/\\/g, '/') === splitLoc(r.expected).file).length,
  };
}

const fmt = (s) => s && `${s.correct}/${s.n} doğru, ${s.unresolved} çözülemedi, ${s.wrong} YANLIŞ`;

async function panelRun(page, probeResults) {
  const candidates = probeResults.filter((r) => r.expected && r.tag !== 'input' && r.tag !== 'img');
  await page.keyboard.press('Alt+Shift+KeyR');
  await page.locator('[data-rw="panel"]').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  // Tekrar oynatma görünümünde görünen öğeler.
  const visible = await page.evaluate((expectedList) => {
    const iframe = document.querySelector('rewind-devtools')?.shadowRoot?.querySelector('iframe');
    if (!iframe?.contentDocument) return [];
    const f = iframe.getBoundingClientRect();
    const scale = f.width / iframe.offsetWidth;
    const out = [];
    for (const exp of expectedList) {
      const el = iframe.contentDocument.querySelector(`[data-ekb3="${exp}"],[data-ekb3-rsc="${exp}"]`);
      if (!el) continue;
      const e = el.getBoundingClientRect();
      if (e.width < 2 || e.height < 2) continue;
      const ix = e.left + Math.min(e.width / 2, 6);
      const iy = e.top + Math.min(e.height / 2, 6);
      // Noktada başka bir öğe (çocuk, üst üste binme) varsa tıklama başka öğeyi seçer; bu adayı atla.
      if (iframe.contentDocument.elementFromPoint(ix, iy) !== el) continue;
      const x = f.left + ix * scale;
      const y = f.top + iy * scale;
      if (x < f.left || y < f.top || x > f.right - 1 || y > f.bottom - 1) continue;
      out.push({ expected: exp, x, y });
    }
    return out;
  }, candidates.map((r) => r.expected));
  const results = [];
  for (const target of sample(visible, PANEL_SAMPLE, 7)) {
    const overlay = page.locator('[data-rw="pick-overlay"]');
    if (!(await overlay.isVisible())) await page.locator('[data-rw="select"]').click();
    await overlay.waitFor({ timeout: 5000 });
    const before = (await page.locator('[data-rw="selected-source"]').textContent({ timeout: 500 }).catch(() => null)) ?? null;
    await page.mouse.click(target.x, target.y);
    const selected = await page.locator('[data-rw="selected-selector"]').textContent({ timeout: 10_000 }).catch(() => null);
    let text = null;
    for (let i = 0; i < 40; i++) {
      text = await page.locator('[data-rw="selected-source"]').textContent().catch(() => null);
      if (text && text !== before && text !== '—') break;
      await page.waitForTimeout(250);
    }
    const m = text && /^(.*):(\d+)(?: \((.*)\))?$/.exec(text.trim());
    const loc = m ? { file: m[1], line: Number(m[2]), resolved: !m[3], reason: m[3] } : null;
    results.push({ expected: target.expected, selector: selected, text, loc, verdict: classify(target.expected, loc) });
  }
  // Paneli kapat (odak metin alanındayken kısayol çalışmaz): kayıt sürer, sonraki aşama canlı sayfada yapılır.
  await page.locator('[data-rw="close"]').click();
  await page.locator('[data-rw="panel"]').waitFor({ state: 'detached', timeout: 10_000 });
  return results;
}

async function panelPhase(page, run, rows, key) {
  if (!withPanel) return;
  try {
    run[key] = await panelRun(page, rows);
    run.summary[key] = summarize(run[key]);
  } catch (e) {
    run[`${key}Error`] = String(e).split('\n')[0];
  }
}

function summarize(rows) {
  const n = rows.length;
  const c = (v) => rows.filter((r) => r.verdict === v).length;
  return { n, correct: c('correct'), unresolved: c('unresolved'), wrong: c('wrong'), rate: n ? c('correct') / n : null };
}

/** Sonuçlara giren yerel yolları (kullanıcı adı vb.) `<repo>` ile değiştirir. */
function scrub(json) {
  const fwd = repo.replace(/\\/g, '/').replace(/\/$/, '');
  const variants = new Set([fwd, fwd.replace(/^([A-Z]):/, (_, d) => d.toLowerCase() + ':'), repo.replace(/[\\/]$/, '')]);
  let s = json;
  for (const v of variants) {
    for (const form of [v, JSON.stringify(v).slice(1, -1), encodeURI(v)]) s = s.split(form).join('<repo>');
  }
  return s;
}

const probe = await probeBundle();
const report = { date: new Date().toISOString(), node: process.version, platform: process.platform, setups: [] };

for (const setup of SETUPS.filter((s) => !only || only.includes(s.name))) {
  const appDir = join(here, 'apps', setup.app);
  if (!existsSync(join(appDir, 'node_modules'))) throw new Error(`${setup.app}: önce prepare.mjs`);
  if (setup.clean) rmSync(join(appDir, setup.clean), { recursive: true, force: true });
  const url = `http://localhost:${PORT}/`;
  const child = spawn(process.execPath, [join(appDir, setup.bin), ...setup.args(PORT)], {
    cwd: appDir,
    env: { ...process.env, BROWSER: 'none', NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' },
    detached: !isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const entry = { name: setup.name, label: setup.label, runs: [] };
  report.setups.push(entry);
  try {
    console.log(`\n▶ ${setup.label}`);
    await waitForServer(url, child);
    for (const bname of browsers) {
      let browser;
      try {
        // Tam Chromium (yeni headless kipi); ayrı headless kabuk gerekmez.
        browser = await BROWSERS[bname].launch(bname === 'chromium' ? { channel: 'chromium' } : {});
      } catch (e) {
        entry.runs.push({ browser: bname, skipped: `tarayıcı açılamadı: ${String(e).split('\n')[0]}` });
        console.log(`  ${bname}: atlandı (tarayıcı yok)`);
        continue;
      }
      const run = { browser: bname, version: browser.version() };
      entry.runs.push(run);
      try {
        const context = await browser.newContext({ viewport: { width: 1400, height: 2600 } });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 300)));
        page.on('console', (m) => m.type() === 'error' && pageErrors.push(`console: ${m.text().slice(0, 300)}`));
        writeFixture(setup.app, 1);
        await loadFixture(page, url);
        await page.addScriptTag({ content: probe });
        run.probe = await probeRun(page);
        run.summary = summarizeProbe(run.probe);
        await panelPhase(page, run, run.probe, 'panel');
        if (withHmr) {
          try {
            writeFixture(setup.app, 2);
            await waitForHmr(page);
            run.hmr = await probeRun(page);
            run.summary.hmr = summarizeProbe(run.hmr);
            await panelPhase(page, run, run.hmr, 'panelHmr');
          } catch (e) {
            run.hmrError = String(e).split('\n')[0];
          }
        }
        run.pageErrors = pageErrors.slice(0, 20);
        const s = run.summary;
        console.log(`  ${bname}: istemci ${fmt(s.client)}${s.rsc ? ` · RSC ${fmt(s.rsc)}` : ''}`);
        if (s.panel) console.log(`    panel: ${fmt(s.panel)}`);
        else if (run.panelError) console.log(`    panel hata: ${run.panelError}`);
        if (s.hmr) console.log(`    HMR sonrası: istemci ${fmt(s.hmr.client)}${s.hmr.rsc ? ` · RSC ${fmt(s.hmr.rsc)}` : ''}`);
        else if (run.hmrError) console.log(`    HMR hata: ${run.hmrError}`);
        if (s.panelHmr) console.log(`    HMR sonrası panel: ${fmt(s.panelHmr)}`);
        else if (run.panelHmrError) console.log(`    HMR sonrası panel hata: ${run.panelHmrError}`);
        await context.close();
      } catch (e) {
        run.error = String(e).split('\n').slice(0, 3).join(' ');
        console.log(`  ${bname}: HATA ${run.error}`);
      } finally {
        await browser.close();
      }
    }
  } catch (e) {
    entry.error = String(e);
    console.log(`  HATA: ${entry.error}`);
  } finally {
    killTree(child);
    writeFixture(setup.app, 1);
    writeFileSync(join(logs, `${setup.name}.log`), log);
  }
}

/** Hücre: doğru/n · çözülemedi · yanlış. */
const cell = (s) => (s ? `${s.correct}/${s.n} · ${s.unresolved} · **${s.wrong}**` : '—');

function summaryMarkdown() {
  const L = [
    '# EK-B3 ölçüm özeti',
    '',
    `${report.date.slice(0, 10)} · ${report.platform} · Node ${report.node}. Hücreler: **doğru/n · çözülemedi · yanlış**. "Yanlış" = \`resolved:true\` ama yanlış dosya:satır (ölçüt: 0).`,
    '',
    '| Kurulum | Tarayıcı | İstemci (tümü) | 20 rastgele | RSC | Panel seçimi | HMR sonrası istemci | HMR sonrası RSC | HMR sonrası panel |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const s of report.setups) {
    for (const r of s.runs) {
      if (r.skipped || r.error || !r.summary) {
        L.push(`| ${s.label} | ${r.browser} | ${r.skipped ?? r.error ?? 'sonuç yok'} | | | | | | |`);
        continue;
      }
      const u = r.summary;
      L.push(`| ${s.label} | ${r.browser} ${r.version ?? ''} | ${cell(u.client)} | ${cell(u.sample20)} | ${cell(u.rsc)} | ${cell(u.panel)} | ${cell(u.hmr?.client)} | ${cell(u.hmr?.rsc)} | ${cell(u.panelHmr)} |`);
    }
  }
  return L.join('\n') + '\n';
}

/** Öğe satırları tek satırda: dosya okunur ve küçük kalır. */
function serialize(r) {
  const rows = [];
  const json = JSON.stringify(
    r,
    (k, v) => (['probe', 'hmr', 'panel', 'panelHmr'].includes(k) && Array.isArray(v) ? `@@rows${rows.push(v) - 1}@@` : v),
    2,
  );
  return json.replace(/"@@rows(\d+)@@"/g, (_, i) => `[\n${rows[Number(i)].map((row) => `        ${JSON.stringify(row)}`).join(',\n')}\n      ]`);
}

writeFileSync(join(here, 'results/results.json'), scrub(serialize(report)));
writeFileSync(join(here, 'results/summary.md'), scrub(summaryMarkdown()));
console.log('\nSonuçlar: spikes/ek-b3/results/results.json, summary.md');
