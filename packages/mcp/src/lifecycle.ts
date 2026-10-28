import { renderAssertions, type Incident, type IncidentSummary, type ReproRun } from '@flashback/shared';
import { FlashbackError } from './errors.js';

/**
 * Olay yaşam döngüsü (FRD §7.9).
 *
 *   open ──mark_fixed(fixed, koşul var)──────────▶ fixed
 *   open ──mark_fixed(fixed, koşul yok + reason)─▶ fixed_unverified
 *   open ──mark_fixed(cannot_reproduce, ≥1 geçerli koşu)─▶ cannot_reproduce
 *   kapalı ──panelden yeniden aç──▶ open (koşular korunur; doğrulama baştan aranır)
 */

/** Geçerli koşu: `error` olmayan ve `unsafe` olmayan (FR-LIFE-04). */
export const isValidRun = (r: ReproRun) => r.status !== 'error' && !r.unsafe;

/** Doğrulamaya sayılan koşular: son yeniden açılmadan sonraki geçerli koşular (FR-LIFE-06). */
export function countedRuns(inc: Pick<Incident, 'repros' | 'reopenedAt'>): ReproRun[] {
  return inc.repros.filter((r) => isValidRun(r) && (!inc.reopenedAt || r.t > inc.reopenedAt));
}

export interface Verification {
  verified: boolean;
  /** Doğrulamayı sağlayan (ya da değerlendirilen) imza. */
  signature?: string;
  /** Doğrulanmadıysa eksik adım (FR-LIFE-05). */
  missing?: string;
}

/**
 * FR-LIFE-04: aynı imzayla (a) en az bir `failed_assertion` koşusu, (b) ondan sonra gelen son iki geçerli koşu
 * ardışık `passed`. Ayrıca doğrulayan yeşillerden sonra (hangi imzayla olursa olsun) kırmızı koşu bulunmamalıdır.
 * `runs` yalnızca geçerli koşuları içermelidir (bkz. `countedRuns`).
 */
export function evaluateVerification(runs: ReproRun[]): Verification {
  if (runs.length === 0) {
    return { verified: false, missing: 'Henüz geçerli koşu yok: önce run_repro ile hatayı kırmızı (failed_assertion) olarak yeniden üret.' };
  }
  const bySig = new Map<string, number[]>();
  runs.forEach((r, i) => bySig.set(r.signature, [...(bySig.get(r.signature) ?? []), i]));

  for (const [sig, idx] of bySig) {
    const own = idx.map((i) => runs[i]);
    const n = own.length;
    if (n < 3) continue;
    const [a, b] = [own[n - 2], own[n - 1]];
    const redBefore = own.slice(0, n - 2).some((r) => r.status === 'failed_assertion');
    if (a.status === 'passed' && b.status === 'passed' && redBefore) {
      const lastGreen = idx[n - 1];
      const laterRed = runs.slice(lastGreen + 1).some((r) => r.status === 'failed_assertion');
      if (!laterRed) return { verified: true, signature: sig };
    }
  }

  // Doğrulanmadı: son geçerli koşunun imzasına göre eksik adımı açıkla.
  const last = runs[runs.length - 1];
  const sig = last.signature;
  const own = runs.filter((r) => r.signature === sig);
  const lastRed = own.map((r) => r.status).lastIndexOf('failed_assertion');
  if (lastRed === -1) {
    const otherRed = runs.some((r) => r.status === 'failed_assertion');
    return {
      verified: false,
      signature: sig,
      missing: otherRed
        ? 'Kırmızı ve yeşil koşuların imzaları farklı (assertion, strict, base_url ya da storageState değişmiş). Aynı imzayla bir kırmızı, ardından iki ardışık yeşil koşu gerekiyor.'
        : 'Bu imzayla kırmızı (failed_assertion) koşu yok: hatanın düzeltmeden önce yeniden üretildiği kanıtlanmadı.',
    };
  }
  const greensAfter = own.length - 1 - lastRed;
  return {
    verified: false,
    signature: sig,
    missing:
      greensAfter === 0
        ? 'Son koşu kırmızı: düzeltmeden sonra aynı imzayla iki ardışık yeşil koşu gerekiyor.'
        : 'Aynı imzayla bir yeşil koşu daha gerekiyor.',
  };
}

export interface MarkFixedInput {
  resolution: 'fixed' | 'cannot_reproduce';
  summary: string;
  reason?: string;
}

export interface MarkFixedResult {
  status: Incident['status'];
  verified: boolean;
  missing?: string;
  note: Incident['note'];
  assertion?: string;
  runs: Array<Pick<ReproRun, 't' | 'status' | 'errorKind' | 'signature'>>;
}

/** `mark_fixed`: hedef durumu sunucu belirler (FR-MCP-08, FR-LIFE-01…05). `inc` yerinde değiştirilir. */
export function applyMarkFixed(inc: Incident, input: MarkFixedInput, now: Date): MarkFixedResult {
  if (inc.status !== 'open') {
    throw new FlashbackError('invalid_transition', `Olay zaten kapalı (${inc.status}); yalnızca açık olay kapatılabilir.`);
  }
  const runs = countedRuns(inc);
  const v = evaluateVerification(runs);
  const t = now.toISOString();
  let status: Incident['status'];
  if (input.resolution === 'cannot_reproduce') {
    if (runs.length === 0) {
      throw new FlashbackError(
        'invalid_transition',
        'cannot_reproduce için en az bir geçerli (error olmayan) koşu gerekiyor. Önce run_repro çalıştır.',
      );
    }
    status = 'cannot_reproduce';
  } else if (v.verified) {
    status = 'fixed';
  } else {
    if (!input.reason?.trim()) {
      throw new FlashbackError('reason_required', `Doğrulama koşulu sağlanmadı: ${v.missing}`, { missing: v.missing });
    }
    status = 'fixed_unverified';
  }
  inc.status = status;
  inc.pendingQuestion = false;
  inc.resolution = { kind: input.resolution, summary: input.summary, reason: input.reason?.trim() || undefined, t };
  const verified = status === 'fixed';
  return {
    status,
    verified,
    missing: verified ? undefined : v.missing,
    note: inc.note,
    assertion: assertionTextFor(inc, v.signature),
    runs: inc.repros.map(({ t: rt, status: s, errorKind, signature }) => ({ t: rt, status: s, errorKind, signature })),
  };
}

/** Panelden yeniden açma (FR-LIFE tablosu, FR-UI-18). Zaten açıksa 409 için `invalid_transition`. */
export function applyReopen(inc: Incident, reason: string, now: Date): void {
  if (inc.status === 'open') throw new FlashbackError('invalid_transition', 'Olay zaten açık.');
  const t = now.toISOString();
  inc.status = 'open';
  inc.resolution = undefined;
  inc.reopenedAt = t;
  inc.messages.push({ from: 'dev', text: `Olay yeniden açıldı. Gerekçe: ${reason || '(belirtilmedi)'}`, t });
}

/** Verilen imzanın (yoksa son geçerli koşunun) assertion metni. */
export function assertionTextFor(inc: Pick<Incident, 'repros'>, signature?: string): string | undefined {
  const valid = inc.repros.filter(isValidRun);
  const run = signature ? [...valid].reverse().find((r) => r.signature === signature) : valid[valid.length - 1];
  const r = run ?? inc.repros[inc.repros.length - 1];
  return r ? renderAssertions(r.assertionIR) : undefined;
}

/** Panel ve HTTP API için olay özeti (FR-UI-16). */
export function toSummary(inc: Incident): IncidentSummary {
  return {
    id: inc.id,
    status: inc.status,
    createdAt: inc.createdAt,
    url: inc.context.url,
    note: inc.note,
    pendingQuestion: inc.pendingQuestion,
    assertionText: assertionTextFor(inc, evaluateVerification(countedRuns(inc)).signature),
    runs: inc.repros.map(({ t, status, errorKind, signature, durationMs }) => ({ t, status, errorKind, signature, durationMs })),
    messages: inc.messages,
    resolution: inc.resolution,
    group: inc.group,
  };
}
