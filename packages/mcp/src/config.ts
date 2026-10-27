import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_PORT, LIMITS } from '@flashback/shared';

/** Başlatmayı durduran yapılandırma hatası. Mesaj Türkçedir ve doğrudan kullanıcıya gösterilir. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface FlashbackConfig {
  port: number;
  host: string;
  /** Olay klasörü (FR-RCV-03). */
  dir: string;
  /** `run_repro`'nun `@playwright/test` paketini aradığı proje kökü. */
  projectRoot: string;
  projectId: string;
  projectName: string;
  /** `FLASHBACK_ALLOW_ORIGINS`: localhost dışında izin verilen kökenler (normalize edilmiş `origin`). */
  allowOrigins: string[];
  baseUrl?: string;
  storageState?: string;
  /** FR-REPRO-13: parola alanları için repro değeri; diske yazılmaz, yalnızca test sürecinin ortamına verilir. */
  password?: string;
  maxBodyBytes: number;
  retentionDays: number;
  reproTimeoutS: number;
  allowUnsafeAssertions: boolean;
  /** `FLASHBACK_NO_IMAGES=1`: run_repro ekran görüntüsünü görüntü içeriği yerine dosya yolu olarak döndürür (FR-MCP-12). */
  noImages: boolean;
  /** FR-RCV-SEC-08: dakika başına kabul edilen en fazla olay (0 = sınırsız). */
  rateLimitPerMin: number;
  unsafeExpose: boolean;
}

export interface LoadConfigOptions {
  cwd?: string;
  homedir?: string;
  unsafeExpose?: boolean;
}

const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]']);

/** 127.0.0.0/8, ::1 ve localhost loopback sayılır. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  if (LOOPBACK_HOSTS.has(h)) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

function numEnv(env: NodeJS.ProcessEnv, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) throw new ConfigError(`${name} geçersiz: "${raw}" (en az ${min} olmalı).`);
  return Math.min(n, max);
}

function flagEnv(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = env[name];
  return v === '1' || v === 'true';
}

/** `cwd`'den yukarı doğru ilk `package.json` klasörü. */
export function findPackageRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function realpathOr(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function readPackageName(root: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name?: unknown };
    return typeof pkg.name === 'string' ? pkg.name : undefined;
  } catch {
    return undefined;
  }
}

/** `projectId`: proje kök yolunun (realpath) ve package.json adının kısa özeti (§4). */
export function computeProjectId(projectRoot: string): { projectId: string; projectName: string } {
  const real = realpathOr(projectRoot);
  const name = readPackageName(real) ?? '';
  const projectId = createHash('sha256').update(`${real}\0${name}`).digest('hex').slice(0, 12);
  return { projectId, projectName: name || path.basename(real) };
}

/** URL listesi → normalize edilmiş köken listesi. Geçersiz girdi başlatmayı durdurur. */
function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        throw new ConfigError(`FLASHBACK_ALLOW_ORIGINS içinde geçersiz köken: "${s}"`);
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new ConfigError(`FLASHBACK_ALLOW_ORIGINS yalnızca http(s) kökenleri kabul eder: "${s}"`);
      }
      return u.origin;
    });
}

/**
 * Ortam değişkenlerinden yapılandırmayı okur (§9.4, FR-CFG-05).
 * Olay klasörü sırası (FR-RCV-03): FLASHBACK_DIR > FLASHBACK_PROJECT_ROOT/.flashback > cwd'den yukarı ilk package.json klasörü/.flashback.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, opts: LoadConfigOptions = {}): FlashbackConfig {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const home = realpathOr(opts.homedir ?? os.homedir());
  const unsafeExpose = opts.unsafeExpose === true;

  const host = env.FLASHBACK_HOST || '127.0.0.1';
  if (!isLoopbackHost(host) && !unsafeExpose) {
    throw new ConfigError(
      `FLASHBACK_HOST=${host} loopback değil. Alıcı yerel ağa açılmaz (FR-RCV-SEC-03). ` +
        'Bilerek açmak istiyorsanız --unsafe-expose bayrağını verin (önerilmez).',
    );
  }
  const port = numEnv(env, 'FLASHBACK_PORT', DEFAULT_PORT, 1, 65535);

  const explicitRoot = env.FLASHBACK_PROJECT_ROOT ? path.resolve(cwd, env.FLASHBACK_PROJECT_ROOT) : undefined;
  const projectRoot = explicitRoot ?? findPackageRoot(cwd) ?? cwd;

  let dir: string;
  if (env.FLASHBACK_DIR) dir = path.resolve(cwd, env.FLASHBACK_DIR);
  else dir = path.join(projectRoot, '.flashback');

  // Ev dizinine ve kök dizine yazma reddedilir (FR-RCV-03).
  const realDir = realpathOr(dir);
  const owner = env.FLASHBACK_DIR ? realDir : realpathOr(projectRoot);
  const fsRoot = path.parse(owner).root;
  if (owner === home || owner === fsRoot || realDir === home || realDir === fsRoot) {
    throw new ConfigError(
      `Olay klasörü ${dir} olarak çözüldü; ev dizinine ya da kök dizine yazılmaz (FR-RCV-03). ` +
        'flashback-mcp\'yi proje klasöründe çalıştırın ya da FLASHBACK_PROJECT_ROOT / FLASHBACK_DIR verin.',
    );
  }

  const { projectId, projectName } = computeProjectId(projectRoot);

  return {
    port,
    host,
    dir,
    projectRoot,
    projectId,
    projectName,
    allowOrigins: parseOrigins(env.FLASHBACK_ALLOW_ORIGINS),
    baseUrl: env.FLASHBACK_BASE_URL || undefined,
    storageState: env.FLASHBACK_STORAGE_STATE ? path.resolve(cwd, env.FLASHBACK_STORAGE_STATE) : undefined,
    password: env.FLASHBACK_PASSWORD || undefined,
    maxBodyBytes: numEnv(env, 'FLASHBACK_MAX_BODY_MB', 5, 0.001, 1024) * 1024 * 1024,
    retentionDays: numEnv(env, 'FLASHBACK_RETENTION_DAYS', 30, 0, 36500),
    reproTimeoutS: numEnv(env, 'FLASHBACK_REPRO_TIMEOUT_S', LIMITS.reproTimeoutS, 1, LIMITS.reproTimeoutMaxS),
    allowUnsafeAssertions: flagEnv(env, 'FLASHBACK_ALLOW_UNSAFE_ASSERTIONS'),
    noImages: flagEnv(env, 'FLASHBACK_NO_IMAGES'),
    rateLimitPerMin: numEnv(env, 'FLASHBACK_RATE_LIMIT_PER_MIN', 30, 0, 100_000),
    unsafeExpose,
  };
}

/**
 * URL'nin repro hedefi olarak kabul edilip edilmediği (FR-REPRO-SEC-03).
 * Yalnızca http(s); loopback ya da FLASHBACK_ALLOW_ORIGINS içindeki kökenler.
 */
export function checkTargetUrl(raw: string, allowOrigins: string[]): { ok: true; url: URL } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'geçersiz URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `${u.protocol} şeması kabul edilmez; yalnızca http(s)` };
  }
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (isLoopbackHost(hostname) || allowOrigins.includes(u.origin)) return { ok: true, url: u };
  return { ok: false, reason: `${u.origin} loopback değil ve FLASHBACK_ALLOW_ORIGINS içinde yok` };
}
