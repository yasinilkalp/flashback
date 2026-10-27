#!/usr/bin/env node
/**
 * NFR-PERF-01 — kayıt açık/kapalı INP farkı, kayıttan kaynaklanan long task'lar, 5.000 düğümde checkout süresi.
 *
 *   node scripts/bench/perf.mjs [--runs=5] [--throttle=1,4] [--pages=demo,list] [--interactions=50] [--pace=700]
 *                               [--modes=on,off[,rrweb]] [--quick]
 *
 * Her (sayfa × kısma) için kayıt açık ve kapalı koşular dönüşümlü yapılır (açık/kapalı sırası her koşuda yer
 * değiştirir; kayma etkisi dağılır). Her koşu yeni bir tarayıcı bağlamında sayfayı yükler, hazır olunca 2 sn
 * (4x'te 3 sn) bekler ve aynı belirlenimci etkileşim betiğini (varsayılan 50 etkileşim) uygular.
 *
 * Ölçümler:
 *  - Etkileşim gecikmesi: her etkileşimin penceresindeki (eylemden hemen önce → eylemden sonraki 2. kare) Event
 *    Timing girdilerinin (interactionId > 0) en büyük süresi. 16 ms eşiğinin altındaki etkileşimler 16 ms sayılır.
 *  - INP (koşu başına): web-vitals tanımı — her 50 etkileşimde en kötü 1 tanesi atlanır (p98 tahmini).
 *    Etkileşimler sabit tempoda (varsayılan 700 ms) yapılır; koşu ≈ 35 sn sürer ve doğal checkout'u (30 sn) içerir.
 *    Checkout'u tetikleyen etkileşimin gecikmesi ayrıca ve "checkout hariç INP" olarak da raporlanır.
 *  - INP p75: koşuların INP değerlerinin 75. yüzdeliği (CrUX'taki "p75" ile aynı anlam). Artış = açık − kapalı.
 *    Ek olarak tüm etkileşim gecikmelerinin havuzlanmış p75'i ve eylem türüne göre döküm verilir.
 *  - Long task: ölçüm penceresindeki > 50 ms görevler; checkout aralığıyla çakışanlar ayrı sayılır.
 *    "Kayıttan kaynaklanan" = (a) kayıt açıkken etkileşim dışında (boşta) görülen checkout dışı long task'lar
 *    + (b) etkileşim sırası bazında: kayıt açık koşuların çoğunluğunda long task olup kapalı koşuların
 *    çoğunluğunda olmayan etkileşimler.
 *  - Checkout: kayıt açık koşuların sonunda `record.takeFullSnapshot(true)` (Flashback'in canlı kaydı; emit → halka
 *    tampon → boyut tahmini dahil) 3 kez zamanlanır. Liste sayfasında ayrıca maliyet dökümü (inceleme adımı).
 */
import { collect, launch, newPage, nextFrames, pageNow, waitReady } from './lib/browser.mjs';
import { environment, isMain, lcg, log, parseArgs, percentile, requireBuild, sleep, summarize, writeResult } from './lib/common.mjs';
import { startReceiver, startVite } from './lib/servers.mjs';

const MIN_EVENT_MS = 16;

/** Etkileşim betikleri (belirlenimci). `label` eylem türüne göre döküm içindir. */
export function script(pageName, count) {
  const cycle =
    pageName === 'demo'
      ? [
          { click: '[data-testid="add-1"]', label: 'sepete ekle' },
          { click: '[data-testid="add-2"]', label: 'sepete ekle' },
          { click: '[data-testid="add-3"]', label: 'sepete ekle' },
          { click: '#coupon', label: 'odak' },
          { press: 'ControlOrMeta+a', label: 'tuş' },
          { press: 'Backspace', label: 'tuş' },
          { press: 'Y', label: 'tuş' },
          { press: 'A', label: 'tuş' },
          { press: 'Z', label: 'tuş' },
          { press: '1', label: 'tuş' },
          { press: '0', label: 'tuş' },
          { click: 'form button[type="submit"]', label: 'kupon uygula (fetch)' },
          { click: 'nav a[href="/account"]', label: 'sayfa geçişi' },
          { click: 'nav a[href="/"]', label: 'sayfa geçişi' },
        ]
      : [
          { click: 'li[data-i="1"]', label: 'satır seç' },
          { click: 'li[data-i="3"]', label: 'satır seç' },
          { click: 'li[data-i="5"]', label: 'satır seç' },
          { click: '#bump', label: '100 satır güncelle' },
          { click: 'li[data-i="1"]', label: 'satır seç' },
          { click: '#filter', label: 'odak' },
          { press: '1', label: 'filtre (binlerce hidden)' },
          { press: 'Backspace', label: 'filtre (binlerce hidden)' },
          { click: '#bump', label: '100 satır güncelle' },
          { click: 'li[data-i="7"]', label: 'satır seç' },
        ];
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length]);
}

/** Betik döngüsünün uzunluğu (sürekli etkinlik döngü sınırında bitmeli: filtre temizlenmiş, demo "/" sayfasında). */
export const cycleLength = (pageName) => (pageName === 'demo' ? 14 : 10);

export async function act(page, a, timeout = 60_000) {
  if (a.click) await page.locator(a.click).first().click({ timeout });
  else await page.keyboard.press(a.press);
}

/** web-vitals INP: etkileşim sayısının her 50'si için en kötü 1 tanesini atla. */
export function inpOf(latencies, interactionCount = latencies.length) {
  const sorted = [...latencies].sort((a, b) => b - a);
  if (!sorted.length) return MIN_EVENT_MS;
  return sorted[Math.min(sorted.length - 1, Math.floor(interactionCount / 50))];
}

const overlaps = (lt, from, to) => lt.start < to && lt.start + lt.duration > from;

export async function oneRun(browser, { pageName, mode, throttle, url, interactions, settleMs, checkoutSamples, pace = 700, prepare }) {
  const { context, page } = await newPage(browser, { throttle });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(url, { timeout: 120_000 });
    await waitReady(page, { pageName, mode });
    // İnceleme deneyleri için kanca (ör. panel stilini değiştirmek); normal ölçümde yoktur.
    if (prepare) await prepare(page);
    await sleep(settleMs);
    await nextFrames(page);
    const begin = await pageNow(page);
    const rand = lcg(1234);
    const actions = script(pageName, interactions);
    const windows = [];
    const t0 = Date.now();
    for (const [i, a] of actions.entries()) {
      // Sabit tempo (varsayılan 700 ms ± 100): 50 etkileşim ≈ 35 sn → her koşu en az bir doğal checkout
      // (bufferSeconds/2 = 30 sn) içerir. Geride kalınırsa beklemeden devam edilir.
      await sleep(Math.max(0, t0 + i * pace + Math.floor(rand() * 200) - 100 - Date.now()));
      const from = await pageNow(page);
      await act(page, a);
      await nextFrames(page);
      const to = await pageNow(page);
      windows.push({ from, to, label: a.label });
    }
    await sleep(500);
    await nextFrames(page);
    const end = await pageNow(page);
    const b = await collect(page);

    const latencies = windows.map((w) =>
      Math.max(MIN_EVENT_MS, ...b.events.filter((e) => e.id > 0 && e.start >= w.from && e.start <= w.to).map((e) => e.duration)),
    );

    // Doğal checkout'un tetiklendiği etkileşimler (rrweb checkout'u bir sonraki kayıt olayında, çoğu zaman bir
    // etkileşimin içinde alır).
    const withCheckout = windows.map((w) => b.checkouts.some((c) => c.to >= w.from && c.from <= w.to));
    const latNoCheckout = latencies.filter((_, i) => !withCheckout[i]);

    const lts = b.longtasks.filter((l) => l.start >= begin && l.start <= end);
    const isCheckout = (l) => b.checkouts.some((c) => overlaps(l, c.from, c.to));
    const nonCheckout = lts.filter((l) => !isCheckout(l));
    const checkoutLts = lts.filter(isCheckout);
    const idleNonCheckout = nonCheckout.filter((l) => !windows.some((w) => overlaps(l, w.from, w.to)));
    const perInteraction = windows.map((w) => Math.max(0, ...nonCheckout.filter((l) => overlaps(l, w.from, w.to)).map((l) => l.duration)));

    const result = {
      mode,
      interactions,
      interactionCount: b.interactionCount,
      inp: inpOf(latencies),
      inpNoCheckout: inpOf(latNoCheckout, latencies.length),
      latencies,
      withCheckout,
      checkoutInteractionLatencies: latencies.filter((_, i) => withCheckout[i]),
      labels: windows.map((w) => w.label),
      longTasks: {
        total: lts.length,
        checkout: checkoutLts.length,
        nonCheckout: nonCheckout.length,
        nonCheckoutMax: Math.max(0, ...nonCheckout.map((l) => l.duration)),
        idleNonCheckout: idleNonCheckout.map((l) => l.duration),
        checkoutDurations: checkoutLts.map((l) => l.duration),
        totalBlockingMs: nonCheckout.reduce((s, l) => s + l.duration - 50, 0),
      },
      perInteractionLongTask: perInteraction,
      naturalCheckouts: b.checkouts.filter((c) => c.to >= begin && c.from <= end).length,
      durationMs: end - begin,
      errors,
    };

    if (mode === 'on' && checkoutSamples > 0) {
      result.checkout = await page.evaluate(async (n) => {
        const r = window.__benchRecord;
        const out = { takeFullSnapshot: [], stringify: [], bytes: 0, mirrorNodes: r.mirror.getIds().length, domElements: document.getElementsByTagName('*').length };
        for (let i = 0; i < n; i++) {
          await new Promise((res) => setTimeout(res, 300));
          const t0 = performance.now();
          r.takeFullSnapshot(true);
          out.takeFullSnapshot.push(performance.now() - t0);
          const t1 = performance.now();
          const s = JSON.stringify(r.mirror.getMeta(document));
          out.stringify.push(performance.now() - t1);
          out.bytes = s.length * 2;
        }
        return out;
      }, checkoutSamples);
    }
    return result;
  } finally {
    await context.close();
  }
}

/**
 * İnceleme: checkout maliyetinin dökümü (liste sayfası). Aynı belge üzerinde, ayrı bir Mirror ile:
 *  A) rrweb-snapshot `snapshot()` — Flashback'in seçenekleriyle (blockSelector, maskTextSelector, tüm giriş türleri maskeli)
 *  B) aynı, seçiciler olmadan (rrweb varsayılanı)
 *  C) A'nın sonucunun JSON.stringify'ı (Flashback `estimateEventBytes` her olayda bunu yapar)
 *  D) canlı `record.takeFullSnapshot(true)` (rrweb + Flashback emit/halka tampon)
 */
async function checkoutBreakdown(browser, { url, throttle, rounds = 5 }) {
  const { context, page } = await newPage(browser, { throttle });
  try {
    await page.goto(url, { timeout: 120_000 });
    await waitReady(page, { pageName: 'list', mode: 'on' });
    await sleep(1500);
    return await page.evaluate(async (n) => {
      const lib = await window.__benchSnapshotLib();
      const rec = window.__benchRecord;
      const ALL = { color: true, date: true, 'datetime-local': true, email: true, month: true, number: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true, textarea: true, select: true, password: true };
      const pause = () => new Promise((r) => setTimeout(r, 200));
      const time = (fn) => {
        const t0 = performance.now();
        const v = fn();
        return [performance.now() - t0, v];
      };
      const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const res = { flashbackOptions: [], noSelectors: [], stringify: [], live: [] };
      for (let i = -1; i < n; i++) {
        if (i === 0) for (const k of Object.keys(res)) res[k] = [];
        await pause();
        const [a, tree] = time(() => lib.snapshot(document, { mirror: lib.createMirror(), blockSelector: '[data-flashback-block], [data-flashback-ui]', maskTextSelector: '[data-flashback-mask]', maskAllInputs: ALL, maskInputFn: (t) => t }));
        res.flashbackOptions.push(a);
        await pause();
        res.noSelectors.push(time(() => lib.snapshot(document, { mirror: lib.createMirror() }))[0]);
        await pause();
        res.stringify.push(time(() => JSON.stringify(tree))[0]);
        await pause();
        res.live.push(time(() => rec.takeFullSnapshot(true))[0]);
      }
      return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { median: med(v), samples: v }]));
    }, rounds);
  } finally {
    await context.close();
  }
}

export async function runPerf(opts = parseArgs()) {
  requireBuild();
  const interactions = Number(opts.raw.interactions ?? (opts.quick ? 20 : 50));
  const runs = opts.quick ? Math.min(opts.runs, 2) : opts.runs;
  const pace = Number(opts.raw.pace ?? 700);
  // `--modes=on,off,rrweb`: rrweb = ayrıştırma kipi (yalnızca rrweb, Flashback eklentileri yok; lib/shim-rrweb.js).
  const modes = String(opts.raw.modes ?? 'on,off').split(',');
  const rx = await startReceiver();
  const { browser, version } = await launch();
  const out = { nfr: 'NFR-PERF-01', env: environment(version), params: { runs, interactions, pace, modes, throttles: opts.throttles, pages: opts.pages, quick: opts.quick }, results: [], breakdown: [] };
  try {
    for (const pageName of opts.pages) {
      const servers = {};
      for (const mode of modes) servers[mode] = await startVite({ page: pageName, mode, endpoint: rx.endpoint });
      try {
        // Isınma: Vite bağımlılık optimizasyonu ve önbellek ilk yüklemede olur; ölçüme girmez.
        for (const mode of modes) {
          const s = servers[mode];
          await oneRun(browser, { pageName, mode, throttle: 1, url: s.url + s.query, interactions: 3, settleMs: 500, checkoutSamples: 0, pace: 100 });
        }
        for (const throttle of opts.throttles) {
          const settleMs = throttle > 1 ? 3000 : 2000;
          const runsBy = Object.fromEntries(modes.map((m) => [m, []]));
          for (let i = 0; i < runs; i++) {
            // Sıra her koşuda döner (açık, kapalı → kapalı, açık …); kayma etkisi kiplere eşit dağılır.
            for (const mode of i % 2 === 0 ? modes : [...modes].reverse()) {
              const s = servers[mode];
              log(`PERF ${pageName} ${throttle}x ${mode} koşu ${i + 1}/${runs}`);
              const r = await oneRun(browser, { pageName, mode, throttle, url: s.url + s.query, interactions, settleMs, checkoutSamples: 3, pace });
              log(`  INP ${r.inp} ms (checkout hariç ${r.inpNoCheckout}) · doğal checkout ${r.naturalCheckouts}${r.checkoutInteractionLatencies.length ? ` → o etkileşim ${r.checkoutInteractionLatencies.join('/')} ms` : ''} · etkileşim p75 ${percentile(r.latencies, 75)} ms · long task ${r.longTasks.total} (checkout ${r.longTasks.checkout}) · ${Math.round(r.durationMs / 1000)} sn${r.checkout ? ` · checkout ${r.checkout.takeFullSnapshot.map((x) => x.toFixed(0)).join('/')} ms` : ''}`);
              runsBy[mode].push(r);
            }
          }
          out.results.push({ page: pageName, throttle, summary: summarizePerf(runsBy), runs: runsBy });
          if (pageName === 'list') {
            log(`PERF ${pageName} ${throttle}x checkout dökümü`);
            out.breakdown.push({ page: pageName, throttle, ...(await checkoutBreakdown(browser, { url: servers.on.url + servers.on.query, throttle, rounds: opts.quick ? 3 : 7 })) });
          }
        }
      } finally {
        for (const s of Object.values(servers)) await s.close();
      }
    }
  } finally {
    await browser.close();
    await rx.close();
  }
  return out;
}

function byLabel(runs) {
  const m = {};
  for (const r of runs) r.latencies.forEach((v, i) => (m[r.labels[i]] ??= []).push(v));
  return m;
}

export function summarizePerf({ on, off, rrweb }) {
  const inpOn = summarize(on.map((r) => r.inp));
  const inpOff = summarize(off.map((r) => r.inp));
  const inpOnNoCheckout = summarize(on.map((r) => r.inpNoCheckout));
  const latOn = summarize(on.flatMap((r) => r.latencies));
  const latOff = summarize(off.flatMap((r) => r.latencies));
  const lOn = byLabel(on);
  const lOff = byLabel(off);
  const perAction = Object.fromEntries(
    Object.keys(lOn).map((k) => [k, { n: lOn[k].length, p75On: percentile(lOn[k], 75), p75Off: percentile(lOff[k] ?? [], 75), medianOn: percentile(lOn[k], 50), medianOff: percentile(lOff[k] ?? [], 50) }]),
  );
  // Etkileşim sırası bazında çoğunluk karşılaştırması.
  const n = Math.min(...on.map((r) => r.perInteractionLongTask.length), ...off.map((r) => r.perInteractionLongTask.length));
  const majority = (rs, i) => rs.filter((r) => r.perInteractionLongTask[i] > 50).length > rs.length / 2;
  const induced = [];
  for (let i = 0; i < n; i++) if (majority(on, i) && !majority(off, i)) induced.push({ index: i, label: on[0].labels[i] });
  const idle = on.flatMap((r) => r.longTasks.idleNonCheckout);
  const ltOn = on.map((r) => r.longTasks);
  const ltOff = off.map((r) => r.longTasks);
  const co = on.filter((r) => r.checkout).map((r) => r.checkout);
  const cos = co.flatMap((c) => c.takeFullSnapshot);
  return {
    inpOn,
    inpOff,
    inpP75Increase: inpOn.p75 - inpOff.p75,
    inpOnNoCheckout,
    inpP75IncreaseNoCheckout: inpOnNoCheckout.p75 - inpOff.p75,
    checkoutInteractions: summarize(on.flatMap((r) => r.checkoutInteractionLatencies)),
    naturalCheckoutsPerRun: summarize(on.map((r) => r.naturalCheckouts)),
    latencyOn: latOn,
    latencyOff: latOff,
    latencyP75Increase: latOn.p75 - latOff.p75,
    perAction,
    longTasks: {
      onNonCheckoutPerRun: summarize(ltOn.map((l) => l.nonCheckout)),
      offPerRun: summarize(ltOff.map((l) => l.nonCheckout)),
      onNonCheckoutMax: Math.max(0, ...ltOn.map((l) => l.nonCheckoutMax)),
      offMax: Math.max(0, ...ltOff.map((l) => l.nonCheckoutMax)),
      onBlockingMsPerRun: summarize(ltOn.map((l) => l.totalBlockingMs)),
      offBlockingMsPerRun: summarize(ltOff.map((l) => l.totalBlockingMs)),
      idleNonCheckoutOn: { count: idle.length, max: Math.max(0, ...idle) },
      induced,
      recordingAttributable: idle.length + induced.length,
      naturalCheckoutLongTasks: on.flatMap((r) => r.longTasks.checkoutDurations),
    },
    checkout: cos.length
      ? { takeFullSnapshot: summarize(cos), stringify: summarize(co.flatMap((c) => c.stringify)), snapshotBytes: co[0].bytes, mirrorNodes: co[0].mirrorNodes, domElements: co[0].domElements }
      : null,
    ...(rrweb?.length
      ? {
          ablation: {
            inpRrwebOnly: summarize(rrweb.map((r) => r.inp)),
            latencyRrwebOnly: summarize(rrweb.flatMap((r) => r.latencies)),
            perActionP75RrwebOnly: Object.fromEntries(Object.entries(byLabel(rrweb)).map(([k, v]) => [k, percentile(v, 75)])),
            perActionMedianRrwebOnly: Object.fromEntries(Object.entries(byLabel(rrweb)).map(([k, v]) => [k, percentile(v, 50)])),
          },
        }
      : {}),
    errors: [...on, ...off].flatMap((r) => r.errors).slice(0, 5),
  };
}

if (isMain(import.meta.url)) {
  const opts = parseArgs();
  const out = await runPerf(opts);
  const file = writeResult('perf', out, opts.out);
  for (const r of out.results) {
    const s = r.summary;
    log(`${r.page} ${r.throttle}x: INP p75 açık ${s.inpOn.p75} / kapalı ${s.inpOff.p75} → artış ${s.inpP75Increase} ms; kayıttan kaynaklanan long task ${s.longTasks.recordingAttributable}; checkout medyan ${s.checkout?.takeFullSnapshot.median?.toFixed(1)} ms`);
  }
  log(`Sonuç: ${file}`);
}
