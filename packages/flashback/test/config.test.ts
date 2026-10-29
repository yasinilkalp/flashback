import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILTIN_IGNORE, DEFAULTS, detectLocale, FLASHBACK_VERSION, isEditableTarget, matchesShortcut, parseShortcut, resolveConfig, shortcutLabel, shouldStart } from '../src/config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('props ve varsayılanlar', () => {
  it('varsayılanlar', () => {
    expect(DEFAULTS).toEqual({ shortcut: 'alt+shift+f', redact: true });
    expect(resolveConfig({ locale: 'tr' })).toEqual({ ignoreUrls: BUILTIN_IGNORE, redact: { enabled: true }, shortcut: 'alt+shift+f', locale: 'tr' });
  });

  it('gizleme seçenekleri, kullanıcının ignoreUrls listesi ve dil', () => {
    expect(resolveConfig({ redact: false }).redact).toEqual({ enabled: false });
    expect(resolveConfig({ redact: { keys: ['musteriNo'], phones: true } }).redact).toEqual({ enabled: true, keys: ['musteriNo'], phones: true });
    expect(resolveConfig({ ignoreUrls: ['/api/analytics'] }).ignoreUrls).toEqual([...BUILTIN_IGNORE, '/api/analytics']);
    expect(detectLocale('tr-TR')).toBe('tr');
    expect(detectLocale('en-US')).toBe('en');
  });

  it("Flashback'in kendi ucu ve HMR istekleri kayda girmez", () => {
    const ignored = (url: string) => BUILTIN_IGNORE.some((re) => re.test(url));
    expect(ignored('http://localhost:5173/__flashback/report')).toBe(true);
    expect(ignored('http://localhost:5173/@vite/client')).toBe(true);
    expect(ignored('http://localhost:3000/_next/webpack-hmr')).toBe(true);
    expect(ignored('http://localhost:5173/api/shipping')).toBe(false);
  });

  it('FLASHBACK_VERSION paketin sürümüyle aynı (yayın iş akışı paket sürümünü etiketle karşılaştırır)', () => {
    expect(FLASHBACK_VERSION).toBe(pkg.version);
  });
});

describe('üretim koruması', () => {
  it('üretim dışında varsayılan açık; üretimde enabled verilse de kapalı', () => {
    expect(shouldStart({}, false)).toBe(true);
    expect(shouldStart({ enabled: false }, false)).toBe(false);
    expect(shouldStart({}, true)).toBe(false);
    expect(shouldStart({ enabled: true }, true)).toBe(false);
  });
});

describe('kısayol', () => {
  const sc = parseShortcut('alt+shift+f');
  const key = (over: Partial<KeyboardEvent>) => ({ code: 'KeyF', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, ...over }) as KeyboardEvent;

  it("event.code ile eşleşir; macOS'taki Option karakterleri önemli değil", () => {
    expect(sc).toEqual({ code: 'KeyF', alt: true, shift: true, ctrl: false, meta: false });
    expect(matchesShortcut(key({ key: 'Ï' } as Partial<KeyboardEvent>), sc)).toBe(true);
    expect(matchesShortcut(key({ shiftKey: false }), sc)).toBe(false);
    expect(matchesShortcut(key({ code: 'KeyT' }), sc)).toBe(false);
    expect(parseShortcut('ctrl+shift+1')).toMatchObject({ code: 'Digit1', ctrl: true });
    expect(parseShortcut('meta+f2')).toMatchObject({ code: 'F2', meta: true });
    expect(shortcutLabel('alt+shift+f')).toBe('Alt+Shift+F');
  });

  it('metin girişindeki odak kısayolu tetiklemez', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: () => null, ...extra }) as unknown as EventTarget;
    expect(isEditableTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isEditableTarget(el('BUTTON'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
