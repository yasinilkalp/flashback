#!/usr/bin/env node
/**
 * İnceleme deneyleri (frd/07-nfr-olcumleri.md "Neden" bölümündeki iddiaları yeniden üretmek ve düzeltmeleri
 * doğrulamak için). Paket DEĞİŞTİRİLMEZ; deney koşulları sayfa içinden kurulur.
 *
 *   node scripts/bench/investigate.mjs ablate [--page=demo] [--throttle=4] [--runs=4] [--pace=700] [--interactions=50]
 *        [--variants=off,on,rrweb,on-noanim]
 *     Etkileşim gecikmesi: kayıt kapalı · tam Flashback · yalnızca rrweb (Flashback'in seçenekleriyle) ·
 *     Flashback + başlatıcıdaki sonsuz "kayıt" animasyonu kapatılmış (shadow root'a stil eklenir).
 *
 *   node scripts/bench/investigate.mjs replay [--throttle=4] [--fill=55]
 *     5.000 öğeli listede ~25 sn'lik dilimi rrweb Replayer ile sona sarma süresi: useVirtualDom true (Flashback'in
 *     kullandığı rrweb varsayılanı) ve false. Panel açılışının (Timeline.tsx) baskın maliyeti budur.
 */
import { launch, newPage, waitReady } from './lib/browser.mjs';
import { isMain, log, parseArgs, percentile, summarize } from './lib/common.mjs';
import { startReceiver, startVite } from './lib/servers.mjs';
import { act, oneRun, script } from './perf.mjs';

const PREPARE = {
  'on-noanim': (page) =>
    page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.fb-dot.fb-rec { animation: none !important; }';
      document.querySelector('flashback-devtools').shadowRoot.appendChild(st);
    }),
};
const modeOf = (v) => (v.startsWith('on') ? 'on' : v);

async function ablate(a) {
  const pageName = a.page ?? 'demo';
  const throttle = Number(a.throttle ?? 4);
  const runs = Number(a.runs ?? 4);
  const pace = Number(a.pace ?? 700);
  const interactions = Number(a.interactions ?? 50);
  const variants = String(a.variants ?? 'off,on,rrweb,on-noanim').split(',');
  const rx = await startReceiver();
  const { browser } = await launch();
  const servers = {};
  try {
    for (const m of new Set(variants.map(modeOf))) servers[m] = await startVite({ page: pageName, mode: m, endpoint: rx.endpoint });
    for (const v of variants) {
      const s = servers[modeOf(v)];
      await oneRun(browser, { pageName, mode: modeOf(v), throttle: 1, url: s.url + s.query, interactions: 3, settleMs: 300, checkoutSamples: 0, pace: 100 });
    }
    const res = Object.fromEntries(variants.map((v) => [v, []]));
    for (let i = 0; i < runs; i++) {
      for (const v of i % 2 ? [...variants].reverse() : variants) {
        const s = servers[modeOf(v)];
        const r = await oneRun(browser, { pageName, mode: modeOf(v), throttle, url: s.url + s.query, interactions, settleMs: 2500, checkoutSamples: 0, pace, prepare: PREPARE[v] });
        res[v].push(r);
        log(`${v} koşu ${i + 1}: INP ${r.inp} ms, etkileşim p75 ${percentile(r.latencies, 75)} ms`);
      }
    }
    const out = {};
    for (const v of variants) {
      const lat = res[v].flatMap((r) => r.latencies);
      out[v] = { inpP75: percentile(res[v].map((r) => r.inp), 75), latency: summarize(lat) };
      log(`${v.padEnd(10)} INP p75 ${out[v].inpP75} ms · etkileşim medyan ${out[v].latency.median} / p75 ${out[v].latency.p75} / ort. ${out[v].latency.mean.toFixed(1)} ms`);
    }
    return out;
  } finally {
    await browser.close();
    for (const s of Object.values(servers)) await s.close();
    await rx.close();
  }
}

async function replay(a) {
  const throttle = Number(a.throttle ?? 4);
  const fillS = Number(a.fill ?? 55);
  const { browser } = await launch();
  const v = await startVite({ page: 'list', mode: 'rrweb' });
  try {
    const { page } = await newPage(browser, { throttle });
    await page.goto(v.url);
    await waitReady(page, { pageName: 'list', mode: 'rrweb' });
    const actions = script('list', 1000);
    const end = Date.now() + fillS * 1000;
    for (let i = 0; Date.now() < end || i % 10; i++) {
      await act(page, actions[i], 10_000).catch(() => {});
      await page.waitForTimeout(600);
    }
    const r = await page.evaluate(async () => {
      // Probe ile aynı optimize edilmiş rrweb modülü.
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /deps\/rrweb\.js/.test(n));
      const { Replayer } = await import(url);
      const events = window.__benchShim.events.slice();
      const total = events.at(-1).timestamp - events[0].timestamp;
      const res = { events: events.length, sliceMs: total, virtualDom: [], direct: [] };
      for (let i = 0; i < 6; i++) {
        for (const useVirtualDom of i % 2 ? [false, true] : [true, false]) {
          const root = document.createElement('div');
          root.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:800px;overflow:hidden;opacity:0.01;pointer-events:none';
          document.body.appendChild(root);
          await new Promise((res2) => setTimeout(res2, 300));
          const t0 = performance.now();
          // Timeline.tsx ile aynı seçenekler (+ useVirtualDom).
          const rep = new Replayer(events, { root, mouseTail: false, showWarning: false, showDebug: false, skipInactive: false, triggerFocus: false, speed: 1, useVirtualDom });
          rep.pause(total);
          (useVirtualDom ? res.virtualDom : res.direct).push(performance.now() - t0);
          rep.destroy();
          root.remove();
        }
      }
      return res;
    });
    const out = { throttle, events: r.events, sliceS: r.sliceMs / 1000, useVirtualDomTrue: summarize(r.virtualDom), useVirtualDomFalse: summarize(r.direct) };
    log(`${throttle}x, ${out.sliceS.toFixed(1)} sn dilim: useVirtualDom true medyan ${out.useVirtualDomTrue.median.toFixed(0)} ms · false medyan ${out.useVirtualDomFalse.median.toFixed(0)} ms`);
    return out;
  } finally {
    await browser.close();
    await v.close();
  }
}

if (isMain(import.meta.url)) {
  const cmd = process.argv[2];
  const a = parseArgs(process.argv.slice(3)).raw;
  if (cmd === 'ablate') await ablate(a);
  else if (cmd === 'replay') await replay(a);
  else {
    console.error('Kullanım: node scripts/bench/investigate.mjs ablate|replay [seçenekler]');
    process.exit(1);
  }
}
