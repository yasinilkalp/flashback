import { renderAssertions } from '@flashback/shared';
import { describe, expect, it } from 'vitest';
import { AssertionParseError, parseAssertions } from '../src/index.js';

const T = { hasTarget: true };
const P = { hasTarget: false };

describe('assertion ayrıştırıcı (FR-REPRO-SEC-01, §9.7) — kabul', () => {
  const accept: Array<[string, string, { hasTarget: boolean }]> = [
    ["await expect(target).toHaveText('1380 ₺');", 'await expect(target).toHaveText("1380 ₺");', T],
    ['expect(target).toHaveText("1380 ₺")', 'await expect(target).toHaveText("1380 ₺");', T],
    ["await expect(page.getByRole('alert')).toBeVisible();", 'await expect(page.getByRole("alert")).toBeVisible();', P],
    ["await expect(page.getByRole('alert')).toContainText(/kupon/i);", 'await expect(page.getByRole("alert")).toContainText(new RegExp("kupon", "i"));', P],
    [
      "await expect(page.getByRole('button', { name: 'Uygula' })).toBeEnabled();",
      'await expect(page.getByRole("button", { name: "Uygula" })).toBeEnabled();',
      P,
    ],
    ["await expect(page.getByRole('button', { name: /uygula/i, })).not.toBeDisabled()", 'await expect(page.getByRole("button", { name: new RegExp("uygula", "i") })).not.toBeDisabled();', P],
    ["await expect(page.getByText(/toplam/)).toHaveCount(1);", 'await expect(page.getByText(new RegExp("toplam", ""))).toHaveCount(1);', P],
    ["await expect(page.getByTestId('total')).toHaveText(`1380 ₺`);", 'await expect(page.getByTestId("total")).toHaveText("1380 ₺");', P],
    ["await expect(page.getByLabel('Kupon')).toHaveValue('YAZ10');", 'await expect(page.getByLabel("Kupon")).toHaveValue("YAZ10");', P],
    ["await expect(page.locator('#total')).toHaveAttribute('data-state', 'ok');", 'await expect(page.locator("#total")).toHaveAttribute("data-state", "ok");', P],
    ["await expect(target).toHaveCSS('color', 'rgb(255, 0, 0)')", 'await expect(target).toHaveCSS("color", "rgb(255, 0, 0)");', T],
    ["await expect(target).toHaveClass(/error/)", 'await expect(target).toHaveClass(new RegExp("error", ""));', T],
    ["await expect(page).toHaveURL(/\\/checkout$/)", 'await expect(page).toHaveURL(new RegExp("\\\\/checkout$", ""));', P],
    ["await expect(page).toHaveTitle('Sepet')", 'await expect(page).toHaveTitle("Sepet");', P],
    ["await expect(target).not.toBeHidden(); // yorum\n/* blok */ await expect(target).toBeChecked();", 'await expect(target).not.toBeHidden();\nawait expect(target).toBeChecked();', T],
    ["await expect(target).toHaveText('it\\'s \\u20BA \\x41')", 'await expect(target).toHaveText("it\'s ₺ A");', T],
    ["await expect(target).toHaveText('\"); require(\"fs\").writeFileSync(\"/tmp/x\",\"x\"); (\"')", 'await expect(target).toHaveText("\\"); require(\\"fs\\").writeFileSync(\\"/tmp/x\\",\\"x\\"); (\\"");', T],
  ];
  it.each(accept)('%s', (src, rendered, opts) => {
    const r = parseAssertions(src, opts);
    expect(r.text).toBe(rendered);
    expect(renderAssertions(r.ir)).toBe(rendered);
  });

  it('IR doğrudan JSON olarak (dizi, tek nesne ya da metin) kabul edilir', () => {
    const ir = { subject: { kind: 'target' }, matcher: 'toHaveText', not: false, args: [{ type: 'string', value: '1380 ₺' }] };
    expect(parseAssertions(ir, T).text).toBe('await expect(target).toHaveText("1380 ₺");');
    expect(parseAssertions([ir, ir], T).ir).toHaveLength(2);
    expect(parseAssertions(JSON.stringify([ir]), T).ir[0].matcher).toBe('toHaveText');
  });
});

describe('assertion ayrıştırıcı — ret', () => {
  const reject: Array<[string, unknown, { hasTarget: boolean }, RegExp?]> = [
    ['require', "require('fs').writeFileSync('/tmp/pwned', 'x')", T, /"expect" bekleniyordu, "require" bulundu/],
    ['context().request', "await expect(page.context().request.get('http://x')).toBeVisible()", T, /page yöntemi/],
    ['request.get doğrudan', "await page.context().request.get('http://x')", T],
    ['şablon ifadesi', 'await expect(target).toHaveText(`${process.env.X}`)', T, /şablon ifadesi/],
    ['page.evaluate (ok işlevi)', "await expect(page.evaluate(() => 1)).toBeVisible()", T, /beklenmeyen karakter "="/],
    ['page.evaluate (metin)', "await expect(page.evaluate('fetch(1)')).toBeVisible()", T, /page yöntemi/],
    ['tanımlayıcı argüman', 'await expect(target).toHaveText(x)', T, /sabit argüman/],
    ['fonksiyon çağrısı argüman', "await expect(target).toHaveText(String(1))", T, /sabit argüman/],
    ['target sayfa düzeyinde yasak', "await expect(target).toHaveText('a')", P, /target = null/],
    ['izinsiz matcher', "await expect(target).toEqual('a')", T, /izinli matcher/],
    ['toBeVisible argüman almaz', "await expect(target).toBeVisible('a')", T, /0 argüman/],
    ['toHaveCount sayı ister', "await expect(page.locator('li')).toHaveCount('3')", T, /sayı olmalı/],
    ['toHaveCount negatif olamaz', "await expect(page.locator('li')).toHaveCount(-1)", T, /negatif/],
    ['toHaveURL yalnızca page', "await expect(target).toHaveURL('/x')", T, /expect\(page\)/],
    ['page ile toHaveText', "await expect(page).toHaveText('x')", T, /toHaveURL ve toHaveTitle/],
    ['toHaveAttribute en fazla 2', "await expect(target).toHaveAttribute('a', 'b', 'c')", T, /1–2 argüman/],
    ['ek zincir', "await expect(target).toHaveText('a').then(() => 1)", T],
    ['köşeli parantez erişimi', "await expect(target)['toHaveText']('a')", T, /beklenmeyen karakter/],
    ['dizi argüman', "await expect(target).toHaveText(['a'])", T],
    ['seçenek nesnesi', "await expect(target).toBeVisible({ timeout: 1 })", T],
    ['expect.soft', "await expect.soft(target).toHaveText('a')", T],
    ['geçersiz regex', 'await expect(target).toHaveText(/(/)', T, /geçersiz regex/],
    ['geçersiz regex bayrağı', 'await expect(target).toHaveText(/a/x)', T, /bayrağı/],
    ['kapanmamış metin', "await expect(target).toHaveText('a)", T, /kapanmamış/],
    ['boş', '   ', T, /Boş/],
    ['yalnızca yorum', '// hiçbir şey', T, /en az bir/],
    ['getByRole name dışında seçenek', "await expect(page.getByRole('button', { exact: true })).toBeVisible()", T, /"name"/],
    ['locator regex kabul etmez', 'await expect(page.locator(/x/)).toBeVisible()', T, /metin sabiti/],
    ['IR şemaya uymuyor', [{ subject: { kind: 'eval', code: 'x' }, matcher: 'toHaveText', args: [] }], T, /şemaya uymuyor/],
    ['IR izinsiz matcher', { subject: { kind: 'target' }, matcher: 'toPass', args: [] }, T, /şemaya uymuyor/],
    ['IR ile target yasak', { subject: { kind: 'target' }, matcher: 'toBeVisible', args: [] }, P, /target = null/],
    ['11 beklenti', Array(11).fill("await expect(target).toBeVisible();").join('\n'), T, /en fazla 10/i],
  ];
  it.each(reject)('%s', (_name, src, opts, re) => {
    let err: unknown;
    try {
      parseAssertions(src, opts);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AssertionParseError);
    expect((err as AssertionParseError).code).toBe('assertion_rejected');
    if (re) expect((err as Error).message).toMatch(re);
  });

  it('hata mesajı satır ve sütun verir', () => {
    expect(() => parseAssertions("await expect(target).toHaveText('a');\nfoo()", T)).toThrow(/Satır 2, sütun 1/);
  });
});
