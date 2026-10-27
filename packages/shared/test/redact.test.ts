import { describe, expect, it } from 'vitest';
import { Redactor, ibanValid, luhnValid, tcknValid } from '../src/redact.js';

// ---- FR-RED-14: kürate fixture seti --------------------------------------------------------
// Pozitifler: bilinen sır biçimleri ve sağlamalı kişisel veriler (duyarlılık %100 beklenir).
// Negatifler: korunan hata ayıklama değerleri (yanlış pozitif 0 beklenir).

function makeTckn(seed: number): string {
  const d = String(100000000 + ((seed * 7919) % 899999999)).split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return d.join('') + d10 + d11;
}

// Sahte sırlar çalışma anında parçalardan birleştirilir: kaynakta tam biçimli bir sır
// bulunmadığı için GitHub secret scanning bu test verisini gerçek sır sanıp uyarı açmaz.
const fake = (...parts: string[]): string => parts.join('');

const SECRETS: Array<[string, string]> = [
  ['jwt', fake('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')],
  ['token', 'Bearer abcdefghijklmnop123456'],
  ['token', 'bearer 9f8e7d6c5b4a3210.ffee'],
  ['api_key', fake('sk-', 'abcdefghijklmnopqrstuvwxyz123456')],
  ['api_key', fake('sk-', 'proj-', 'AbCdEfGhIjKlMnOpQrStUv')],
  ['api_key', fake('sk-', 'ant-', 'api03-', 'abcdefghijklmnopqrstu')],
  ['api_key', fake('gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789')],
  ['api_key', fake('github', '_pat_', '11ABCDEFG0123456789_abcdefghijklmnop')],
  ['api_key', fake('AK', 'IA', 'IOSFODNN7EXAMPLE')],
  ['api_key', fake('xo', 'xb-', '1234567890-abcdefghij')],
  ['api_key', fake('xo', 'xp-', '0987654321-ZYXWVUTSRQ')],
  ['api_key', fake('AI', 'za', 'SyA1234567890abcdefghijklmnopqrstuv')],
];

const CARDS = [
  '4111111111111111',
  '4111 1111 1111 1111',
  '4111-1111-1111-1111',
  '5555555555554444',
  '5105105105105100',
  '378282246310005',
  '371449635398431',
  '6011111111111117',
  '6011000990139424',
  '4012888888881881',
  '2223003122003222',
  '4000056655665556',
  '5200828282828210',
  '3566002020360505',
];

const IBANS = [
  'TR330006100519786457841326',
  'TR33 0006 1005 1978 6457 8413 26',
  'DE89370400440532013000',
  'DE89 3704 0044 0532 0130 00',
  'GB82WEST12345698765432',
  'FR1420041010050500013M02606',
  'NL91ABNA0417164300',
  'ES9121000418450200051332',
];

const TCKNS = Array.from({ length: 20 }, (_, i) => makeTckn(i + 1));

const EMAILS = [
  'ayse@example.com',
  'mehmet.yilmaz@usta.com.tr',
  'test+tag@sub.domain.io',
  'a_b-c@x.co',
  'UPPER@EXAMPLE.ORG',
];

const PRESERVED = [
  '1380 ₺',
  '135030 ₺',
  '135030',
  '1380',
  '1.380,00 TL',
  '₺1,380.50',
  'YAZ10',
  'KIS20',
  'SUMMER2026',
  'ORD-2026-000123',
  'SIP-77881',
  'Sipariş no: 4471',
  '2026-10-27',
  '27.10.2026',
  '2026-10-27T15:02:47.123Z',
  '15:02:47',
  '1793044539060',
  '1793044539',
  'status 500',
  'HTTP 404 Not Found',
  '200 OK',
  'İstanbul',
  'Ankara, Çankaya',
  'Kadıköy',
  '34710',
  'v1.2.3',
  '19.3.1',
  '127.0.0.1:4747',
  '192.168.1.20',
  'localhost:5173',
  '550e8400-e29b-41d4-a716-446655440000',
  'd41d8cd98f00b204e9800998ecf8427e',
  'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
  'SKU-1234-XL',
  'Ürün: Kahve Makinesi',
  'adet: 3',
  'qty=2&price=459.90',
  'Toplam 1380 ₺ olmalı',
  'kargo: "30"',
  'shippingFee',
  'tokenCount: 1200',
  'maxTokens',
  'page=2&limit=20',
  'color: rgb(255, 90, 54)',
  '#FF5A36',
  'width: 1280px',
  '0.15',
  '99.99',
  '-42',
  '1e6',
  '12345678901',
  '00000000000',
  '1111111111111111',
  '0000 0000 0000 0000',
  '1234567890123',
  'TR12',
  'Kupon uygulanamadı',
  'Cannot read properties of undefined (reading "price")',
  'at Cart (src/Cart.tsx:42:13)',
  'POST /api/coupon',
  '/api/orders/4471',
  'user_id=42',
  'session_count',
  'İndirim %10',
  'Yeni yıl kampanyası',
  'BT-2024-11',
  'BUILD 20261027',
  'commit 9f2c1ab',
  'port 4747',
  'id: 77',
  'ref: A1B2C3',
  'Fatura no: FTR2026000045',
  'Kargo takip: 1Z999AA10123456784',
  'Kat 3 Daire 12',
  'Posta kodu 06100',
  'TL 2.499,90',
  '$1,234.56',
  '€ 89,00',
  'indirim: 0.1',
  'cartTotal: 1350',
  'subtotal=1200&shipping=30',
  'shipping: "30"',
  'Mon Oct 27 2026',
  '1h 23m',
  '00:00:59.999',
  'ISO 8601',
  'ERR_CONNECTION_REFUSED',
  'TypeError: x.toFixed is not a function',
  'useCartStore',
  'data-testid="total"',
  'aria-label="Sepet"',
];

describe('sağlama algoritmaları', () => {
  it('Luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
  it('IBAN mod-97', () => {
    expect(ibanValid('TR330006100519786457841326')).toBe(true);
    expect(ibanValid('TR330006100519786457841327')).toBe(false);
  });
  it('TCKN', () => {
    expect(tcknValid('10000000146')).toBe(true);
    expect(tcknValid('10000000147')).toBe(false);
    expect(tcknValid('01234567890')).toBe(false);
    for (const t of TCKNS) expect(tcknValid(t)).toBe(true);
  });
});

describe('FR-RED-14 fixture seti', () => {
  const positives: Array<[string, string]> = [
    ...SECRETS,
    ...CARDS.map((c) => ['card', c] as [string, string]),
    ...IBANS.map((c) => ['iban', c] as [string, string]),
    ...TCKNS.map((c) => ['tckn', c] as [string, string]),
    ...EMAILS.map((c) => ['email', c] as [string, string]),
  ];

  it('fixture seti yaklaşık 150 örnek içerir', () => {
    expect(positives.length + PRESERVED.length).toBeGreaterThanOrEqual(140);
  });

  it.each(positives)('pozitif (%s): %s', (type, sample) => {
    const r = new Redactor();
    const out = r.text(`önce ${sample} sonra`);
    expect(out).not.toContain(sample);
    expect(out).toContain(`[REDACTED:${type}]`);
    expect(out.startsWith('önce ')).toBe(true);
  });

  it.each(PRESERVED)('korunan değer: %s', (sample) => {
    const r = new Redactor();
    expect(r.text(sample)).toBe(sample);
    expect(r.stats.count).toBe(0);
  });
});

describe('anahtar adına göre gizleme (FR-RED-02, FR-RED-10)', () => {
  it('büyük/küçük harf ve ayraçlardan bağımsız', () => {
    const r = new Redactor();
    const out = r.value({ apiKey: 'a', 'X-Api-Key': 'b', api_key: 'c', password: 'p', userPassword: 'q', csrfToken: 't', sessionId: 's' });
    expect(Object.values(out).every((v) => String(v).startsWith('[REDACTED'))).toBe(true);
    expect(out.password).toBe('[REDACTED:password]');
    expect(r.stats.count).toBe(7);
  });

  it('iç içe ve dizilerde derin gezinme (FR-RED-09)', () => {
    const r = new Redactor();
    const out = r.value({ user: { email: 'ayse@example.com', auth: { token: 'xyz', list: [{ secret: 1 }] } }, coupon: 'YAZ10', total: 135030 });
    expect(out.user.email).toBe('[REDACTED:email]');
    expect(out.user.auth.token).toBe('[REDACTED:token]');
    expect((out.user.auth.list[0] as { secret: unknown }).secret).toBe('[REDACTED:secret]');
    expect(out.coupon).toBe('YAZ10');
    expect(out.total).toBe(135030);
  });

  it('JSON sayısı olarak gelen kart numarası', () => {
    const r = new Redactor();
    expect(r.value({ pan: 4111111111111111 }).pan).toBe('[REDACTED:card]');
  });

  it('özel anahtar ve desen (FR-RED-06)', () => {
    const r = new Redactor({ keys: ['musteriNo'], patterns: [/M-\d{5}/] });
    expect(r.value({ musteriNo: '123' }).musteriNo).toBe('[REDACTED:secret]');
    expect(r.text('kod M-12345')).toBe('kod [REDACTED:custom]');
  });

  it('e-posta kapatılabilir, telefon açılabilir (FR-RED-05)', () => {
    expect(new Redactor({ emails: false }).text('a@b.co')).toBe('a@b.co');
    expect(new Redactor().text('0532 123 45 67')).toBe('0532 123 45 67');
    expect(new Redactor({ phones: true }).text('0532 123 45 67')).toBe('[REDACTED:phone]');
  });

  it('redact=false hiçbir şeyi değiştirmez (FR-RED-08)', () => {
    const r = new Redactor({ enabled: false });
    expect(r.value({ password: 'x', e: 'a@b.co' })).toEqual({ password: 'x', e: 'a@b.co' });
  });
});

describe('başlık, URL ve gövde', () => {
  it('başlıklar', () => {
    const r = new Redactor();
    const h = r.headers({ Authorization: 'Bearer abc', Cookie: 'sid=1', 'Content-Type': 'application/json', 'Set-Cookie': 'a=b' });
    expect(h.Authorization).toBe('[REDACTED:token]');
    expect(h.Cookie).toBe('[REDACTED:cookie]');
    expect(h['Set-Cookie']).toBe('[REDACTED:cookie]');
    expect(h['Content-Type']).toBe('application/json');
  });

  it('URL sorgu parametreleri ve yol', () => {
    const r = new Redactor();
    expect(r.url('/api/x?access_token=abc&page=2&email=ayse@example.com#top')).toBe(
      '/api/x?access_token=[REDACTED:token]&page=2&email=[REDACTED:email]#top',
    );
    expect(r.url('/users/ayse@example.com/orders')).toBe('/users/[REDACTED:email]/orders');
  });

  it('JSON, form ve metin gövdeleri', () => {
    const r = new Redactor();
    expect(r.body('{"password":"x","coupon":"YAZ10"}', 'application/json')).toBe('{"password":"[REDACTED:password]","coupon":"YAZ10"}');
    expect(r.body('user=ayse&password=123', 'application/x-www-form-urlencoded')).toBe('user=ayse&password=[REDACTED:password]');
    expect(r.body('hata: ayse@example.com', 'text/plain')).toBe('hata: [REDACTED:email]');
  });

  it('kayıt anında giriş maskeleme (FR-RED-11)', () => {
    const r = new Redactor();
    expect(r.input('gizli', { type: 'password' })).toEqual({ value: '[REDACTED:password]', as: 'password' });
    expect(r.input('ayse@example.com', { type: 'email' })).toEqual({ value: '[REDACTED:email]', as: 'email' });
    expect(r.input('YAZ10', { type: 'text', name: 'coupon' })).toEqual({ value: 'YAZ10' });
    expect(r.input('abc', { name: 'otp_token' })).toEqual({ value: '[REDACTED:token]', as: 'token' });
  });

  it('işaretler iki kez sayılmaz', () => {
    const r = new Redactor();
    const once = r.text('ayse@example.com');
    r.text(once);
    expect(r.stats.count).toBe(1);
  });
});

describe('güvenlik incelemesi bulguları (bulgu 3 ve 6)', () => {
  it('köşeli parantezli anahtarlar (Rails/PHP formu)', () => {
    const r = new Redactor();
    expect(r.body('user[email]=x&user[password]=hunter22', 'application/x-www-form-urlencoded')).toBe(
      'user[email]=x&user[password]=[REDACTED:password]',
    );
    expect(r.value({ 'user[password]': 'p' })['user[password]']).toBe('[REDACTED:password]');
  });

  it('URL fragment parametreleri (OAuth implicit akışı)', () => {
    const r = new Redactor();
    expect(r.url('http://localhost:5173/cb#access_token=abc123&state=xyz')).toBe(
      'http://localhost:5173/cb#access_token=[REDACTED:token]&state=xyz',
    );
  });

  it('URL-kodlu değerlerdeki desenler', () => {
    const r = new Redactor();
    expect(r.url('/x?mail=ayse%40example.com')).toBe('/x?mail=[REDACTED:email]');
  });

  it('metin alanında saklanan JSON', () => {
    const r = new Redactor();
    const out = r.value({ payload: '{"password":"p1","coupon":"YAZ10"}' });
    expect(out.payload).toBe('{"password":"[REDACTED:password]","coupon":"YAZ10"}');
  });

  it('serbest metindeki anahtar: değer çiftleri (log satırı, GraphQL argümanı)', () => {
    const r = new Redactor();
    expect(r.text('mutation { login(email: "a", password: "hunter22") }')).toBe('mutation { login(email: "a", password: "[REDACTED:password]") }');
    expect(r.text('auth ok token=opaque123 user=7')).toBe('auth ok token=[REDACTED:token] user=7');
    expect(r.text('Authorization: Basic abc')).toBe('Authorization: [REDACTED:token]');
    expect(r.text('Authorization: Bearer abcdefghijklmnop')).toBe('Authorization: [REDACTED:token]');
    expect(r.text('tokenCount: 1200, maxTokens=5')).toBe('tokenCount: 1200, maxTokens=5');
  });

  it('store yolu (pathType)', () => {
    const r = new Redactor();
    expect(r.pathType('auth.token')).toBe('token');
    expect(r.pathType('items[0].password')).toBe('password');
    expect(r.pathType('cart.items')).toBeNull();
    expect(r.pathType('apiKey')).toBe('secret');
  });
});
