import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IncidentDraftSchema } from '@flashback/shared';
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

  it('bundler köküne göre göreli yol, monorepoda tek eşleşen pakete göre tamamlanır (KK-5 Codex smoke bulgusu)', () => {
    const mono = tmpDir('flashback-mono-');
    const put = (rel: string) => {
      fs.mkdirSync(path.dirname(path.join(mono, rel)), { recursive: true });
      fs.writeFileSync(path.join(mono, rel), '');
    };
    put('package.json');
    put('examples/demo/package.json');
    put('examples/demo/src/Cart.tsx');
    put('examples/demo/src/App.tsx');
    put('examples/other/package.json');
    put('examples/other/src/App.tsx');
    put('examples/demo/node_modules/x/package.json');
    put('examples/demo/node_modules/x/src/Only.tsx');
    put('src/Root.tsx');
    const r = projectRoots(mono);
    expect(toProjectRelative('src/Cart.tsx', r)).toBe('examples/demo/src/Cart.tsx');
    expect(toProjectRelative('./src/Cart.tsx', r)).toBe('examples/demo/src/Cart.tsx');
    expect(toProjectRelative('src/App.tsx', r)).toBe('src/App.tsx'); // iki aday: değişmez
    fs.writeFileSync(path.join(mono, 'examples/demo/src/App.tsx'), 'a\nconst x = 1;\nb\n');
    fs.writeFileSync(path.join(mono, 'examples/other/src/App.tsx'), 'a\r\nconst x = 2;\r\nb\r\n');
    expect(toProjectRelative('src/App.tsx', r, { startLine: 2, lines: ['const x = 2;'] })).toBe('examples/other/src/App.tsx'); // kod parçası ayırır
    expect(toProjectRelative('src/App.tsx', r, { startLine: 2, lines: ['const x = 3;'] })).toBe('src/App.tsx');
    const base = IncidentDraftSchema.parse(draftInput());
    const out = relativizeDraft({ ...base, target: { ...base.target!, file: 'src/App.tsx', snippet: { startLine: 1, lines: ['a', 'const x = 1;'], fileHash: 'h' } } }, r);
    expect(out.target?.file).toBe('examples/demo/src/App.tsx');
    expect(toProjectRelative('src/Root.tsx', r)).toBe('src/Root.tsx'); // kökte var
    expect(toProjectRelative('src/Only.tsx', r)).toBe('src/Only.tsx'); // node_modules taranmaz
    expect(toProjectRelative('src/Yok.tsx', r)).toBe('src/Yok.tsx');
  });

  it('bu depoda: src/Cart.tsx iki örnekte var (demo, react18); hedefin kod parçası demo dosyasını seçer', () => {
    const repo = path.resolve(__dirname, '../../..');
    const lines = fs.readFileSync(path.join(repo, 'examples/demo/src/Cart.tsx'), 'utf8').split(/\r?\n/);
    const at = lines.findIndex((l) => l.includes('data-testid="total"'));
    const snippet = { startLine: at - 2, lines: lines.slice(at - 3, at + 2) };
    expect(toProjectRelative('src/Cart.tsx', projectRoots(repo), snippet)).toBe('examples/demo/src/Cart.tsx');
    expect(toProjectRelative('src/Cart.tsx', projectRoots(repo))).toBe('src/Cart.tsx'); // parça yoksa ayırt edilemez
  });
});

