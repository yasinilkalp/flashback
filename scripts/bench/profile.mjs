#!/usr/bin/env node
/**
 * İnceleme yardımcısı: CDP örnekleyici profil ile kayıt AÇIK sayfada zamanın nereye gittiği (modül ve fonksiyon bazında
 * öz süre). NFR hedefi kaçırıldığında nedeni `packages/rewind` kaynağına bağlamak için kullanılır.
 *
 *   node scripts/bench/profile.mjs [--page=demo|list] [--throttle=4] [--scenario=interactions|panel|save] [--fill=40]
 *
 *  - interactions : perf.mjs betiğinden 30 etkileşim (700 ms tempo) süresince profil
 *  - panel        : tampon `--fill` sn doldurulur; yalnızca kısayol → panel görünene kadar profil
 *  - save         : panel açık, sayfa düzeyi olay; yalnızca Kaydet → onay arası profil (ikinci gönderim, önizlemesiz)
 */
import { launch, newPage, waitReady } from './lib/browser.mjs';
import { isMain, lcg, log, parseArgs, sleep } from './lib/common.mjs';
import { startReceiver, startVite } from './lib/servers.mjs';
import { act, cycleLength, script } from './perf.mjs';

function moduleOf(url) {
  if (!url) return '(yerel)';
  if (/rrweb-snapshot/.test(url)) return 'rrweb-snapshot';
  if (/deps\/rrweb/.test(url)) return 'rrweb';
  if (/packages\/rewind\/dist/.test(url)) return 'rewind-devtools';
  if (/react-dom|scheduler/.test(url)) return 'react-dom';
  if (/deps\/react/.test(url)) return 'react';
  if (/source-map-js/.test(url)) return 'source-map-js';
  if (/bench\/lib/.test(url)) return 'bench';
  return 'uygulama';
}

function aggregate(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i + 1] ?? 0) / 1000));
  const mods = {};
  const fns = {};
  for (const [id, ms] of self) {
    const n = byId.get(id);
    const f = n.callFrame;
    const name = f.functionName || '(anonim)';
    const mod = ['(idle)', '(program)', '(garbage collector)'].includes(name) ? name : moduleOf(f.url);
    mods[mod] = (mods[mod] ?? 0) + ms;
    const key = `${mod} · ${name} · ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    fns[key] = (fns[key] ?? 0) + ms;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v * 10) / 10]);
  return { modules: top(mods, 12), functions: top(fns, 25).filter(([k]) => !k.startsWith('(idle)')) };
}

export async function runProfile(o) {
  const rx = await startReceiver();
  const { browser } = await launch();
  const server = await startVite({ page: o.page, mode: 'on', endpoint: rx.endpoint });
  try {
    const { page, cdp } = await newPage(browser, { throttle: o.throttle });
    await page.goto(server.url + server.query);
    await waitReady(page, { pageName: o.page, mode: 'on' });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    const actions = script(o.page, 1000);
    const rand = lcg(3);
    const drive = async (ms) => {
      const end = Date.now() + ms;
      for (let i = 0; Date.now() < end || i % cycleLength(o.page) !== 0; i++) {
        await act(page, actions[i], 10_000).catch(() => {});
        await sleep(550 + Math.floor(rand() * 300));
      }
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    };
    if (o.scenario === 'interactions') {
      await sleep(2000);
      await cdp.send('Profiler.start');
      await drive(21_000);
    } else {
      await drive(o.fill * 1000);
      if (o.scenario === 'panel') {
        await cdp.send('Profiler.start');
        await page.keyboard.press('Alt+Shift+KeyR');
        await page.locator('[data-rw="panel"] .rw-replay iframe').waitFor();
      } else {
        for (let k = 0; k < 2; k++) {
          await page.keyboard.press('Alt+Shift+KeyR');
          await page.locator('[data-rw="page-level"]').click();
          await page.locator('[data-rw="expected"]').fill('bench');
          if (k === 1) await cdp.send('Profiler.start');
          await page.locator('[data-rw="save"]').click();
          const preview = page.locator('[data-rw="preview-view"]');
          const idEl = page.locator('[data-rw="incident-id"]');
          await Promise.race([preview.waitFor({ timeout: 60_000 }), idEl.waitFor({ timeout: 60_000 })]);
          if (await preview.isVisible()) await page.locator('[data-rw="send"]').click();
          await idEl.waitFor({ timeout: 60_000 });
          if (k === 0) {
            await page.locator('[data-rw="close"]').click();
            await drive(5000);
          }
        }
      }
    }
    const { profile } = await cdp.send('Profiler.stop');
    return aggregate(profile);
  } finally {
    await browser.close();
    await server.close();
    await rx.close();
  }
}

if (isMain(import.meta.url)) {
  const a = parseArgs().raw;
  const o = { page: a.page ?? 'demo', throttle: Number(a.throttle ?? 4), scenario: a.scenario ?? 'interactions', fill: Number(a.fill ?? 40) };
  const r = await runProfile(o);
  log(`${o.page} ${o.throttle}x ${o.scenario} — modül öz süresi (ms):`);
  for (const [k, v] of r.modules) console.log(`  ${String(v).padStart(8)}  ${k}`);
  log('En pahalı fonksiyonlar (ms):');
  for (const [k, v] of r.functions) console.log(`  ${String(v).padStart(8)}  ${k}`);
}
