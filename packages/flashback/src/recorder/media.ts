/**
 * Ekran/pencere videosu ve mikrofon sesi (FR-REC-16).
 *
 * `getDisplayMedia` ve `getUserMedia` akışları tek bir `MediaRecorder` ile `.webm` dosyasına yazılır. Videodan
 * düzenli aralıklarla küçük JPEG kareler alınır; olay kurulurken bunlardan birkaç anahtar kare seçilir (işaretlenen
 * an, son durum ve aradakiler). "Bu sekme" seçilip mikrofon eklenmezse medya kaydı hiç başlamaz: sekme zaten rrweb
 * ile kaydedilir ve izin penceresi açılmaz.
 */
import { LIMITS } from '@flashback/shared';

export type RecordSource = 'tab' | 'screen';

export interface RecordOptions {
  source: RecordSource;
  mic: boolean;
}

/** Videodan alınmış kare. */
export interface Frame {
  /** Epoch ms. */
  time: number;
  width: number;
  height: number;
  blob: Blob;
}

/** Durdurulmuş medya kaydı; sepette klibin yanında saklanır. */
export interface MediaClip {
  blob: Blob;
  mimeType: string;
  source: RecordSource;
  video: boolean;
  audio: boolean;
  startedAt: number;
  durationMs: number;
  frames: Frame[];
}

/** Olay taslağına giren medya özeti; anahtar kareler base64 JPEG. */
export interface DraftMedia {
  source: RecordSource;
  mimeType: string;
  video: boolean;
  audio: boolean;
  durationMs: number;
  bytes: number;
  keyframes: Array<{ time: number; width: number; height: number; jpeg: string }>;
}

/** Ekran içeriği iyi sıkışır: 60 sn ≈ 9 MB (LIMITS.mediaBytes 50 MB). */
const VIDEO_BPS = 1_200_000;
const AUDIO_BPS = 64_000;
const FRAME_EVERY_MS = 2000;
/** Uzun kayıtta kare sayısı bunu aşarsa her ikinciden biri atılır ve aralık iki katına çıkar. */
const MAX_FRAMES = 40;
const FRAME_MAX_WIDTH = 960;
const FRAME_QUALITY = 0.72;

export type CaptureErrorKind = 'unsupported' | 'screen' | 'mic';

/** Ekran paylaşımı ya da mikrofon izni alınamadı; kayıt başlamaz. */
export class CaptureError extends Error {
  constructor(readonly kind: CaptureErrorKind, cause?: unknown) {
    super(cause instanceof Error ? cause.message : kind);
    this.name = 'CaptureError';
  }
}

export function needsMedia(o: RecordOptions): boolean {
  return o.source === 'screen' || o.mic;
}

/** Tarayıcı ekran ve mikrofon kaydını destekliyor mu? (güvenli bağlam, `MediaRecorder`) */
export function mediaSupport(): { screen: boolean; mic: boolean } {
  const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const rec = typeof MediaRecorder === 'function';
  return { screen: rec && typeof md?.getDisplayMedia === 'function', mic: rec && typeof md?.getUserMedia === 'function' };
}

function pickMimeType(video: boolean): string {
  const options = video
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  return options.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? options[options.length - 1];
}

interface ImageCaptureLike {
  grabFrame(): Promise<ImageBitmap>;
}

/**
 * Video izinden JPEG kare alır. `ImageCapture` (Chromium) izden doğrudan okur ve sekme arka plandayken de çalışır;
 * yoksa sayfaya eklenmeyen, sessiz bir `<video>` öğesi kullanılır (kayda girmez).
 */
function frameGrabber(track: MediaStreamTrack): { grab: () => Promise<Frame | null>; dispose: () => void } {
  const canvas = document.createElement('canvas');
  const ImageCaptureCtor = (globalThis as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  let capture: ImageCaptureLike | null = ImageCaptureCtor ? new ImageCaptureCtor(track) : null;
  let video: HTMLVideoElement | null = null;
  const fallback = (): HTMLVideoElement => {
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([track]);
      void video.play().catch(() => {});
    }
    return video;
  };
  const grab = async (): Promise<Frame | null> => {
    if (track.readyState !== 'live') return null;
    let source: CanvasImageSource | null = null;
    let w = 0;
    let h = 0;
    let bitmap: ImageBitmap | null = null;
    if (capture) {
      try {
        bitmap = await capture.grabFrame();
        source = bitmap;
        w = bitmap.width;
        h = bitmap.height;
      } catch {
        capture = null;
      }
    }
    if (!source) {
      const v = fallback();
      if (v.readyState < 2 || !v.videoWidth) return null;
      source = v;
      w = v.videoWidth;
      h = v.videoHeight;
    }
    const scale = Math.min(1, FRAME_MAX_WIDTH / w);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    bitmap?.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', FRAME_QUALITY));
    return blob ? { time: Date.now(), width: canvas.width, height: canvas.height, blob } : null;
  };
  const dispose = () => {
    if (video) video.srcObject = null;
    video = null;
    capture = null;
  };
  return { grab, dispose };
}

export class MediaCapture {
  private streams: MediaStream[] = [];
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private frames: Frame[] = [];
  private sampler: ReturnType<typeof setTimeout> | undefined;
  private every = FRAME_EVERY_MS;
  private grabber: ReturnType<typeof frameGrabber> | null = null;
  private startedAt = 0;
  private mimeType = '';

  constructor(readonly options: RecordOptions) {}

  /** İzinleri ister ve akışları alır. Kullanıcı vazgeçerse ya da izin yoksa `CaptureError`; alınan akışlar bırakılır. */
  async acquire(): Promise<void> {
    const md = navigator.mediaDevices;
    const support = mediaSupport();
    if ((this.options.source === 'screen' && !support.screen) || (this.options.mic && !support.mic)) throw new CaptureError('unsupported');
    if (this.options.source === 'screen') {
      try {
        this.streams.push(await md.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false }));
      } catch (e) {
        throw new CaptureError('screen', e);
      }
    }
    if (this.options.mic) {
      try {
        this.streams.push(await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
      } catch (e) {
        this.release();
        throw new CaptureError('mic', e);
      }
    }
  }

  /** Kaydı başlatır. `onEnded`: kullanıcı paylaşımı tarayıcının çubuğundan durdurdu. */
  start(onEnded: () => void): void {
    const stream = new MediaStream(this.streams.flatMap((s) => s.getTracks()));
    const video = stream.getVideoTracks()[0];
    this.mimeType = pickMimeType(!!video);
    this.recorder = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      ...(video ? { videoBitsPerSecond: VIDEO_BPS } : {}),
      audioBitsPerSecond: AUDIO_BPS,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.startedAt = Date.now();
    for (const t of stream.getTracks()) t.addEventListener('ended', onEnded, { once: true });
    if (video) {
      this.grabber = frameGrabber(video);
      this.schedule(300);
    }
  }

  private schedule(ms: number): void {
    this.sampler = setTimeout(() => void this.sample(), ms);
  }

  private async sample(): Promise<void> {
    const f = await this.grabber?.grab().catch(() => null);
    if (f) this.frames.push(f);
    if (this.frames.length > MAX_FRAMES) {
      this.frames = this.frames.filter((_, i) => i % 2 === 0 || i === this.frames.length - 1);
      this.every *= 2;
    }
    if (this.recorder?.state === 'recording') this.schedule(this.every);
  }

  /** Kaydı durdurur ve dosyayı döndürür; boş kayıtta `null`. Akışlar her durumda bırakılır. */
  async stop(): Promise<MediaClip | null> {
    clearTimeout(this.sampler);
    const r = this.recorder;
    this.recorder = null;
    if (!r) {
      this.release();
      return null;
    }
    // Son durum: durdurulan andaki kare.
    const last = await this.grabber?.grab().catch(() => null);
    if (last) this.frames.push(last);
    if (r.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        r.addEventListener('stop', () => resolve(), { once: true });
        r.stop();
      });
    }
    this.release();
    const blob = new Blob(this.chunks, { type: this.mimeType });
    this.chunks = [];
    if (!blob.size) return null;
    return {
      blob,
      mimeType: this.mimeType,
      source: this.options.source,
      video: this.options.source === 'screen',
      audio: this.options.mic,
      startedAt: this.startedAt,
      durationMs: Date.now() - this.startedAt,
      frames: this.frames,
    };
  }

  /** Akışları bırakır (tarayıcının "paylaşılıyor" göstergesi kapanır). */
  release(): void {
    clearTimeout(this.sampler);
    for (const s of this.streams) for (const t of s.getTracks()) t.stop();
    this.streams = [];
    this.grabber?.dispose();
    this.grabber = null;
  }
}

/**
 * Anahtar kareler: işaretlenen ana en yakın kare ve son kare her zaman seçilir; kalanlar zamanca en uzak olan
 * kareler eklenerek kayda yayılır. Sonuç zamana göre sıralıdır.
 */
export function pickKeyframes<T extends { time: number }>(frames: T[], markedAt: number, max: number = LIMITS.keyframes): T[] {
  if (frames.length <= max) return [...frames];
  const nearest = frames.reduce((best, f, i) => (Math.abs(f.time - markedAt) < Math.abs(frames[best].time - markedAt) ? i : best), 0);
  const picked = new Set([nearest, frames.length - 1]);
  while (picked.size < max) {
    let best = -1;
    let gap = -1;
    frames.forEach((f, i) => {
      if (picked.has(i)) return;
      const d = Math.min(...[...picked].map((p) => Math.abs(frames[p].time - f.time)));
      if (d > gap) {
        gap = d;
        best = i;
      }
    });
    picked.add(best);
  }
  return [...picked].sort((a, b) => a - b).map((i) => frames[i]);
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Olay taslağı için medya özeti: anahtar kareler seçilir ve base64'e çevrilir. */
export async function draftMedia(clip: MediaClip, markedAt: number): Promise<DraftMedia> {
  const keyframes = await Promise.all(
    pickKeyframes(clip.frames, markedAt).map(async (f) => ({ time: f.time, width: f.width, height: f.height, jpeg: await base64(f.blob) })),
  );
  return {
    source: clip.source,
    mimeType: clip.mimeType,
    video: clip.video,
    audio: clip.audio,
    durationMs: clip.durationMs,
    bytes: clip.blob.size,
    keyframes: keyframes.filter((k) => k.jpeg.length <= LIMITS.keyframeChars),
  };
}
