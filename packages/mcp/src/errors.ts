/** §9.6 hata kodları ve ajana verilen tek satırlık öneriler (FR-MCP-11). */
export const ERROR_SUGGESTIONS = {
  incident_not_found: 'Kimliği list_incidents ile doğrula.',
  invalid_id: 'Kimliği list_incidents ile doğrula.',
  wrong_project: 'Doğru projede rewind-mcp çalıştır ya da REWIND_PORT değerini değiştir.',
  dev_server_down: 'Dev sunucusunu başlat ya da base_url ver.',
  assertion_rejected: 'İzinli dilbilgisine uygun bir beklenti yaz (ör. await expect(target).toHaveText(\'…\')).',
  playwright_missing: 'Projede çalıştır: npm i -D @playwright/test',
  browser_missing: 'Projede çalıştır: npx playwright install chromium',
  timeout: 'Adım sayısını ya da REWIND_REPRO_TIMEOUT_S değerini kontrol et.',
  busy: 'Önceki koşunun bitmesini bekle.',
  precondition: 'REWIND_STORAGE_STATE tanımla; geliştiriciye sor (reply_to_incident).',
  selector: 'Kayıttaki adımlardan biri sayfada bulunamadı; uygulama yapısı değişmiş olabilir. Geliştiriciye sor ya da get_incident_events ile adımları incele.',
  internal: 'Hata metnini incele; sorun sürerse geliştiriciye bildir.',
  reason_required: 'Doğrulanmamış kapanış için reason alanında gerekçe ver.',
  no_reply_yet: 'Yanıtı daha sonra get_incident ile oku.',
  base_url_rejected: 'Yalnızca loopback adresleri ya da REWIND_ALLOW_ORIGINS içindeki kökenler kullanılabilir.',
  invalid_transition: 'Olayın durumunu list_incidents ile kontrol et; kapalı olay yalnızca panelden yeniden açılabilir.',
} as const;

export type ErrorCode = keyof typeof ERROR_SUGGESTIONS;

export class RewindError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RewindError';
  }

  /** MCP metin biçimi: `Hata (<kod>): <mesaj>\nÖneri: <öneri>` */
  toText(): string {
    return formatError(this.code, this.message);
  }
}

export function formatError(code: ErrorCode, message: string): string {
  return `Hata (${code}): ${message}\nÖneri: ${ERROR_SUGGESTIONS[code]}`;
}
