/** Arayüz metinleri. Raporun dili de aynı ayardan gelir (`report/markdown.ts`). */
import type { FlashbackLocale } from '../types.js';

const tr = {
  fab: 'Flashback: hatayı göster',
  cancel: 'Vazgeç',
  hintPick: 'Bir öğe seç',
  hintPage: 'sayfa geneli',
  hintEsc: 'vazgeç',
  pageLevel: 'Sayfa geneli',
  question: 'Ne yanlış?',
  placeholder: 'Ör. Toplam 1380 ₺ olmalı, 135030 ₺ görünüyor',
  requests: 'istek',
  steps: 'adım',
  errors: 'hata',
  redactOn: 'gizleme açık',
  redactOff: 'gizleme kapalı',
  escCancel: 'Esc vazgeç',
  copy: 'Kopyala',
  sending: 'Hazırlanıyor…',
  copied: 'Kopyalandı',
  pasteToAgent: 'Ajanına yapıştır',
  inClipboard: 'Rapor panoda',
  copyFailed: 'Panoya kopyalanamadı. Metni seçip kopyala:',
  close: 'Kapat',
};

export type Strings = typeof tr;

const en: Strings = {
  fab: 'Flashback: show the bug',
  cancel: 'Cancel',
  hintPick: 'Pick an element',
  hintPage: 'whole page',
  hintEsc: 'cancel',
  pageLevel: 'Whole page',
  question: 'What’s wrong?',
  placeholder: 'e.g. Total should be $13.80, it shows $1350.30',
  requests: 'requests',
  steps: 'steps',
  errors: 'errors',
  redactOn: 'redaction on',
  redactOff: 'redaction off',
  escCancel: 'Esc to cancel',
  copy: 'Copy',
  sending: 'Preparing…',
  copied: 'Copied',
  pasteToAgent: 'Paste it to your agent',
  inClipboard: 'Report is in the clipboard',
  copyFailed: 'Couldn’t copy to the clipboard. Select the text and copy it:',
  close: 'Close',
};

export function strings(locale: FlashbackLocale): Strings {
  return locale === 'tr' ? tr : en;
}
