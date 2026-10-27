// @vitest-environment happy-dom
import { IncidentDraftSchema } from '@rewind/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDraft } from '../src/draft/build.js';
import { detectFramework, detectPageFramework } from '../src/draft/collect.js';
import { draftInput, ENV } from './fixtures.js';

/** FR-MARK-06: React dışı çerçeveler — bileşen yığını boş, çerçeve pakette belirtilir. */
describe('framework detection (FR-MARK-06)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app" data-v-app><p id="vue-p">vue</p></div><div id="react"><span id="r">react</span></div><rewind-devtools></rewind-devtools>';
  });

  it('detects the framework that rendered an element', () => {
    const vueP = document.getElementById('vue-p')!;
    Object.assign(vueP, { __vnode: {} });
    expect(detectFramework(vueP)).toBe('vue');
    const span = document.getElementById('r')!;
    Object.assign(span, { __reactFiber$abc: { tag: 5, type: 'span', return: null } });
    expect(detectFramework(span)).toBe('react');
    const svelte = document.createElement('b');
    Object.assign(svelte, { __svelte_meta: {} });
    expect(detectFramework(svelte)).toBe('svelte');
    expect(detectFramework(document.createElement('i'))).toBeNull();
  });

  it('page framework: Rewind’s own React root (shadow DOM, no fibers in the page tree) does not make a Vue page "react"', () => {
    expect(detectPageFramework(document)).toBe('vue');
    Object.assign(document.getElementById('r')!, { __reactFiber$x: {} });
    expect(detectPageFramework(document)).toBe('react');
    document.body.innerHTML = '<p>plain</p>';
    expect(detectPageFramework(document)).toBe('unknown');
  });

  it('draft source.framework comes from the target, then the page, defaulting to react', () => {
    const el = document.createElement('strong');
    el.textContent = '750 ₺';
    const target = { selector: '[data-testid="total"]', fallbackSelectors: [], resolution: 'exact' as const, framework: 'vue', resolutionReason: 'React fiber yok: öğe React dışı bir çerçeveden (vue)', componentStack: [], element: el };
    const vue = buildDraft(draftInput({ target }));
    expect(IncidentDraftSchema.safeParse(vue).success).toBe(true);
    expect(vue.source.framework).toBe('vue');
    expect(vue.target).toMatchObject({ componentStack: [], resolved: false, resolutionReason: expect.stringContaining('React dışı') });
    expect(buildDraft(draftInput({ target: null, env: { ...ENV, framework: 'vue' } })).source.framework).toBe('vue');
    expect(buildDraft(draftInput({ target: null })).source.framework).toBe('react');
  });
});
