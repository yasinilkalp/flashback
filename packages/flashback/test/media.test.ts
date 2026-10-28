import { IncidentDraftSchema } from '@flashback/shared';
import { describe, expect, it } from 'vitest';
import { Basket } from '../src/basket.js';
import { buildDraft } from '../src/draft/build.js';
import { prepareSubmission } from '../src/draft/report.js';
import { draftMedia, needsMedia, pickKeyframes, type MediaClip } from '../src/recorder/media.js';
import { draftInput, snapshot, T0 } from './fixtures.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

function clip(frameTimes: number[], over: Partial<MediaClip> = {}): MediaClip {
  return {
    blob: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], { type: 'video/webm' }),
    mimeType: 'video/webm;codecs=vp9,opus',
    source: 'screen',
    video: true,
    audio: true,
    startedAt: T0,
    durationMs: 8_000,
    frames: frameTimes.map((time) => ({ time, width: 960, height: 540, blob: new Blob([JPEG], { type: 'image/jpeg' }) })),
    ...over,
  };
}

describe('Ekran kaydı (FR-REC-16)', () => {
  it('yalnızca ekran/pencere ya da mikrofon seçilince medya kaydı başlar (bu sekme: izin penceresi yok)', () => {
    expect(needsMedia({ source: 'tab', mic: false })).toBe(false);
    expect(needsMedia({ source: 'tab', mic: true })).toBe(true);
    expect(needsMedia({ source: 'screen', mic: false })).toBe(true);
  });

  it('anahtar kareler: işaretlenen ana en yakın kare ve son kare her zaman seçilir, kalanlar kayda yayılır', () => {
    const frames = Array.from({ length: 31 }, (_, i) => ({ time: T0 + i * 2000 }));
    const picked = pickKeyframes(frames, T0 + 21_300, 6).map((f) => (f.time - T0) / 1000);
    expect(picked).toHaveLength(6);
    expect(picked).toContain(22);
    expect(picked).toContain(60);
    expect(picked).toContain(0);
    expect([...picked].sort((a, b) => a - b)).toEqual(picked);
    // En büyük boşluk, eşit yayılmadan çok uzak değil.
    const gaps = picked.slice(1).map((t, i) => t - picked[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(22);
    // Az kare varsa hepsi.
    expect(pickKeyframes(frames.slice(0, 4), T0, 6)).toHaveLength(4);
  });

  it('taslak: kareler base64 JPEG, zamanları markedAtMs ile aynı tabanda; şemaya uyar', async () => {
    const media = await draftMedia(clip([T0 + 500, T0 + 2500, T0 + 4500]), T0 + 2600);
    expect(media).toMatchObject({ source: 'screen', video: true, audio: true, bytes: 8, mimeType: 'video/webm;codecs=vp9,opus' });
    expect(media.keyframes.map((k) => k.jpeg)).toEqual(Array(3).fill(Buffer.from(JPEG).toString('base64')));
    const draft = buildDraft(draftInput({ markedAt: T0 + 2600, media }));
    const parsed = IncidentDraftSchema.parse(draft);
    expect(parsed.media!.keyframes.map((k) => k.t - parsed.markedAtMs)).toEqual([-2100, -100, 1900]);
    expect(prepareSubmission(draft).media).toBe(true);
    expect(prepareSubmission(draft).preview.markdown).toContain('- ekran kaydı: ekran videosu + mikrofon sesi, WebM 8 B, 3 anahtar kare');
  });

  it('önizlemede hariç tutulan kayıt taslağa girmez ve Kanıt güveninde hariç tutulanlar arasında görünür', async () => {
    const media = await draftMedia(clip([T0 + 500]), T0 + 600);
    const draft = buildDraft(draftInput({ media, exclude: { media: true } }));
    expect(draft.media).toBeUndefined();
    expect(prepareSubmission(draft).media).toBe(false);
    expect(JSON.stringify(draft.confidence)).toContain('ekran kaydı');
  });

  it('sepet kaydı klibin yanında saklar; olay çıkarılınca kayıt da silinir', async () => {
    const basket = await Basket.open(undefined);
    const c = clip([T0 + 500]);
    const e = await basket.add(snapshot(), '/', c);
    expect(e.media).toEqual({ source: 'screen', video: true, audio: true, bytes: 8 });
    expect((await basket.media(e.id))!.blob.size).toBe(8);
    const plain = await basket.add(snapshot(), '/');
    expect(plain.media).toBeUndefined();
    expect(await basket.media(plain.id)).toBeUndefined();
    await basket.setDraft(e.id, { body: '{}', media: true }, { expected: 'x' });
    expect(await basket.draft(e.id)).toEqual({ body: '{}', media: true });
    await basket.remove(e.id);
    expect(await basket.media(e.id)).toBeUndefined();
  });
});
