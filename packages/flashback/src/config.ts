import type { RedactOptions } from './redact.js';
import type { FlashbackLocale, FlashbackProps } from './types.js';

export const FLASHBACK_VERSION = '0.2.0';

/** Prop varsayılanları. */
export const DEFAULTS = {
  shortcut: 'alt+shift+f',
  redact: true,
} as const;

/**
 * Hiç kaydedilmeyen istekler: Flashback'in kendi ucu ve geliştirme sunucularının HMR istekleri. Kullanıcının
 * `ignoreUrls` listesi bunlara eklenir.
 */
export const BUILTIN_IGNORE: RegExp[] = [/\/__flashback\//, /\/@vite\//, /\/__vite_ping/, /\/_next\/webpack-hmr/, /\/__nextjs/];

/**
 * Üretim ortamı mı?
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

/** Bileşen başlamalı mı? Üretimde `enabled` verilse de başlamaz. */
export function shouldStart(props: Pick<FlashbackProps, 'enabled'>, production = isProductionEnv()): boolean {
  return !production && (props.enabled ?? true);
}

export interface ResolvedConfig {
  ignoreUrls: Array<string | RegExp>;
  redact: RedactOptions;
  shortcut: string;
  locale: FlashbackLocale;
}

export function detectLocale(language = typeof navigator === 'undefined' ? '' : navigator.language): FlashbackLocale {
  return language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function resolveConfig(props: FlashbackProps): ResolvedConfig {
  const redact = props.redact ?? DEFAULTS.redact;
  return {
    ignoreUrls: [...BUILTIN_IGNORE, ...(props.ignoreUrls ?? [])],
    redact: redact === false ? { enabled: false } : redact === true ? { enabled: true } : { enabled: true, ...redact },
    shortcut: props.shortcut ?? DEFAULTS.shortcut,
    locale: props.locale ?? detectLocale(),
  };
}

export interface Shortcut {
  code: string;
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

/** `alt+shift+f` → `{ code: 'KeyF', alt, shift }` (`event.code` ile eşleşir; klavye düzeninden bağımsız). */
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

/** `alt+shift+f` → `Alt+Shift+F` (ipucu metni için). */
export function shortcutLabel(s: string): string {
  return s
    .split('+')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join('+');
}

/** Odak metin girişinde mi? (kısayol orada tetiklenmez) */
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
