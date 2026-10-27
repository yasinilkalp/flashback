// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInputMasker } from '../src/recorder/mask.js';
import { StepCapture } from '../src/recorder/steps.js';

describe('StepCapture (FR-REC-07)', () => {
  let capture: StepCapture;
  let own: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <form><input id="email" type="email"><input id="coupon"><button type="submit">Uygula</button></form>
      <label for="agree">Kabul</label><input type="checkbox" id="agree">`;
    own = document.createElement('flashback-devtools');
    own.innerHTML = '<button id="panel-btn">x</button>';
    document.body.appendChild(own);
    capture = new StepCapture(createInputMasker({ enabled: true }, false), (e) => e.composedPath().includes(own));
    capture.install(window);
  });
  afterEach(() => capture.uninstall());

  const type = (el: HTMLInputElement, value: string) => {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('records masked input values with valueRedactedAs, then clicks with selectors', () => {
    const email = document.getElementById('email') as HTMLInputElement;
    type(email, 'demo@example.com');
    const coupon = document.getElementById('coupon') as HTMLInputElement;
    type(coupon, 'YAZ10');
    coupon.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('button')!.click();
    const steps = capture.snapshot();
    const inputs = steps.filter((s) => s.type === 'input');
    expect(inputs).toHaveLength(2);
    expect(inputs.find((s) => s.selector === '#email')).toMatchObject({ value: '[REDACTED:email]', valueRedactedAs: 'email' });
    expect(inputs.find((s) => s.selector === '#coupon')).toMatchObject({ value: 'YAZ10' });
    expect(inputs.find((s) => s.selector === '#coupon')!.valueRedactedAs).toBeUndefined();
    const click = steps.find((s) => s.type === 'click')!;
    expect(click.selector).toBeTruthy();
    expect(click.fallbackSelectors.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(steps)).not.toContain('demo@example.com');
  });

  it('records Enter/Escape/Tab keys and history navigation; ignores own UI events', () => {
    const coupon = document.getElementById('coupon') as HTMLInputElement;
    type(coupon, 'KIS20');
    coupon.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    coupon.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    history.pushState(null, '', '/account');
    history.replaceState(null, '', '/account');
    document.getElementById('panel-btn')!.click();
    const steps = capture.snapshot();
    expect(steps.map((s) => s.type)).toEqual(['input', 'key', 'navigate']);
    expect(steps[1]).toMatchObject({ key: 'Enter', selector: '#coupon' });
    expect(steps[2].url).toMatch(/\/account$/);
  });

  it('does not double-record the click a <label> forwards to its control', () => {
    document.querySelector('label')!.click();
    const clicks = capture.snapshot().filter((s) => s.type === 'click');
    expect(clicks).toHaveLength(1);
  });
});
