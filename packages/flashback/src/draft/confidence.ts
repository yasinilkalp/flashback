/**
 * Kanıt güveni bloğu (FR-PKG-08). En fazla 8 madde, her biri `ok` ya da `warn`; uyarıda ajanın ne yapacağı
 * tek satırlık `hint` ile yazılır. Metinler ajana gittiği için Türkçedir.
 */
import type { ConfidenceItem, IncidentDraftInput } from '@flashback/shared';
import type { FrozenSnapshot } from '../recorder/recorder.js';

const SESSION_RE = /sid|session|token|auth/i;

export interface ConfidenceInput {
  draft: IncidentDraftInput;
  snapshot: Pick<FrozenSnapshot, 'steps' | 'evicted'>;
  truncated: string[];
  excluded: string[];
  sessionHint: { cookieNames: string[]; storageKeys: string[] };
  /** Kaynak satırı öğenin değil en yakın atanın JSX'i (EK-B3). */
  sourceFromAncestor?: boolean;
}

const ok = (key: string, message: string): ConfidenceItem => ({ key, level: 'ok', message });
const warn = (key: string, message: string, hint: string): ConfidenceItem => ({ key, level: 'warn', message, hint });

/**
 * Birincil kanıtın sabit biçimli kısa özeti. Kanıt güveni bloğu çitsiz olduğu için yalnızca yöntem, URL yolu
 * (URL ayrıştırıcısının kodladığı biçimde, sorgusuz) ve durum içerir; ileti/gövde gibi serbest metin içermez.
 */
export function describeEvidence(draft: IncidentDraftInput): string {
  const pe = draft.primaryEvidence;
  if (pe.kind === 'network' && pe.ref !== undefined) {
    const n = draft.network?.[pe.ref];
    if (n) return `${n.method} ${pathnameOf(n.url).slice(0, 80)} → ${n.error ? 'ağ hatası' : n.status}`;
  }
  if (pe.kind === 'console' && pe.ref !== undefined) {
    const c = draft.console?.[pe.ref];
    if (c) return `konsol ${c.level} (t+${(c.t / 1000).toFixed(1)} sn)`;
  }
  return 'hedef öğe';
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '(geçersiz URL)';
  }
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function sourceItem(draft: IncidentDraftInput, fromAncestor = false): ConfidenceItem {
  const t = draft.target;
  if (!t) return ok('source', 'kaynak: sayfa düzeyi olay — hedef öğe yok');
  if (!t.file) {
    return warn('source', 'kaynak: bulunamadı (React fiber/kaynak bilgisi yok)', 'Dosya:satır yok; seçici ve bileşen yığınıyla dosyayı ara.');
  }
  const where = `${t.file}:${t.line}`;
  if (!t.resolved) {
    return warn('source', `kaynak: source map çözülemedi — derlenmiş konum (${where})`, 'Bu satıra güvenme; bileşen yığını ve seçiciyle orijinal dosyayı bul.');
  }
  if (fromAncestor) {
    return warn('source', `kaynak: ${where} — öğenin kendisinin değil, onu oluşturan en yakın atanın JSX'i`, 'Öğe bağımlılık kodunda ya da sahip yığını olmadan oluşturulmuş; bu satırdan başla, öğeyi seçici ve HTML ile doğrula.');
  }
  if (!t.snippet) {
    return warn('source', `kaynak: ${where} (source map ile çözüldü, kod parçası yok)`, 'Dosya düzenlendiyse satır kaymış olabilir; satırı içerikle doğrula.');
  }
  return ok('source', `kaynak: ${where} (source map ile çözüldü, ±3 satır kod parçası ve dosya özeti var)`);
}

function elementItem(draft: IncidentDraftInput): ConfidenceItem {
  const t = draft.target;
  if (!t) {
    return draft.primaryEvidence.kind === 'target'
      ? warn('element', 'öğe: seçilmedi ve yakında hata işaretçisi yok', 'Geliştiricinin notunu ve adımları birincil kanıt olarak kullan.')
      : ok('element', `öğe: seçilmedi; birincil kanıt otomatik: ${describeEvidence(draft)}`);
  }
  if (t.resolution === 'exact') return ok('element', 'öğe eşleme: tam (canlı DOM düğümü)');
  if (t.resolution === 'ancestor') {
    return warn('element', 'öğe eşleme: öğe canlı sayfada yok; bileşen ve kaynak en yakın atadan', 'Seçici ve HTML anlık görüntüden; dosya:satır atayı gösterir, öğenin kendisini değil.');
  }
  return warn('element', 'öğe eşleme: canlı karşılık yok; yalnızca anlık görüntü', 'Bileşen ve kaynak bilinmiyor; seçici ve HTML ile ara.');
}

function preWindowItem(input: ConfidenceInput): ConfidenceItem {
  const reasons: string[] = [];
  const sessionNames = [...input.sessionHint.cookieNames, ...input.sessionHint.storageKeys].filter((n) => SESSION_RE.test(n));
  if (sessionNames.length) reasons.push(`oturum izi: ${sessionNames.slice(0, 3).join(', ')}`);
  if (input.snapshot.evicted) reasons.push('kayıt penceresi sayfa yüklenişinden sonra başlıyor');
  const firstStep = input.snapshot.steps[0];
  if (firstStep && input.draft.context.startUrl && firstStep.pageUrl !== undefined && !sameUrl(firstStep.pageUrl, input.draft.context.startUrl)) {
    reasons.push('ilk adım pencere başlangıç URL\'sinde değil');
  }
  if (!reasons.length) return ok('preWindow', 'pencere öncesi durum: oturum ya da birikmiş durum izi yok');
  return warn('preWindow', `pencere öncesi durum: ${reasons.join('; ')}`, 'Repro başlangıç durumunu içermeyebilir; gerekirse FLASHBACK_STORAGE_STATE tanımla ya da geliştiriciye sor.');
}

function sameUrl(a: string, b: string): boolean {
  // b gizlenmiş olabilir; karşılaştırma yalnızca köken + yol üzerinden.
  return pathOf(a).split('?')[0] === pathOf(b).split('?')[0];
}

function redactionItem(draft: IncidentDraftInput): ConfidenceItem {
  const red = draft.redaction;
  if (!red.enabled) {
    return warn('redaction', 'Gizleme: KAPALI — veri kaydedildiği gibi gönderildi', 'Paketteki değerler gerçek olabilir; dışarı aktarmadan önce dikkat et.');
  }
  const parts = Object.entries(red.byType ?? {}).map(([k, v]) => `${k} ${v}`);
  return ok('redaction', `gizleme: açık — ${red.count} değer${parts.length ? ` (${parts.join(', ')})` : ''}`);
}

function syntheticItem(draft: IncidentDraftInput): ConfidenceItem {
  const types = (draft.steps ?? []).filter((s) => s.valueRedactedAs).map((s) => s.valueRedactedAs as string);
  if (!types.length) return ok('synthetic', 'sentetik girişler: yok');
  return warn(
    'synthetic',
    `sentetik girişler: ${types.length} gizli giriş (${Array.from(new Set(types)).join(', ')}); repro sentetik değer kullanır`,
    'Gerçek değere bağlı davranışı varsayma; parola gerekiyorsa FLASHBACK_PASSWORD tanımla.',
  );
}

export function confidenceItems(input: ConfidenceInput): ConfidenceItem[] {
  const { draft, truncated, excluded } = input;
  const cut = [...truncated, ...excluded.map((e) => `${e} (geliştirici hariç tuttu)`)];
  return [
    sourceItem(draft, input.sourceFromAncestor),
    elementItem(draft),
    warn('propsState', 'props/state: canlı (geçmiş değil)', 'Geçmişteki değerler için store değişikliklerine ve ağ yanıtlarına bak.'),
    preWindowItem(input),
    cut.length ? warn('truncated', `kırpılan: ${cut.join('; ')}`, 'Ayrıntı için get_incident_events / get_dom_snapshot kullan.') : ok('truncated', 'kırpma: yok'),
    redactionItem(draft),
    syntheticItem(draft),
  ];
}
