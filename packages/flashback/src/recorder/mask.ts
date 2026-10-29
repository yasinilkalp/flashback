/**
 * Kayıt anında giriş maskeleme (FR-REC-08, FR-RED-11).
 * Aynı işlev hem rrweb `maskInputFn` hem de adım kaydı için kullanılır; böylece maskeli değer rrweb olaylarında,
 * adımlarda ve DOM'da aynı görünür.
 */
import { marker, Redactor, type RedactOptions } from '../redact.js';

export interface MaskResult {
  value: string;
  as?: string;
}

export type InputMasker = (value: string, el: Element) => MaskResult;

interface FieldInfo {
  type?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
}

function fieldInfo(el: Element): FieldInfo {
  const type = el.hasAttribute('data-rr-is-password') ? 'password' : (el.getAttribute('type') ?? (el as HTMLInputElement).type ?? undefined)?.toLowerCase();
  return {
    type,
    name: el.getAttribute('name') ?? undefined,
    id: el.getAttribute('id') ?? undefined,
    autocomplete: el.getAttribute('autocomplete') ?? undefined,
  };
}

/**
 * Alanın türü değeri tamamen gizlemeyi gerektiriyor mu? Kısmi değerlerin (ör. yazılırken `ali@ornek.c`) desene
 * takılmadan sızmaması için e-posta/telefon/kart alanları değerden bağımsız gizlenir.
 */
function fieldKind(info: FieldInfo, opts: RedactOptions): string | null {
  const hint = `${info.name ?? ''} ${info.id ?? ''} ${info.autocomplete ?? ''}`.toLowerCase();
  if (opts.emails !== false && (info.type === 'email' || /e-?mail/.test(hint))) return 'email';
  if (opts.phones === true && (info.type === 'tel' || /\btel\b|phone/.test(hint))) return 'phone';
  if (/cc-number|card-?number|kart/.test(hint)) return 'card';
  return null;
}

export function createInputMasker(opts: RedactOptions, maskAllInputs: boolean): InputMasker {
  const redactor = new Redactor(opts);
  return (value, el) => {
    if (!value) return { value };
    const info = fieldInfo(el);
    if (info.type === 'password') return redactor.input(value, info);
    if (redactor.enabled) {
      const kind = fieldKind(info, opts);
      if (kind) return { value: marker(kind), as: kind };
    }
    const r = redactor.input(value, info);
    if (r.as) return r;
    if (maskAllInputs) return { value: marker('input'), as: 'input' };
    return r;
  };
}
