/**
 * Olay sepeti (FR-BSK-01/02): durdurulan her kayıt sepete bir olay olarak girer; not ve öğe seçimi sonra yapılır.
 * Sepet sayfanın kökeninde IndexedDB'de durur ve sayfa yenilense de kalır. IndexedDB yoksa (özel pencere, test)
 * bellek içi yedeğe düşer. Özetler (`entries`) ile ağır veriler (klip ve gönderime hazır yük, `payloads`) ayrı
 * tutulur: liste ve rozet klipleri belleğe yüklemez.
 */
import type { MediaClip } from './recorder/media.js';
import type { FrozenSnapshot } from './recorder/recorder.js';
import { fileStamp } from './transport.js';

export interface BasketEntry {
  id: string;
  /** Sepetteki sıra numarası ("Olay 2"); sepet boşalınca 1'den başlar. */
  n: number;
  createdAt: number;
  durationMs: number;
  url: string;
  /** Not yazılıp gönderime hazır yük kuruldu mu? */
  ready: boolean;
  note?: { what?: string; expected: string };
  /** Klip bellek sınırında kesildi (NFR-MEM-01). */
  truncated: boolean;
  /** Ekran/mikrofon kaydı (FR-REC-16); dosyanın kendisi `payloads` içinde. */
  media?: { source: MediaClip['source']; video: boolean; audio: boolean; bytes: number };
}

/** Gönderime hazır, gizlenmiş ve serileştirilmiş olay (alıcıya giden gövdenin aynısı). */
export interface BasketDraft {
  body: string;
  /** Gövde ekran kaydı bildiriyor: olay oluşturulunca `.webm` ayrıca yüklenir. */
  media?: boolean;
}

const DB_NAME = 'flashback-devtools';
const DB_VERSION = 1;
const ENTRIES = 'entries';
const PAYLOADS = 'payloads';

const clipKey = (id: string) => `${id}:clip`;
const draftKey = (id: string) => `${id}:draft`;
const mediaKey = (id: string) => `${id}:media`;

interface Backend {
  all(): Promise<BasketEntry[]>;
  get<T>(store: string, key: string): Promise<T | undefined>;
  put(store: string, key: string, value: unknown): Promise<void>;
  remove(keys: Array<[store: string, key: string]>): Promise<void>;
  clear(): Promise<void>;
}

class MemoryBackend implements Backend {
  private readonly stores = new Map<string, Map<string, unknown>>([
    [ENTRIES, new Map()],
    [PAYLOADS, new Map()],
  ]);

  async all() {
    return [...this.stores.get(ENTRIES)!.values()] as BasketEntry[];
  }
  async get<T>(store: string, key: string) {
    return this.stores.get(store)!.get(key) as T | undefined;
  }
  async put(store: string, key: string, value: unknown) {
    this.stores.get(store)!.set(key, value);
  }
  async remove(keys: Array<[string, string]>) {
    for (const [store, key] of keys) this.stores.get(store)!.delete(key);
  }
  async clear() {
    for (const s of this.stores.values()) s.clear();
  }
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB işlemi iptal edildi'));
  });
}

class IdbBackend implements Backend {
  constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory): Promise<IdbBackend> {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES);
      if (!db.objectStoreNames.contains(PAYLOADS)) db.createObjectStore(PAYLOADS);
    };
    const db = await done(req);
    // Başka bir sekme veritabanını silmek ya da yükseltmek isterse bağlantı bırakılır; aksi hâlde o istek ve
    // ardından gelen her açılış süresiz bekler.
    db.onversionchange = () => db.close();
    return new IdbBackend(db);
  }

  async all() {
    return done(this.db.transaction(ENTRIES).objectStore(ENTRIES).getAll() as IDBRequest<BasketEntry[]>);
  }
  async get<T>(store: string, key: string) {
    return done(this.db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
  }
  async put(store: string, key: string, value: unknown) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await committed(tx);
  }
  async remove(keys: Array<[string, string]>) {
    const tx = this.db.transaction([ENTRIES, PAYLOADS], 'readwrite');
    for (const [store, key] of keys) tx.objectStore(store).delete(key);
    await committed(tx);
  }
  async clear() {
    const tx = this.db.transaction([ENTRIES, PAYLOADS], 'readwrite');
    tx.objectStore(ENTRIES).clear();
    tx.objectStore(PAYLOADS).clear();
    await committed(tx);
  }
}

/**
 * Store durumları fonksiyon gibi kopyalanamayan değerler taşıyabilir (zustand eylemleri). Yük zaten JSON'a
 * serileştirildiği için klip de JSON'un taşıyabildiğiyle saklanır.
 */
function cloneable(snapshot: FrozenSnapshot): FrozenSnapshot {
  return { ...snapshot, store: JSON.parse(JSON.stringify(snapshot.store)) as FrozenSnapshot['store'] };
}

const byNumber = (a: BasketEntry, b: BasketEntry) => a.n - b.n;

function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** `grp-YYYYMMDD-HHMMSS-xxxx` (UTC): birlikte gönderilen olayların grubu (FR-BSK-05; alıcıdaki biçimle aynı). */
export function createGroupId(now = new Date()): string {
  return `grp-${fileStamp(now)}-${randomSuffix()}`;
}

export class Basket {
  private constructor(
    private readonly backend: Backend,
    /** IndexedDB'de mi (sayfa yenilense de kalır)? */
    readonly persistent: boolean,
  ) {}

  static async open(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): Promise<Basket> {
    if (factory) {
      try {
        return new Basket(await IdbBackend.open(factory), true);
      } catch {
        /* özel pencere ya da engelli depolama: bellek içi yedek */
      }
    }
    return new Basket(new MemoryBackend(), false);
  }

  async list(): Promise<BasketEntry[]> {
    return (await this.backend.all()).sort(byNumber);
  }

  async add(snapshot: FrozenSnapshot, url: string, media?: MediaClip | null): Promise<BasketEntry> {
    const existing = await this.list();
    const entry: BasketEntry = {
      id: `clip-${snapshot.windowStart}-${randomSuffix()}`,
      n: (existing[existing.length - 1]?.n ?? 0) + 1,
      createdAt: snapshot.frozenAt,
      durationMs: snapshot.frozenAt - snapshot.windowStart,
      url,
      ready: false,
      truncated: snapshot.memoryWarning,
      ...(media ? { media: { source: media.source, video: media.video, audio: media.audio, bytes: media.blob.size } } : {}),
    };
    await this.backend.put(PAYLOADS, clipKey(entry.id), cloneable(snapshot));
    if (media) await this.backend.put(PAYLOADS, mediaKey(entry.id), media);
    await this.backend.put(ENTRIES, entry.id, entry);
    return entry;
  }

  clip(id: string): Promise<FrozenSnapshot | undefined> {
    return this.backend.get<FrozenSnapshot>(PAYLOADS, clipKey(id));
  }

  media(id: string): Promise<MediaClip | undefined> {
    return this.backend.get<MediaClip>(PAYLOADS, mediaKey(id));
  }

  draft(id: string): Promise<BasketDraft | undefined> {
    return this.backend.get<BasketDraft>(PAYLOADS, draftKey(id));
  }

  /** Not yazılmış, gönderime hazır yükü saklar; olay "hazır" olur. */
  async setDraft(id: string, draft: BasketDraft, note: BasketEntry['note']): Promise<BasketEntry> {
    const entry = await this.backend.get<BasketEntry>(ENTRIES, id);
    if (!entry) throw new Error(`Sepette yok: ${id}`);
    const next: BasketEntry = { ...entry, ready: true, note };
    await this.backend.put(PAYLOADS, draftKey(id), draft);
    await this.backend.put(ENTRIES, id, next);
    return next;
  }

  remove(id: string): Promise<void> {
    return this.backend.remove([
      [ENTRIES, id],
      [PAYLOADS, clipKey(id)],
      [PAYLOADS, draftKey(id)],
      [PAYLOADS, mediaKey(id)],
    ]);
  }

  clear(): Promise<void> {
    return this.backend.clear();
  }
}
