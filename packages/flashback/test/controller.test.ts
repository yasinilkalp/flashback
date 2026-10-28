// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FlashbackController } from '../src/controller.js';

// rrweb happy-dom'da kurulamıyor; bu testler denetleyicinin akışını sınar: kayıt bir Meta ve bir tam görüntü üretir.
vi.mock('rrweb', async (orig) => ({
  ...(await orig<typeof import('rrweb')>()),
  record: ({ emit }: { emit: (e: unknown) => void }) => {
    emit({ type: 4, data: { href: location.href, width: 1280, height: 800 }, timestamp: Date.now() });
    emit({ type: 2, data: { node: { type: 0, childNodes: [], id: 1 }, initialOffset: { top: 0, left: 0 } }, timestamp: Date.now() });
    return () => {};
  },
}));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

/** Kayıt akışı (FR-REC-01/02, FR-REC-16): seçim penceresi, süre sınırı ve durunca açılan olay ekranı. */
describe('FlashbackController kayıt akışı', () => {
  let c: FlashbackController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] });
    // Alıcı yok: sağlık yoklaması sessizce "kopuk" döner.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    // Node 25'in deneysel localStorage'ı (dosyasız) happy-dom'unkini gölgeler.
    vi.stubGlobal('localStorage', memoryStorage());
    document.body.innerHTML = '<main><button id="buy">Satın al</button><p>Toplam 1500 ₺</p></main>';
    const host = document.createElement('flashback-devtools');
    document.body.appendChild(host);
    c = new FlashbackController(resolveConfig({ locale: 'tr' }), host);
    c.start();
  });

  afterEach(() => {
    c?.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('varsayılan sınır 60 sn: kayıt kendiliğinden durur, olay sepete girer ve olayın ekranı açılır', async () => {
    expect(c.cfg.maxRecordSeconds).toBe(60);
    expect(await c.startRecording({ source: 'tab', mic: false })).toBe(true);
    expect(c.getState()).toMatchObject({ recording: true, open: false, picker: false });
    await vi.advanceTimersByTimeAsync(2_000);
    document.getElementById('buy')!.click();
    await vi.advanceTimersByTimeAsync(57_900);
    expect(c.getState().recording).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    await vi.waitFor(() => expect(c.getState().basket).toHaveLength(1));
    const [entry] = c.getState().basket!;
    expect(entry.durationMs).toBeGreaterThanOrEqual(60_000);
    expect(c.getState()).toMatchObject({ recording: false, open: true, tab: 'basket', selectedId: entry.id });
    expect(c.selected?.entry.id).toBe(entry.id);
  });

  it('kısayol önce "Kayda başla" penceresini açar, ikinci basış son seçimle başlatır, üçüncüsü durdurur', async () => {
    c.open('incidents');
    c.toggleRecording();
    expect(c.getState()).toMatchObject({ picker: true, open: false, recording: false });
    c.closePicker();
    expect(c.getState().picker).toBe(false);
    c.toggleRecording();
    c.toggleRecording();
    await vi.waitFor(() => expect(c.getState()).toMatchObject({ recording: true, picker: false }));
    await vi.advanceTimersByTimeAsync(1_500);
    c.toggleRecording();
    await vi.waitFor(() => expect(c.getState().basket).toHaveLength(1));
    // Kayıt durunca açılan ekran her zaman sepettir.
    expect(c.getState()).toMatchObject({ recording: false, open: true, tab: 'basket' });
  });

  it('kayıt sürerken Kayıtlar açılırsa klip sepete eklenir ama kullanıcının seçtiği sekme korunur', async () => {
    await c.startRecording({ source: 'tab', mic: false });
    await vi.advanceTimersByTimeAsync(1_500);
    c.open('incidents');
    await vi.waitFor(() => expect(c.getState().basket).toHaveLength(1));
    expect(c.getState()).toMatchObject({ open: true, tab: 'incidents', recording: false });
  });

  it('seçim saklanır; ekran paylaşımı reddedilirse kayıt başlamaz ve pencere hatayla açık kalır', async () => {
    c.setRecordOptions({ source: 'screen', mic: true });
    expect(JSON.parse(localStorage.getItem('flashback:recordOptions')!)).toEqual({ source: 'screen', mic: true });
    vi.stubGlobal('MediaRecorder', class {});
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
        getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });
    c.openPicker();
    expect(await c.startRecording()).toBe(false);
    expect(c.getState()).toMatchObject({ recording: false, picker: true, starting: false, pickerError: 'screen' });
    // Mikrofon reddi ayrı bildirilir.
    expect(await c.startRecording({ source: 'tab', mic: true })).toBe(false);
    expect(c.getState().pickerError).toBe('mic');
    // Bu sekme + mikrofonsuz: izin istenmez.
    expect(await c.startRecording({ source: 'tab', mic: false })).toBe(true);
    expect(c.getState()).toMatchObject({ recording: true, picker: false, pickerError: null });
  });
});
