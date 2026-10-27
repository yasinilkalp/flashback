import { describe, expect, it } from 'vitest';
import { relativizeSourcePath } from '../src/index.js';

describe('relativizeSourcePath (EK-B3: mutlak kaynak yolları proje köküne göreli)', () => {
  it.each([
    ['/home/u/app/src/Cart.tsx', '/home/u/app', 'src/Cart.tsx'],
    ['/home/u/app/src/Cart.tsx', '/home/u/app/', 'src/Cart.tsx'],
    ['file:///home/u/app/app/page.tsx', '/home/u/app', 'app/page.tsx'],
    ['C:\\Users\\u\\app\\src\\Cart.tsx', 'C:\\Users\\u\\app', 'src/Cart.tsx'],
    ['file:///C:/Users/u/app/src/Cart.tsx', 'c:\\users\\u\\app', 'src/Cart.tsx'],
    ['src/Cart.tsx', '/home/u/app', 'src/Cart.tsx'],
    ['/home/u/other/x.tsx', '/home/u/app', '/home/u/other/x.tsx'],
    ['/home/u/app-two/x.tsx', '/home/u/app', '/home/u/app-two/x.tsx'],
  ])('%s (kök %s) → %s', (file, root, expected) => {
    expect(relativizeSourcePath(file, root)).toBe(expected);
  });

  it('kök ya da dosya yoksa dokunmaz', () => {
    expect(relativizeSourcePath(undefined, '/a')).toBeUndefined();
    expect(relativizeSourcePath('/a/b.ts', undefined)).toBe('/a/b.ts');
  });
});
