// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createInputMasker } from '../src/recorder/mask.js';

function input(attrs: Record<string, string>, tag = 'input'): Element {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe('record-time input masking (FR-REC-08, FR-RED-11)', () => {
  const mask = createInputMasker({ enabled: true }, false);

  it('always masks passwords', () => {
    expect(mask('demo1234', input({ type: 'password' }))).toEqual({ value: '[REDACTED:password]', as: 'password' });
    expect(createInputMasker({ enabled: false }, false)('demo1234', input({ type: 'password' }))).toEqual({ value: '[REDACTED:password]', as: 'password' });
    // Parolayı göster/gizle düğmesi type'ı text yapsa bile rrweb işareti korunur.
    expect(mask('demo1234', input({ type: 'text', 'data-rr-is-password': 'true' })).as).toBe('password');
  });

  it('masks email fields completely, even partial values while typing', () => {
    expect(mask('demo@example.com', input({ type: 'email' }))).toEqual({ value: '[REDACTED:email]', as: 'email' });
    expect(mask('demo@exa', input({ type: 'email' }))).toEqual({ value: '[REDACTED:email]', as: 'email' });
    expect(mask('demo@exa', input({ name: 'userEmail' })).as).toBe('email');
  });

  it('masks by sensitive field name and by value pattern; keeps debugging values', () => {
    expect(mask('abc', input({ name: 'api_key' })).as).toBe('secret');
    expect(mask('4111 1111 1111 1111', input({ name: 'pan' })).value).toBe('[REDACTED:card]');
    expect(mask('YAZ10', input({ id: 'coupon' }))).toEqual({ value: 'YAZ10' });
    expect(mask('', input({ type: 'email' }))).toEqual({ value: '' });
  });

  it('maskAllInputs masks everything; redact=false keeps non-password values', () => {
    expect(createInputMasker({ enabled: true }, true)('YAZ10', input({ id: 'coupon' }))).toEqual({ value: '[REDACTED:input]', as: 'input' });
    expect(createInputMasker({ enabled: false }, false)('demo@example.com', input({ type: 'email' }))).toEqual({ value: 'demo@example.com' });
  });
});
