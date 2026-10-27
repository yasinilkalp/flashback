#!/usr/bin/env node
/**
 * NFR-MEM-01 — varsayılan ayarlarda (bufferSeconds 60 → 30 sn'de bir checkout, son 3 dilim) tamponun JS heap'i.
 *
 *   node scripts/bench/mem.mjs [--duration=180] [--pages=demo,list] [--stress=1] [--quick]
 *
 * Senaryolar (her biri kayıt AÇIK ve KAPALI, aynı anda iki ayrı Chromium sürecinde, GERÇEK süre — zaman sıkıştırma yok):
 *  - demo   : demo sepet, ~700 ms tempoda sürekli etkileşim (perf.mjs betiği döngüde)
 *  - list   : 5.000 öğeli liste, aynı tempoda sürekli etkileşim
 *  - stress : 5.000 öğeli liste + `?ticker=100` (100 ms'de bir 50 satır güncellenir ≈ 500 metin mutasyonu/sn) + etkileşim
 *
 * Her 10 sn'de CDP `HeapProfiler.collectGarbage` ardından `Runtime.getHeapUsage` (usedSize: V8 JS heap; embedder:
 * DOM/Oilpan). Kayıt açık − kapalı farkı = Rewind'in toplam bellek ek yükü (rrweb + mirror + halka tampon + ağ/konsol
 * kayıtları + panel kökü); tamponun kendisi bu farkın bir parçasıdır, yani fark ≤ 50 MB ise tampon da ≤ 50 MB'tır.
 * "Sınırlı" ölçütü: ilk 90 sn'den (3 dilim dolar) sonra farkın büyümemesi.
 * Aynı oturumdaki long task'lar ve doğal checkout'lar da toplanır (NFR-PERF-01'e uzun oturum kanıtı).
 * Sonda panel açılıp bellek uyarısı (memoryWarning şeridi) olup olmadığına bakılır.
 */
import { collect, launch, newPage, waitReady } from './lib/browser.mjs';
import { environment, isMain, lcg, log, parseArgs, requireBuild, sleep, summarize, writeResult } from './lib/common.mjs';
import { startReceiver, startVite } from './lib/servers.mjs';
import { act, script } from './perf.mjs';

const MB = 1024 * 1024;

async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const h = await cdp.send('Runtime.getHeapUsage');
  return { used: h.usedSize / MB, embedder: (h.embedderHeapUsedSize ?? 0) / MB };
}

async function session(server, { pageName, mode, durationS, sampleS, ticker }) {
  const { browser } = await launch();
  const { page, cdp } = await newPage(browser, { throttle: 1 });
  await cdp.send('HeapProfiler.enable');
  try {
    const q = [server.query.replace(/^\?/, ''), ticker ? `ticker=${ticker}` : ''].filter(Boolean).join('&');
    await page.goto(server.url + (q ? `?${q}` : ''), { timeout: 120_000 });
    await waitReady(page, { pageName, mode });
    const t0 = Date.now();
    const samples = [{ t: 0, ...(await heap(cdp)) }];
    let stop = false;
    // Sürekli etkileşim (perf betiği döngüde, ~700 ms tempo).
    const driver = (async () => {
      const actions = script(pageName, 10_000);
      const rand = lcg(99);
      for (const a of actions) {
        if (stop) break;
        await act(page, a, 10_000).catch(() => {});
        await sleep(550 + Math.floor(rand() * 300));
      }
    })();
    let next = sampleS;
    while ((Date.now() - t0) / 1000 < durationS) {
      await sleep(Math.max(0, t0 + next * 1000 - Date.now()));
      const h = await heap(cdp);
      const bufferText = mode === 'on' ? await page.locator('[data-rw="buffer-seconds"]').textContent().catch(() => null) : null;
      samples.push({ t: (Date.now() - t0) / 1000, ...h, buffer: bufferText });
      next += sampleS;
    }
    stop = true;
    await driver;
    const b = await collect(page);
    const isCheckout = (l) => b.checkouts.some((c) => l.start < c.to && l.start + l.duration > c.from);
    const lts = b.longtasks.filter((l) => l.start > 0);
    let memoryWarning = null;
    if (mode === 'on') {
      // Kısayol metin girişindeyken tetiklenmez (FR-UI-02).
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.keyboard.press('Alt+Shift+KeyR');
      await page.locator('[data-rw="panel"]').waitFor({ timeout: 30_000 });
      memoryWarning = await page.locator('[data-rw="panel"] .rw-strip-warn', { hasText: /50 MB/ }).count().then((n) => n > 0);
    }
    return {
      pageName,
      mode,
      samples,
      checkouts: b.checkouts.length,
      longTasks: { checkout: lts.filter(isCheckout).map((l) => l.duration), nonCheckout: lts.filter((l) => !isCheckout(l)).map((l) => l.duration) },
      memoryWarning,
    };
  } finally {
    await browser.close();
  }
}

function analyse(on, off) {
  const n = Math.min(on.samples.length, off.samples.length);
  const delta = [];
  for (let i = 0; i < n; i++) delta.push({ t: Math.round(on.samples[i].t), on: on.samples[i].used, off: off.samples[i].used, delta: on.samples[i].used - off.samples[i].used, deltaEmbedder: on.samples[i].embedder - off.samples[i].embedder });
  const after = (s) => delta.filter((d) => d.t >= s).map((d) => d.delta);
  const window = (a, b) => delta.filter((d) => d.t >= a && d.t < b).map((d) => d.delta);
  const steady = after(90);
  const early = window(90, 135);
  const late = window(135, 1e9);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);
  return {
    series: delta,
    maxDeltaMB: Math.max(...delta.map((d) => d.delta)),
    steadyDeltaMB: summarize(steady),
    growthLateVsEarlyMB: mean(late) - mean(early),
    bounded: steady.length > 0 ? mean(late) - mean(early) < 5 : null,
    onFinalMB: on.samples.at(-1)?.used,
    offFinalMB: off.samples.at(-1)?.used,
    memoryWarning: on.memoryWarning,
    naturalCheckouts: on.checkouts,
    checkoutLongTasks: summarize(on.longTasks.checkout),
    nonCheckoutLongTasksOn: summarize(on.longTasks.nonCheckout),
    nonCheckoutLongTasksOff: summarize(off.longTasks.nonCheckout),
  };
}

export async function runMem(opts = parseArgs()) {
  requireBuild();
  const durationS = Number(opts.raw.duration ?? (opts.quick ? 60 : 180));
  const sampleS = Number(opts.raw.sample ?? 10);
  const scenarios = [
    ...opts.pages.map((p) => ({ name: p, pageName: p, ticker: 0 })),
    ...(String(opts.raw.stress ?? '1') !== '0' && opts.pages.includes('list') ? [{ name: 'stress', pageName: 'list', ticker: 100 }] : []),
  ];
  const rx = await startReceiver();
  const { browser, version } = await launch();
  await browser.close();
  const out = { nfr: 'NFR-MEM-01', env: environment(version), params: { durationS, sampleS, bufferSeconds: 60, throttle: 1, parallelOnOff: true, quick: opts.quick }, results: [] };
  try {
    for (const sc of scenarios) {
      const servers = { on: await startVite({ page: sc.pageName, mode: 'on', endpoint: rx.endpoint }), off: await startVite({ page: sc.pageName, mode: 'off', endpoint: rx.endpoint }) };
      try {
        log(`MEM ${sc.name}: ${durationS} sn (açık ve kapalı eşzamanlı)`);
        const [on, off] = await Promise.all(['on', 'off'].map((mode) => session(servers[mode], { pageName: sc.pageName, mode, durationS, sampleS, ticker: sc.ticker })));
        const a = analyse(on, off);
        log(`  fark (açık−kapalı) en çok ${a.maxDeltaMB.toFixed(1)} MB · 90 sn sonrası medyan ${a.steadyDeltaMB.median?.toFixed(1)} MB · son/ilk yarı büyüme ${a.growthLateVsEarlyMB?.toFixed(1)} MB · checkout ${a.naturalCheckouts} (long task medyan ${a.checkoutLongTasks.median?.toFixed(0)} ms) · uyarı ${a.memoryWarning}`);
        out.results.push({ scenario: sc.name, ticker: sc.ticker, ...a, raw: { on, off } });
      } finally {
        await servers.on.close();
        await servers.off.close();
      }
    }
  } finally {
    await rx.close();
  }
  return out;
}

if (isMain(import.meta.url)) {
  const opts = parseArgs();
  const out = await runMem(opts);
  log(`Sonuç: ${writeResult('mem', out, opts.out)}`);
}
