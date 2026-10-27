import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IncidentDraftSchema } from '@rewind/shared';
import { describe, expect, it } from 'vitest';
import { projectRoots, relativizeDraft, toProjectRelative } from '../src/paths.js';
import { draftInput, tmpDir } from './helpers.js';

describe('kaynak yollarını proje köküne göre kısaltma (EK-B3)', () => {
  const root = tmpDir();
  const roots = projectRoots(root);
  const inside = path.join(root, 'src', 'Cart.tsx');

  it('kök içindeki mutlak yol ve file:// URL göreli olur; göreli ve kök dışı yollar değişmez', () => {
    expect(toProjectRelative(inside, roots)).toBe('src/Cart.tsx');
    expect(toProjectRelative(pathToFileURL(inside).href, roots)).toBe('src/Cart.tsx');
    expect(toProjectRelative('src/Cart.tsx', roots)).toBe('src/Cart.tsx');
    const outside = path.join(path.dirname(root), 'other', 'x.tsx');
    expect(toProjectRelative(outside, roots)).toBe(outside);
    expect(toProjectRelative('http://localhost:5173/src/Cart.tsx', roots)).toBe('http://localhost:5173/src/Cart.tsx');
  });

  it.runIf(process.platform === 'win32')('Windows: ileri eğik çizgili ve başında / olan sürücü yolları da tanınır', () => {
    const fwd = inside.replace(/\\/g, '/');
    expect(toProjectRelative(fwd, roots)).toBe('src/Cart.tsx');
    expect(toProjectRelative(`/${fwd}`, roots)).toBe('src/Cart.tsx');
  });

  it('hedef dosyası ve konsol kaynakları alıcıda göreli yapılır', () => {
    const base = IncidentDraftSchema.parse(draftInput());
    const draft = {
      ...base,
      target: { ...base.target!, file: inside },
      console: [{ t: 1, level: 'error' as const, message: 'x', source: `${inside}:3:4` }, { t: 2, level: 'warn' as const, message: 'y' }],
    };
    const out = relativizeDraft(draft, roots);
    expect(out.target?.file).toBe('src/Cart.tsx');
    expect(out.console.map((c) => c.source)).toEqual(['src/Cart.tsx:3:4', undefined]);
    expect(relativizeDraft({ ...base, target: null }, roots).target).toBeNull();
  });
});
