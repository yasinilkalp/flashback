#!/usr/bin/env node
/**
 * NFR-LAT-01 — panel açılışı ≤ 500 ms · kaydet → alıcı onayı p95 ≤ 2 sn · ajanın sorusu panelde ≤ 5 sn.
 *
 *   node scripts/bench/lat.mjs [--samples=8] [--throttle=1,4] [--pages=demo,list] [--fill=65] [--quick]
 *
 * Gerçek alıcı kullanılır: `packages/mcp/dist/cli.js` (stdio MCP + HTTP alıcı, geçici proje klasörü). "Ajan",
 * MCP istemcisi olarak `reply_to_incident` aracını çağırır.
 *
 * Her (sayfa × kısma) için: sayfa yüklenir, tampon dolsun diye `--fill` sn (varsayılan 65 sn ≥ bufferSeconds)
 * sürekli etkileşim yapılır. Ardından `--samples` döngü: 5 sn etkileşim → kısayol (Alt+Shift+R) → panel →
 * "Sayfa düzeyi olay" → beklenen davranış → Kaydet → onay → panel kapatılır.
 *  - Panel açılışı: keydown olayının zaman damgası → panelin (ve tekrar oynatma iframe'inin) bulunduğu karenin
 *    ardından gelen ilk rAF (≈ o karenin ekrana basıldığı an). Panel açılışı tamponun tamamını Replayer ile
 *    oynattığı için dolu tamponla ölçülür.
 *  - Kaydet → onay: Kaydet tıklamasının zaman damgası → `[data-rw="incident-id"]` DOM'a girdiği an. Oturumdaki ilk
 *    gönderimde önizleme zorunludur (FR-UI-08); o örnekte "Kaydet → önizleme" ve "Gönder → onay" ayrı raporlanır.
 *  - Ajan sorusu (yalnızca demo): panel Kayıtlar sekmesindeyken, 0–3 sn rastgele bekleme (yoklama fazını
 *    örneklemek için) → `reply_to_incident` çağrısı → mesajın panel DOM'una girdiği an (Date.now, aynı makine saati).
 */
import { launch, newPage, waitReady } from './lib/browser.mjs';
import { environment, isMain, lcg, log, parseArgs, requireBuild, sleep, summarize, writeResult } from './lib/common.mjs';
import { startReceiver, startVite } from './lib/servers.mjs';
import { act, cycleLength, script } from './perf.mjs';

const SHADOW = () => document.querySelector('rewind-devtools')?.shadowRoot;

/** Sayfa içi ölçüm kancaları (bir kez). */
async function installHooks(page) {
  await page.evaluate(() => {
    const L = (window.__lat = { open: [], save: [] });
    const root = () => document.querySelector('rewind-devtools').shadowRoot;
    window.addEventListener(
      'keydown',
      (e) => {
        // Bench kısayolu yalnızca açmak için kullanır (kapatma: ✕ düğmesi). Rewind'in dinleyicisi bundan önce
        // kayıtlı olduğundan panel burada zaten (eşzamanlı) çizilmiş olabilir; ölçüm olayın zaman damgasından başlar.
        if (!(e.code === 'KeyR' && e.altKey && e.shiftKey)) return;
        const rec = { kd: e.timeStamp, shellFrame: null, replayFrame: null, painted: null, replayPainted: null };
        L.open.push(rec);
        const tick = (ts) => {
          const r = root();
          const panel = r.querySelector('[data-rw="panel"]');
          const iframe = r.querySelector('.rw-replay iframe');
          if (rec.shellFrame !== null && rec.painted === null) rec.painted = ts;
          if (rec.replayFrame !== null && rec.replayPainted === null) rec.replayPainted = ts;
          if (panel && rec.shellFrame === null) rec.shellFrame = ts;
          if (iframe?.contentDocument?.body?.childElementCount && rec.replayFrame === null) rec.replayFrame = ts;
          if (rec.replayPainted === null || rec.painted === null) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      true,
    );
    window.addEventListener(
      'click',
      (e) => {
        const el = e.composedPath()[0];
        const rw = el instanceof Element ? el.closest('[data-rw]')?.getAttribute('data-rw') : null;
        if (rw !== 'save' && rw !== 'send') return;
        const rec = { kind: rw, click: e.timeStamp, preview: null, ack: null };
        L.save.push(rec);
        const r = root();
        const check = () => {
          if (rec.preview === null && r.querySelector('[data-rw="preview-view"]')) rec.preview = performance.now();
          if (rec.ack === null && r.querySelector('[data-rw="incident-id"]')) rec.ack = performance.now();
          return rec.ack !== null || (rw === 'save' && rec.preview !== null);
        };
        const mo = new MutationObserver(() => check() && mo.disconnect());
        mo.observe(r, { subtree: true, childList: true });
      },
      true,
    );
  });
}

/** En az `ms` süre etkileşim; döngü sınırında biter (liste filtresi temizlenmiş, demo ana sayfada kalır). */
async function activity(page, pageName, ms, state) {
  const end = Date.now() + ms;
  const len = cycleLength(pageName);
  while (Date.now() < end || state.i % len !== 0) {
    await act(page, state.actions[state.i++ % state.actions.length], 10_000).catch(() => {});
    await sleep(550 + Math.floor(state.rand() * 300));
  }
  // Kısayol metin girişindeyken tetiklenmez (FR-UI-02); odağı bırak.
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

async function config(browser, server, rx, { pageName, throttle, samples, fillS, question }) {
  const { context, page } = await newPage(browser, { throttle });
  try {
    await page.goto(server.url + server.query, { timeout: 120_000 });
    await waitReady(page, { pageName, mode: 'on' });
    await page.locator('[data-rw="launcher"][data-receiver="connected"]').waitFor({ timeout: 30_000 });
    await installHooks(page);
    const state = { actions: script(pageName, 1000), i: 0, rand: lcg(5) };
    log(`LAT ${pageName} ${throttle}x: tampon dolduruluyor (${fillS} sn)`);
    await activity(page, pageName, fillS * 1000, state);
    let lastId = null;
    for (let s = 0; s < samples; s++) {
      await activity(page, pageName, 5000, state);
      await page.keyboard.press('Alt+Shift+KeyR');
      await page.locator('[data-rw="panel"]').waitFor({ timeout: 60_000 });
      await page.waitForFunction(() => {
        const o = window.__lat.open.at(-1);
        return o && o.painted !== null && o.replayPainted !== null;
      }, null, { timeout: 60_000 });
      await page.locator('[data-rw="page-level"]').click();
      await page.locator('[data-rw="expected"]').fill('Toplam 1380 ₺ olmalı (bench)');
      await page.locator('[data-rw="save"]').click();
      const preview = page.locator('[data-rw="preview-view"]');
      const idEl = page.locator('[data-rw="incident-id"]');
      await Promise.race([preview.waitFor({ timeout: 60_000 }), idEl.waitFor({ timeout: 60_000 })]);
      if (await preview.isVisible()) await page.locator('[data-rw="send"]').click();
      await idEl.waitFor({ timeout: 60_000 });
      lastId = (await idEl.textContent())?.trim();
      await page.locator('[data-rw="close"]').click();
      await page.locator('[data-rw="panel"]').waitFor({ state: 'detached' });
      const o = await page.evaluate(() => window.__lat.open.at(-1));
      log(`  örnek ${s + 1}/${samples}: panel ${(o.painted - o.kd).toFixed(0)} ms (tekrar oynatma ${(o.replayPainted - o.kd).toFixed(0)} ms)`);
    }
    const lat = await page.evaluate(() => window.__lat);

    let questions = [];
    if (question && lastId) {
      await page.keyboard.press('Alt+Shift+KeyR');
      await page.locator('[data-rw="tab-incidents"]').click();
      await page.locator(`[data-rw="incident"][data-id="${lastId}"]`).waitFor({ timeout: 30_000 });
      const rand = lcg(17);
      for (let q = 0; q < question; q++) {
        const token = `bench-soru-${q}-${Math.floor(rand() * 1e6)}`;
        await page.evaluate((tok) => {
          window.__q = null;
          const r = document.querySelector('rewind-devtools').shadowRoot;
          const found = () => [...r.querySelectorAll('[data-rw="message"]')].some((m) => m.textContent.includes(tok));
          const mo = new MutationObserver(() => {
            if (window.__q === null && found()) {
              window.__q = Date.now();
              mo.disconnect();
            }
          });
          mo.observe(r, { subtree: true, childList: true, characterData: true });
        }, token);
        await sleep(Math.floor(rand() * 3000));
        const t0 = Date.now();
        await rx.call('reply_to_incident', { id: lastId, message: `Bench sorusu: ${token}` });
        await page.waitForFunction(() => window.__q !== null, null, { timeout: 30_000, polling: 50 });
        const seen = await page.evaluate(() => window.__q);
        questions.push(seen - t0);
        log(`  soru ${q + 1}/${question}: ${seen - t0} ms`);
      }
    }

    const open = lat.open.filter((o) => o.painted !== null);
    const saves = lat.save;
    const first = saves[0];
    const firstSend = saves.find((x) => x.kind === 'send');
    const direct = saves.filter((x) => x.kind === 'save' && x.ack !== null);
    return {
      page: pageName,
      throttle,
      panelOpenMs: summarize(open.map((o) => o.painted - o.kd)),
      panelReplayReadyMs: summarize(open.map((o) => o.replayPainted - o.kd)),
      saveToAckMs: summarize(direct.map((x) => x.ack - x.click)),
      firstSend: first && firstSend ? { saveToPreviewMs: first.preview - first.click, sendToAckMs: firstSend.ack - firstSend.click } : null,
      questionToPanelMs: questions.length ? summarize(questions) : null,
      raw: { open, saves, questions },
    };
  } finally {
    await context.close();
  }
}

export async function runLat(opts = parseArgs()) {
  requireBuild();
  const samples = Number(opts.raw.samples ?? (opts.quick ? 3 : 8));
  const fillS = Number(opts.raw.fill ?? (opts.quick ? 15 : 65));
  const questions = Number(opts.raw.questions ?? (opts.quick ? 3 : 10));
  const rx = await startReceiver();
  const { browser, version } = await launch();
  const out = { nfr: 'NFR-LAT-01', env: environment(version), params: { samples, fillS, questions, throttles: opts.throttles, pages: opts.pages, quick: opts.quick, receiver: 'rewind-mcp (gerçek, stdio + HTTP)' }, results: [] };
  try {
    for (const pageName of opts.pages) {
      const server = await startVite({ page: pageName, mode: 'on', endpoint: rx.endpoint });
      try {
        for (const throttle of opts.throttles) {
          out.results.push(await config(browser, server, rx, { pageName, throttle, samples, fillS, question: pageName === 'demo' ? questions : 0 }));
          const r = out.results.at(-1);
          log(`LAT ${pageName} ${throttle}x: panel medyan ${r.panelOpenMs.median?.toFixed(0)} / p95 ${r.panelOpenMs.p95?.toFixed(0)} ms · kaydet→onay p95 ${r.saveToAckMs.p95?.toFixed(0)} ms${r.questionToPanelMs ? ` · soru p95 ${r.questionToPanelMs.p95} ms (en çok ${r.questionToPanelMs.max})` : ''}`);
        }
      } finally {
        await server.close();
      }
    }
  } finally {
    await browser.close();
    await rx.close();
  }
  return out;
}

if (isMain(import.meta.url)) {
  const opts = parseArgs();
  const out = await runLat(opts);
  log(`Sonuç: ${writeResult('lat', out, opts.out)}`);
}
