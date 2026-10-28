import { DEFAULT_ENDPOINT, type RedactOptions } from '@flashback/shared';
import type { FlashbackLocale, FlashbackPosition, FlashbackProps } from './types.js';

export const FLASHBACK_VERSION = '0.1.0-beta.1';

/**
 * Gönderilen olayın şema sürümü. `@flashback/shared` içindeki `SCHEMA_VERSION` ile aynıdır (birim testi denetler);
 * oradan içe aktarılmaz, çünkü o modül zod şemasını da yükler ve tarayıcı paketine zod girmesin.
 */
export const PAYLOAD_SCHEMA_VERSION = 1 as const;

/** FRD §9.4 prop varsayılanları (tek doğruluk kaynağı ile birebir). */
export const DEFAULTS = {
  endpoint: DEFAULT_ENDPOINT,
  maxRecordSeconds: 300,
  ignoreUrls: [] as Array<string | RegExp>,
  maskAllInputs: false,
  redact: true,
  shortcut: 'alt+shift+r',
  position: 'bottom-right' as FlashbackPosition,
  allowProduction: false,
} as const;

/** NFR-MEM-01: bir kaydın (klibin) bellek üst sınırı. */
export const MEMORY_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * Üretim ortamı mı? (FR-CFG-02)
 *
 * `process.env.NODE_ENV` bundler tarafından metin olarak değiştirildiği için `typeof process` korumasıyla
 * SARMALANMAZ (koruma değiştirmeyi etkisiz kılardı); tanımsızsa ReferenceError yakalanır.
 *
 * `import.meta.env` OKUNMAZ: modül olmayan çıktıda (webpack 5.103+ script/eval, SystemJS, single-spa)
 * `import.meta` ayrıştırma anında SyntaxError verir, try/catch onu yakalayamaz. Vite 5+ `PROD`'u zaten
 * `NODE_ENV`'den türetir.
 */
export function isProductionEnv(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    /* tarayıcıda process yok */
    return false;
  }
}

export type StartDecision =
  | { start: true; productionWarning: boolean }
  | { start: false; reason: 'disabled' | 'production' };

/** FR-CFG-02 / FR-CFG-09: bileşen başlamalı mı? */
export function decideStart(props: Pick<FlashbackProps, 'enabled' | 'allowProduction'>, production = isProductionEnv()): StartDecision {
  const enabled = props.enabled ?? !production;
  if (!enabled) return { start: false, reason: 'disabled' };
  if (production && !props.allowProduction) return { start: false, reason: 'production' };
  return { start: true, productionWarning: production };
}

export interface ResolvedConfig {
  endpoint: string;
  maxRecordSeconds: number;
  ignoreUrls: Array<string | RegExp>;
  maskAllInputs: boolean;
  redact: RedactOptions;
  shortcut: string;
  position: FlashbackPosition;
  locale: FlashbackLocale;
  productionWarning: boolean;
  project?: string;
}

export function detectLocale(language = typeof navigator === 'undefined' ? '' : navigator.language): FlashbackLocale {
  return language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function resolveConfig(props: FlashbackProps, productionWarning = false): ResolvedConfig {
  const redact = props.redact ?? DEFAULTS.redact;
  return {
    endpoint: (props.endpoint ?? DEFAULTS.endpoint).replace(/\/+$/, ''),
    maxRecordSeconds: Math.max(5, props.maxRecordSeconds ?? DEFAULTS.maxRecordSeconds),
    ignoreUrls: props.ignoreUrls ?? [...DEFAULTS.ignoreUrls],
    maskAllInputs: props.maskAllInputs ?? DEFAULTS.maskAllInputs,
    redact: redact === false ? { enabled: false } : redact === true ? { enabled: true } : { enabled: true, ...redact },
    shortcut: props.shortcut ?? DEFAULTS.shortcut,
    position: props.position ?? DEFAULTS.position,
    locale: props.locale ?? detectLocale(),
    productionWarning,
    project: props.project?.trim() || undefined,
  };
}

export interface Shortcut {
  code: string;
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

/** `alt+shift+r` → `{ code: 'KeyR', alt, shift }` (FR-UI-02: `event.code` ile eşleşme). */
export function parseShortcut(s: string): Shortcut {
  const out: Shortcut = { code: '', alt: false, shift: false, ctrl: false, meta: false };
  for (const raw of s.toLowerCase().split('+')) {
    const p = raw.trim();
    if (p === 'alt' || p === 'option') out.alt = true;
    else if (p === 'shift') out.shift = true;
    else if (p === 'ctrl' || p === 'control') out.ctrl = true;
    else if (p === 'meta' || p === 'cmd' || p === 'command') out.meta = true;
    else if (/^[a-z]$/.test(p)) out.code = `Key${p.toUpperCase()}`;
    else if (/^[0-9]$/.test(p)) out.code = `Digit${p}`;
    else if (/^f\d{1,2}$/.test(p)) out.code = p.toUpperCase();
    else if (p) out.code = p.charAt(0).toUpperCase() + p.slice(1);
  }
  return out;
}

export function matchesShortcut(e: Pick<KeyboardEvent, 'code' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>, s: Shortcut): boolean {
  return e.code === s.code && e.altKey === s.alt && e.shiftKey === s.shift && e.ctrlKey === s.ctrl && e.metaKey === s.meta;
}

/** Odak metin girişinde mi? (kısayol ve S tuşu orada tetiklenmez) */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as Element).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(type);
  }
  return el.isContentEditable === true || el.getAttribute('contenteditable') === 'true';
}
