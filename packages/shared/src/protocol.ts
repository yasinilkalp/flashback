import type { IncidentGroup, IncidentStatus, Message, ReproRun } from './schema.js';

/** Tarayıcı dışı istemcilerin göndermesi gereken başlık (FR-RCV-SEC-02). */
export const CLIENT_HEADER = 'x-flashback-client';
/**
 * Tarayıcının hangi proje için gönderdiğini bildiren isteğe bağlı başlık (FR-RCV-06). Değer, projenin `package.json`
 * `name` alanıdır; alıcının projesiyle uyuşmazsa olay 409 ile reddedilir.
 */
export const PROJECT_HEADER = 'x-flashback-project';
export const DEFAULT_PORT = 4747;
export const DEFAULT_ENDPOINT = `http://127.0.0.1:${DEFAULT_PORT}`;

/** HTTP alıcı API'si (FRD §9.3). */
export const ROUTES = {
  health: '/health',
  incidents: '/incidents',
  incident: (id: string) => `/incidents/${id}`,
  messages: (id: string) => `/incidents/${id}/messages`,
  reopen: (id: string) => `/incidents/${id}/reopen`,
} as const;

export interface HealthResponse {
  name: 'flashback-mcp';
  version: string;
  schemaVersion: number;
  projectId: string;
  projectName: string;
}

/** Panelin Kayıtlar sekmesi için olay özeti (FR-UI-16). */
export interface IncidentSummary {
  id: string;
  status: IncidentStatus;
  createdAt: string;
  url: string;
  note: { what?: string; expected: string };
  pendingQuestion: boolean;
  /** Son kırmızı/yeşil koşuda kullanılan assertion'ların okunur metni. */
  assertionText?: string;
  runs: Array<Pick<ReproRun, 't' | 'status' | 'errorKind' | 'signature' | 'durationMs'>>;
  messages: Message[];
  resolution?: { kind: 'fixed' | 'cannot_reproduce'; summary: string; reason?: string; t: string };
  /** Sepetten birlikte gönderildiyse grubu (FR-BSK-05). */
  group?: IncidentGroup;
}
