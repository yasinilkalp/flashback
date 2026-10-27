import { INCIDENT_ID_RE } from './schema.js';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** `fb-YYYYMMDD-HHMMSS-xxxx` (UTC). */
export function createIncidentId(now = new Date(), rand: () => number = Math.random): string {
  const d = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const t = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return `fb-${d}-${t}-${s}`;
}

export const isIncidentId = (id: unknown): id is string => typeof id === 'string' && INCIDENT_ID_RE.test(id);
