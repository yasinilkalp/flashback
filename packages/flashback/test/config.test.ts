import { readFileSync } from 'node:fs';
import { DEFAULT_ENDPOINT, SCHEMA_VERSION } from '@flashback/shared';
import { describe, expect, it } from 'vitest';
import {
  decideStart,
  DEFAULTS,
  detectLocale,
  isEditableTarget,
  matchesShortcut,
  parseShortcut,
  PAYLOAD_SCHEMA_VERSION,
  resolveConfig,
  FLASHBACK_VERSION,
} from '../src/config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('props and defaults (FR-CFG-02/03, §9.4)', () => {
  it('matches the FRD §9.4 defaults table', () => {
    expect(DEFAULTS).toEqual({
      endpoint: DEFAULT_ENDPOINT,
      maxRecordSeconds: 300,
      ignoreUrls: [],
      maskAllInputs: false,
      redact: true,
      shortcut: 'alt+shift+r',
      position: 'bottom-right',
      allowProduction: false,
    });
    expect(DEFAULT_ENDPOINT).toBe('http://127.0.0.1:4747');
    const cfg = resolveConfig({ locale: 'tr' });
    expect(cfg).toMatchObject({ endpoint: DEFAULT_ENDPOINT, maxRecordSeconds: 300, maskAllInputs: false, redact: { enabled: true }, shortcut: 'alt+shift+r', position: 'bottom-right' });
  });

  it('resolves redact variants and locale', () => {
    expect(resolveConfig({ redact: false }).redact).toEqual({ enabled: false });
    expect(resolveConfig({ redact: { keys: ['musteriNo'], phones: true } }).redact).toEqual({ enabled: true, keys: ['musteriNo'], phones: true });
    expect(resolveConfig({ endpoint: 'http://127.0.0.1:5858/' }).endpoint).toBe('http://127.0.0.1:5858');
    expect(detectLocale('tr-TR')).toBe('tr');
    expect(detectLocale('en-US')).toBe('en');
  });

  it('versions stay in sync with package.json and the shared schema', () => {
    expect(FLASHBACK_VERSION).toBe(pkg.version);
    expect(PAYLOAD_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  });
});

describe('production guard (FR-CFG-02/09)', () => {
  it('defaults to enabled outside production and disabled in production', () => {
    expect(decideStart({}, false)).toEqual({ start: true, productionWarning: false });
    expect(decideStart({}, true)).toEqual({ start: false, reason: 'disabled' });
    expect(decideStart({ enabled: false }, false)).toEqual({ start: false, reason: 'disabled' });
  });

  it('refuses enabled=true in production unless allowProduction (then warns persistently)', () => {
    expect(decideStart({ enabled: true }, true)).toEqual({ start: false, reason: 'production' });
    expect(decideStart({ enabled: true, allowProduction: true }, true)).toEqual({ start: true, productionWarning: true });
  });
});

describe('shortcut (FR-UI-02)', () => {
  const sc = parseShortcut('alt+shift+r');
  const key = (over: Partial<KeyboardEvent>) => ({ code: 'KeyR', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, ...over }) as KeyboardEvent;

  it('matches by event.code, so macOS Option characters do not matter', () => {
    expect(sc).toEqual({ code: 'KeyR', alt: true, shift: true, ctrl: false, meta: false });
    expect(matchesShortcut(key({ key: '®' } as Partial<KeyboardEvent>), sc)).toBe(true);
    expect(matchesShortcut(key({ shiftKey: false }), sc)).toBe(false);
    expect(matchesShortcut(key({ code: 'KeyT' }), sc)).toBe(false);
    expect(parseShortcut('ctrl+shift+1')).toMatchObject({ code: 'Digit1', ctrl: true });
    expect(parseShortcut('meta+f2')).toMatchObject({ code: 'F2', meta: true });
  });

  it('detects text-entry focus targets', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: () => null, ...extra }) as unknown as EventTarget;
    expect(isEditableTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isEditableTarget(el('BUTTON'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('sürüm', () => {
  it('FLASHBACK_VERSION paketin sürümüyle aynı (yayın iş akışı paket sürümünü etiketle karşılaştırır)', async () => {
    const { FLASHBACK_VERSION } = await import('../src/config.js');
    const fs = await import('node:fs');
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(FLASHBACK_VERSION).toBe(pkg.version);
  });
});
