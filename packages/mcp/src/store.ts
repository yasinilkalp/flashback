import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  IncidentSchema,
  LIMITS,
  createIncidentId,
  isIncidentId,
  type Incident,
  type IncidentDraft,
} from '@flashback/shared';
import { FlashbackError } from './errors.js';

/** Kota dolu ve silinebilecek kapalı olay yok (FR-RCV-09 → 507). */
export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

export interface StoreOptions {
  maxIncidents?: number;
  maxBytes?: number;
  now?: () => Date;
  /** Uyarı günlüğü (stderr). */
  log?: (msg: string) => void;
}

const POSIX = process.platform !== 'win32';
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export const isClosed = (i: Pick<Incident, 'status'>) => i.status !== 'open';

/**
 * `.flashback/` deposu: her olay `<dir>/<id>.json`, repro dosyaları `<dir>/repro/<id>.*`.
 * Tüm dosya işlemleri senkrondur; böylece süreç içinde oku-değiştir-yaz adımları bölünmez.
 */
export class IncidentStore {
  readonly dir: string;
  readonly reproDir: string;
  private readonly maxIncidents: number;
  private readonly maxBytes: number;
  private readonly now: () => Date;
  private readonly log: (msg: string) => void;
  /** Liste için hafif kopyalar; dosyanın mtime/boyutu değişince yeniden okunur. */
  private readonly cache = new Map<string, { mtimeMs: number; size: number; light: Incident }>();
  private readonly locks = new Set<string>();

  constructor(dir: string, opts: StoreOptions = {}) {
    this.dir = path.resolve(dir);
    this.reproDir = path.join(this.dir, 'repro');
    this.maxIncidents = opts.maxIncidents ?? LIMITS.maxIncidents;
    this.maxBytes = opts.maxBytes ?? LIMITS.maxStoreBytes;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? ((m) => process.stderr.write(`[flashback-mcp] ${m}\n`));
  }

  /** Klasörleri (0700) ve `*` içeren `.gitignore` dosyasını oluşturur (FR-RCV-02, FR-RCV-SEC-06). */
  init(): void {
    for (const d of [this.dir, this.reproDir]) {
      fs.mkdirSync(d, { recursive: true, mode: DIR_MODE });
      if (POSIX) fs.chmodSync(d, DIR_MODE);
    }
    const gi = path.join(this.dir, '.gitignore');
    if (!fs.existsSync(gi)) this.writeAtomic(gi, '# Flashback olay klasörü — git\'e girmez.\n*\n');
  }

  /** Kimliği doğrular ve dosya yolunu klasör içinde tutar (FR-RCV-SEC-04). */
  resolvePath(id: unknown): string {
    if (!isIncidentId(id)) throw new FlashbackError('invalid_id', `Geçersiz olay kimliği: ${JSON.stringify(String(id).slice(0, 80))}`);
    const p = path.resolve(this.dir, `${id}.json`);
    if (path.dirname(p) !== this.dir) throw new FlashbackError('invalid_id', 'Olay yolu klasör dışına çıkıyor.');
    return p;
  }

  /** Atomik yazma: geçici dosya + rename (0600). */
  writeAtomic(file: string, data: string | Buffer): void {
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
    try {
      fs.writeFileSync(tmp, data, { mode: FILE_MODE });
      if (POSIX) fs.chmodSync(tmp, FILE_MODE);
      fs.renameSync(tmp, file);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  }

  get(id: string): Incident | undefined {
    const file = this.resolvePath(id);
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = undefined;
    }
    const parsed = IncidentSchema.safeParse(json);
    if (!parsed.success) {
      this.log(`${id}.json şemaya uymuyor; yok sayıldı.`);
      return undefined;
    }
    return parsed.data;
  }

  /** Olay yoksa `incident_not_found` fırlatır. */
  require(id: string): Incident {
    const inc = this.get(id);
    if (!inc) throw new FlashbackError('incident_not_found', `Olay bulunamadı: ${id}`);
    return inc;
  }

  private ids(): string[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter(isIncidentId);
  }

  /**
   * Tüm olayların hafif kopyaları (DOM, rrweb olayları, gövdeler ve store çıkarılmış), yeniden eskiye.
   * Özet, liste ve kota hesapları için yeterlidir; tam olay için `get` kullanın.
   */
  list(): Incident[] {
    const out: Incident[] = [];
    const seen = new Set<string>();
    for (const id of this.ids()) {
      seen.add(id);
      const file = path.join(this.dir, `${id}.json`);
      let st: fs.Stats;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      const hit = this.cache.get(id);
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
        out.push(hit.light);
        continue;
      }
      let inc: Incident | undefined;
      try {
        inc = this.get(id);
      } catch {
        inc = undefined;
      }
      if (!inc) continue;
      const light = lighten(inc);
      this.cache.set(id, { mtimeMs: st.mtimeMs, size: st.size, light });
      out.push(light);
    }
    for (const id of this.cache.keys()) if (!seen.has(id)) this.cache.delete(id);
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
  }

  save(incident: Incident): void {
    const file = this.resolvePath(incident.id);
    this.writeAtomic(file, JSON.stringify(incident));
  }

  /** Oku → değiştir → atomik yaz. */
  update(id: string, fn: (inc: Incident) => void): Incident {
    const inc = this.require(id);
    fn(inc);
    this.save(inc);
    return inc;
  }

  /** Taslaktan olay oluşturur: kimlik, projectId, durum, zaman sunucuda atanır; kota uygulanır. */
  create(draft: IncidentDraft, projectId: string): Incident {
    const now = this.now();
    let id = createIncidentId(now);
    for (let i = 0; fs.existsSync(path.join(this.dir, `${id}.json`)); i++) {
      if (i > 50) throw new Error('Benzersiz olay kimliği üretilemedi.');
      id = createIncidentId(now);
    }
    const incident: Incident = IncidentSchema.parse({
      ...draft,
      id,
      projectId,
      status: 'open',
      pendingQuestion: false,
      createdAt: now.toISOString(),
      repros: [],
      messages: [],
    });
    const json = JSON.stringify(incident);
    this.ensureRoom(Buffer.byteLength(json));
    this.writeAtomic(this.resolvePath(id), json);
    return incident;
  }

  /** Klasördeki toplam olay sayısı ve bayt (repro dosyaları dahil). */
  usage(): { count: number; bytes: number } {
    return { count: this.ids().length, bytes: dirSize(this.dir) };
  }

  /**
   * FR-RCV-09: yer açılana kadar en eski KAPALI olayları siler. Açık olaylara dokunulmaz;
   * yer açılamazsa `QuotaError`.
   */
  ensureRoom(newBytes: number): void {
    let { count, bytes } = this.usage();
    const fits = () => count + 1 <= this.maxIncidents && bytes + newBytes <= this.maxBytes;
    if (fits()) return;
    const closed = this.list()
      .filter(isClosed)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    for (const victim of closed) {
      this.delete(victim.id);
      this.log(`Kota: kapalı olay silindi (${victim.id}).`);
      ({ count, bytes } = this.usage());
      if (fits()) return;
    }
    throw new QuotaError(
      `Olay kotası dolu (${count}/${this.maxIncidents} olay, ${(bytes / 1048576).toFixed(1)}/${(this.maxBytes / 1048576).toFixed(0)} MB) ve silinebilecek kapalı olay yok.`,
    );
  }

  /** Olayı ve ona ait repro dosyalarını/ekran görüntülerini siler. */
  delete(id: string): void {
    fs.rmSync(this.resolvePath(id), { force: true });
    this.cache.delete(id);
    this.removeReproFiles(id);
  }

  private removeReproFiles(id: string): void {
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.reproDir);
    } catch {
      return;
    }
    for (const n of names) {
      if (n.startsWith(`${id}.`) || n.startsWith(`${id}-`)) {
        fs.rmSync(path.join(this.reproDir, n), { recursive: true, force: true });
      }
    }
  }

  /**
   * FR-RCV-10: saklama süresini aşan kapalı olayları siler. `all: true` yaşa bakmadan tüm kapalı olayları siler.
   * Açık olaylar hiçbir zaman silinmez. Sahipsiz repro dosyaları da temizlenir. Yalnızca bu klasör altında çalışır.
   */
  prune(opts: { retentionDays: number; all?: boolean }): string[] {
    const cutoff = this.now().getTime() - opts.retentionDays * 86_400_000;
    const deleted: string[] = [];
    const existing = new Set<string>();
    for (const inc of this.list()) {
      const closedAt = Date.parse(inc.resolution?.t ?? inc.createdAt);
      if (isClosed(inc) && (opts.all || closedAt < cutoff)) {
        this.delete(inc.id);
        deleted.push(inc.id);
      } else existing.add(inc.id);
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.reproDir);
    } catch {
      /* repro klasörü yok */
    }
    for (const n of names) {
      const m = /^(fb-\d{8}-\d{6}-[a-z0-9]{4})[.-]/.exec(n);
      if (m && !existing.has(m[1])) fs.rmSync(path.join(this.reproDir, n), { recursive: true, force: true });
    }
    return deleted;
  }

  /** FR-REPRO-21: olay başına tek koşu. Kilit alınamazsa `false`. */
  tryLock(id: string): boolean {
    if (this.locks.has(id)) return false;
    this.locks.add(id);
    return true;
  }

  unlock(id: string): void {
    this.locks.delete(id);
  }
}

function dirSize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else if (e.isFile()) {
      try {
        total += fs.statSync(p).size;
      } catch {
        /* yarışta silinmiş */
      }
    }
  }
  return total;
}

/** Listeleme için büyük alanları çıkarılmış kopya. */
function lighten(inc: Incident): Incident {
  return {
    ...inc,
    domSnapshot: '',
    events: [],
    store: [],
    network: inc.network.map(({ reqBody: _rq, resBody: _rs, ...rest }) => rest),
    target: inc.target ? { ...inc.target, html: undefined, props: undefined, state: undefined, computedStyle: undefined } : null,
  };
}
