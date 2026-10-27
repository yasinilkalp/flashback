/**
 * Repro spec ve Playwright yapılandırma şablonları (FR-REPRO-SEC-05 / EK-B1).
 *
 * Şablonlar SABİTTİR: olay verisi (seçici, değer, URL, tuş, locale…) koda hiçbir zaman gömülmez;
 * spec yanındaki `<id>.steps.json` dosyasını çalışma anında `JSON.parse` ile okur.
 * Tek değişken kod parçası, doğrulanmış IR'den `renderAssertions` ile üretilen beklenti bloğudur.
 */

export const ASSERTIONS_PLACEHOLDER = '/*__FLASHBACK_ASSERTIONS__*/';

export const SPEC_TEMPLATE = `// Flashback repro testi — flashback-mcp tarafından üretildi; elle düzenlemeyin.
// Olay verisi bu dosyada YOKTUR: yanındaki <id>.steps.json dosyasından çalışma anında okunur.
// Bu dosyadaki tek üretilmiş kod, doğrulanmış assertion IR'den üretilen beklenti bloğudur.
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';

const ENV_NAME = /^FLASHBACK_(PASSWORD|INPUT_[A-Z0-9_]{1,64})$/;

test('flashback repro', async ({ browser }) => {
  const data = JSON.parse(fs.readFileSync(test.info().file.replace(/\\.spec\\.ts$/, '.steps.json'), 'utf8'));
  const base = new URL(data.baseUrl);
  // İzinli kökenler: taban adresin kökeni + FLASHBACK_ALLOW_ORIGINS.
  const allowed = new Set([base.origin, ...(data.allowedOrigins || [])]);
  const originOf = (u) => {
    try {
      return new URL(u).origin;
    } catch {
      return null;
    }
  };
  const isAllowed = (u) => allowed.has(originOf(u));
  // Sınıflandırma yalnızca bu dosyanın kod yollarının yazdığı \`failure\` alanına dayanır;
  // sayfa içeriği (hata metinleri) sonucu değiştiremez.
  const observed = { phase: 'setup', failure: null, console: [], network: [], targetFound: null };
  const fail = (failure, message) => {
    observed.failure = failure;
    return new Error(message);
  };
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({
      viewport: data.viewport,
      locale: data.locale,
      timezoneId: data.timezone,
      storageState: data.storageState || undefined,
    });
    // İzinli olmayan kökenlere üst düzey gezinme engellenir; alt kaynaklara (script, görsel) izin verilir.
    await context.route('**/*', (route) => {
      const req = route.request();
      let topLevel = false;
      try {
        topLevel = req.isNavigationRequest() && req.frame().parentFrame() === null;
      } catch {
        topLevel = false;
      }
      if (topLevel && !isAllowed(req.url())) return route.abort('blockedbyclient');
      return route.continue();
    });
    page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') observed.console.push(m.text());
    });
    page.on('pageerror', (e) => observed.console.push(String((e && e.message) || e)));
    page.on('response', (r) => {
      if (r.status() >= 400) observed.network.push(r.request().method() + ' ' + r.url() + ' → ' + r.status());
    });
    page.on('requestfailed', (r) => observed.network.push(r.method() + ' ' + r.url() + ' → ' + ((r.failure() && r.failure().errorText) || 'failed')));

    // Seçiciler yalnızca page.locator(<string>) argümanı olarak kullanılır.
    const find = async (selectors, waitMs) => {
      const deadline = Date.now() + waitMs;
      for (;;) {
        for (const sel of selectors) {
          try {
            const loc = page.locator(sel);
            if ((await loc.count()) > 0) return loc.first();
          } catch {
            // geçersiz seçici: sıradakini dene
          }
        }
        if (Date.now() >= deadline) return null;
        await page.waitForTimeout(100);
      }
    };
    const valueOf = (step) => {
      for (const name of step.env || []) {
        if (ENV_NAME.test(name) && process.env[name] !== undefined && process.env[name] !== '') return process.env[name];
      }
      return step.value ?? '';
    };
    // Kapsayıcı tıklaması kayıttaki göreli noktaya yapılır; ortası içindeki bir düğmeye denk gelebilir.
    const clickStep = async (loc, step) => {
      const at = step.at;
      const box = at ? await loc.boundingBox() : null;
      if (!box) return loc.click();
      const r = (v) => Math.min(1, Math.max(0, Number(v) || 0));
      return loc.click({ position: { x: r(at.x) * box.width, y: r(at.y) * box.height } });
    };
    const settle = () => page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    // Her etkileşimden ve beklenti denetiminden önce sayfa izinli kökende olmalı (yabancı sayfaya değer yazılmaz).
    const ensureOrigin = (what) => {
      if (!isAllowed(page.url())) {
        throw fail('precondition', 'Sayfa izinli olmayan bir kökene geçti (' + originOf(page.url()) + '); ' + what + ' yapılmadı.');
      }
    };

    observed.phase = 'steps';
    try {
      if (!isAllowed(data.startUrl)) throw fail('step', 'Başlangıç URL\\'si izinli kökende değil.');
      await page.goto(data.startUrl);
      await settle();
      const want = new URL(data.startUrl);
      const landed = new URL(page.url());
      if (landed.origin !== want.origin) {
        throw fail('precondition', 'İlk gezinme başka bir kökene yönlendi: ' + landed.origin + ' (beklenen ' + want.origin + ').');
      }
      if (landed.pathname !== want.pathname) {
        throw fail('precondition', 'İlk gezinme ' + want.pathname + ' yerine ' + landed.pathname + ' yoluna yönlendi (oturum gerekli olabilir).');
      }
      for (let i = 0; i < data.steps.length; i++) {
        const s = data.steps[i];
        if (s.type === 'navigate') {
          if (!isAllowed(s.url)) continue;
          const cur = new URL(page.url());
          const next = new URL(s.url);
          if (cur.origin + cur.pathname + cur.search !== next.origin + next.pathname + next.search) {
            await page.goto(s.url);
            await settle();
          }
          continue;
        }
        let loc = null;
        if (s.selectors.length) {
          const first = i === data.firstActionIndex;
          loc = await find(s.selectors, first ? 5000 : 10000);
          if (!loc) {
            const what = 'adım ' + s.n + ' (' + s.type + ') için seçici bulunamadı: ' + JSON.stringify(s.selectors[0]);
            throw fail(first ? 'precondition' : 'selector', first ? 'İlk ' + what : what);
          }
        }
        ensureOrigin('adım ' + s.n);
        if (s.type === 'click') await clickStep(loc, s);
        else if (s.type === 'input') await loc.fill(valueOf(s));
        else if (s.type === 'key') {
          if (loc) await loc.press(s.key);
          else await page.keyboard.press(s.key);
        }
      }
      await settle();
      ensureOrigin('beklenti denetimi');
    } catch (e) {
      if (!observed.failure) {
        const first = String((e && e.message) || e).split('\\n')[0];
        observed.failure = /net::ERR_CONNECTION_REFUSED/.test(first)
          ? 'server_down'
          : e && e.name === 'TimeoutError'
            ? /^page\\.goto/.test(first)
              ? 'timeout'
              : 'selector'
            : /^(locator|keyboard)\\./.test(first)
              ? 'selector'
              : 'step';
      }
      throw e;
    }

    let target = undefined;
    if (data.target) {
      target = await find(data.target.selectors, 2000);
      observed.targetFound = !!target;
      if (!target) target = page.locator(data.target.selectors[0]);
    }
    observed.phase = 'assertion';
    try {
      // ---- beklentiler (assertion IR'den üretildi) ----
      ${ASSERTIONS_PLACEHOLDER}
      // ----
      if (data.strict && (observed.console.length || observed.network.length)) {
        throw new Error('strict: ' + observed.console.length + ' konsol hatası, ' + observed.network.length + ' başarısız istek gözlendi');
      }
    } catch (e) {
      observed.failure = 'assertion';
      throw e;
    }
    observed.phase = 'done';
  } catch (e) {
    if (!observed.failure) observed.failure = 'setup';
    throw e;
  } finally {
    try {
      await test.info().attach('flashback-observed', { body: JSON.stringify(observed), contentType: 'application/json' });
    } catch {
      // gözlem eklenemedi
    }
    if (page) {
      // Parola alanları, data-flashback-mask ve ortam değişkeninden doldurulan alanlar maskelenir (FR-RED-12).
      const mask = [page.locator('[data-flashback-mask]'), page.locator('input[type="password"]')];
      for (const sel of data.maskSelectors || []) {
        try {
          await page.locator(sel).count();
          mask.push(page.locator(sel));
        } catch {
          // geçersiz seçici
        }
      }
      await page.screenshot({ path: data.screenshotPath, mask }).catch(() => {});
    }
    if (context) await context.close().catch(() => {});
  }
});
`;

/** Tüm olaylar için ortak, sabit yapılandırma. Değerler ortam değişkenlerinden okunur. */
export const CONFIG_TEMPLATE = `// flashback-mcp tarafından üretildi. Projenin playwright.config dosyası kullanılmaz (FR-REPRO-01).
const env = process.env;
export default {
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: Number(env.FLASHBACK_TEST_TIMEOUT_MS) || 60000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['json', { outputFile: env.FLASHBACK_REPORT_FILE || 'flashback-report.json' }]],
  outputDir: env.FLASHBACK_OUTPUT_DIR || '.results',
  use: {
    browserName: 'chromium',
    headless: env.FLASHBACK_HEADED !== '1',
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
};
`;

/** IR'den üretilmiş kodu şablona yerleştirir. `assertionCode` yalnızca `renderAssertions` çıktısı olmalıdır. */
export function renderSpec(assertionCode: string): string {
  const indented = assertionCode.split('\n').join('\n      ');
  return SPEC_TEMPLATE.replace(ASSERTIONS_PLACEHOLDER, () => indented);
}

// ---- Taşınabilir spec (FR-MCP-14) ---------------------------------------------

export const DATA_PLACEHOLDER = '/*__FLASHBACK_DATA__*/';

/**
 * `get_repro_script { portable: true }` şablonu. Projenin test klasörüne kopyalanıp projenin KENDİ
 * playwright.config dosyasıyla çalışır: yollar `use.baseURL`'e göredir, yardımcılar satır içidir,
 * `.flashback/` klasörüne ve `node:fs`'e bağımlılık yoktur.
 *
 * Şablon SABİTTİR. İki değişken parça vardır:
 *   1. DATA: olay verisi, yalnızca `JSON.stringify` çıktısı olarak (kod değil, veri sabiti),
 *   2. beklenti bloğu: doğrulanmış IR'den `renderAssertions` ile üretilen kod.
 */
export const PORTABLE_SPEC_TEMPLATE = `// @ts-nocheck
// Flashback taşınabilir repro testi — flashback-mcp get_repro_script (portable: true) ile üretildi.
// Projenin kendi playwright.config dosyasıyla çalışır; yollar use.baseURL'e göre çözülür.
// Olay verisi yalnızca aşağıdaki DATA sabitindedir (JSON.stringify ile serileştirilmiş veri; kod değil).
// Gizli/sentetik girişler ortam değişkenlerinden okunur (FLASHBACK_PASSWORD, FLASHBACK_INPUT_<ALAN>); yoksa yer tutucu kullanılır.
// Oturum gerekiyorsa projenin storageState ayarını ya da FLASHBACK_STORAGE_STATE ortam değişkenini kullanın.
import { test, expect } from '@playwright/test';

const DATA = ${DATA_PLACEHOLDER};

const ENV_NAME = /^FLASHBACK_(PASSWORD|INPUT_[A-Z0-9_]{1,64})$/;

test.use({
  viewport: DATA.viewport,
  locale: DATA.locale,
  timezoneId: DATA.timezone,
  ...(process.env.FLASHBACK_STORAGE_STATE ? { storageState: process.env.FLASHBACK_STORAGE_STATE } : {}),
});

test('flashback repro ' + DATA.incidentId, async ({ page, context, baseURL }) => {
  const root = baseURL || process.env.FLASHBACK_BASE_URL;
  if (!root) throw new Error('Flashback: playwright.config içinde use.baseURL (ya da FLASHBACK_BASE_URL) tanımlı olmalı.');
  const base = new URL(root);
  const originOf = (u) => {
    try {
      return new URL(u, base).origin;
    } catch {
      return null;
    }
  };
  // İzinli kökenler: baseURL kökeni + FLASHBACK_ALLOW_ORIGINS (virgülle ayrılmış).
  const allowed = new Set([base.origin]);
  for (const o of (process.env.FLASHBACK_ALLOW_ORIGINS || '').split(',')) {
    const origin = o.trim() ? originOf(o.trim()) : null;
    if (origin && origin !== 'null') allowed.add(origin);
  }
  const isAllowed = (u) => allowed.has(originOf(u));
  // İzinli olmayan kökenlere üst düzey gezinme engellenir (sentetik/gizli değerler yabancı sayfaya yazılmaz).
  await context.route('**/*', (route) => {
    const req = route.request();
    let topLevel = false;
    try {
      topLevel = req.isNavigationRequest() && req.frame().parentFrame() === null;
    } catch {
      topLevel = false;
    }
    if (topLevel && !isAllowed(req.url())) return route.abort('blockedbyclient');
    return route.fallback();
  });
  const observed = { console: [], network: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') observed.console.push(m.text());
  });
  page.on('pageerror', (e) => observed.console.push(String((e && e.message) || e)));
  page.on('response', (r) => {
    if (r.status() >= 400) observed.network.push(r.request().method() + ' ' + r.url() + ' → ' + r.status());
  });

  // Seçiciler yalnızca page.locator(<string>) argümanı olarak kullanılır.
  const find = async (selectors, waitMs) => {
    const deadline = Date.now() + waitMs;
    for (;;) {
      for (const sel of selectors) {
        try {
          const loc = page.locator(sel);
          if ((await loc.count()) > 0) return loc.first();
        } catch {
          // geçersiz seçici: sıradakini dene
        }
      }
      if (Date.now() >= deadline) return null;
      await page.waitForTimeout(100);
    }
  };
  const valueOf = (step) => {
    for (const name of step.env || []) {
      if (ENV_NAME.test(name) && process.env[name] !== undefined && process.env[name] !== '') return process.env[name];
    }
    return step.value ?? '';
  };
  // Kapsayıcı tıklaması kayıttaki göreli noktaya yapılır; ortası içindeki bir düğmeye denk gelebilir.
  const clickStep = async (loc, step) => {
    const at = step.at;
    const box = at ? await loc.boundingBox() : null;
    if (!box) return loc.click();
    const r = (v) => Math.min(1, Math.max(0, Number(v) || 0));
    return loc.click({ position: { x: r(at.x) * box.width, y: r(at.y) * box.height } });
  };
  const settle = () => page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  const ensureOrigin = (what) => {
    if (!isAllowed(page.url())) throw new Error('Flashback ön koşul: sayfa izinli olmayan bir kökene geçti; ' + what + ' yapılmadı.');
  };

  await page.goto(DATA.startPath);
  await settle();
  const want = new URL(DATA.startPath, base);
  const landed = new URL(page.url());
  if (landed.origin !== want.origin || landed.pathname !== want.pathname) {
    throw new Error('Flashback ön koşul: ilk gezinme ' + want.pathname + ' yerine ' + landed.origin + landed.pathname + ' adresine yönlendi (oturum gerekli olabilir).');
  }
  for (let i = 0; i < DATA.steps.length; i++) {
    const s = DATA.steps[i];
    if (s.type === 'navigate') {
      const next = new URL(s.path, base);
      const cur = new URL(page.url());
      if (cur.origin + cur.pathname + cur.search !== next.origin + next.pathname + next.search) {
        await page.goto(s.path);
        await settle();
      }
      continue;
    }
    let loc = null;
    if (s.selectors.length) {
      const first = i === DATA.firstActionIndex;
      loc = await find(s.selectors, first ? 5000 : 10000);
      if (!loc) {
        throw new Error((first ? 'Flashback ön koşul: ilk ' : 'Flashback: ') + 'adım ' + s.n + ' (' + s.type + ') için seçici bulunamadı: ' + JSON.stringify(s.selectors[0]));
      }
    }
    ensureOrigin('adım ' + s.n);
    if (s.type === 'click') await clickStep(loc, s);
    else if (s.type === 'input') await loc.fill(valueOf(s));
    else if (s.type === 'key') {
      if (loc) await loc.press(s.key);
      else await page.keyboard.press(s.key);
    }
  }
  await settle();
  ensureOrigin('beklenti denetimi');

  let target = undefined;
  if (DATA.target) {
    target = (await find(DATA.target.selectors, 2000)) || page.locator(DATA.target.selectors[0]);
  }

  // ---- beklentiler (assertion IR'den üretildi) ----
  ${ASSERTIONS_PLACEHOLDER}
  // ----
  if (DATA.strict && (observed.console.length || observed.network.length)) {
    throw new Error('strict: ' + observed.console.length + ' konsol hatası, ' + observed.network.length + ' başarısız istek gözlendi');
  }
});
`;

/**
 * Veriyi JS kaynağına gömülecek sabite çevirir. Tek yol `JSON.stringify`'dır: dize içindeki her tırnak,
 * ters bölü ve kontrol karakteri kaçışlanır; `__proto__` anahtarları (nesne sabitinde prototip atar) düşürülür;
 * U+2028/2029 kaçışlanır.
 */
export function dataLiteral(data: unknown): string {
  const json = JSON.stringify(data, (k, v: unknown) => (k === '__proto__' ? undefined : v), 2);
  if (json === undefined) throw new Error('veri serileştirilemedi');
  return json.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Taşınabilir spec: `data` yalnızca `dataLiteral` ile, `assertionCode` yalnızca `renderAssertions` çıktısı olmalıdır. */
export function renderPortableSpec(data: unknown, assertionCode: string): string {
  const indented = assertionCode.split('\n').join('\n  ');
  const literal = dataLiteral(data);
  // Yer tutucular tek geçişte değiştirilir; değiştirilen metin yeniden taranmaz (veri, beklenti yer tutucusunu içerse bile).
  return PORTABLE_SPEC_TEMPLATE.replace(/\/\*__FLASHBACK_(DATA|ASSERTIONS)__\*\//g, (m) => (m === DATA_PLACEHOLDER ? literal : indented));
}
