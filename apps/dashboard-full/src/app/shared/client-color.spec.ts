import { defaultClientColor, isClientColor, sha256Head } from './client-color';

describe('the colour of a client label', () => {
  it('reads the first four bytes of a SHA-256 (the known digests of "" and "abc")', () => {
    expect(sha256Head('')).toBe(0xe3b0c442);
    expect(sha256Head('abc')).toBe(0xba7816bf);
  });

  it('hashes a text longer than one block and one with accents', () => {
    // sha256 of 56 "a" (two blocks once padded) and of "ñ" were worked out apart from this code
    expect(sha256Head('a'.repeat(56))).toBe(0xb35439a4);
    expect(sha256Head('ñ')).toBe(0x024bb908);
  });

  it('works out the default colour as the contract says: hue from the hash modulo 360, 55 % and 50 %', () => {
    // worked out apart from this code: "a" has hue 290 and "other-app" hue 328
    expect(defaultClientColor('a')).toBe('#ae39c6');
    expect(defaultClientColor('other-app')).toBe('#c63984');
  });

  it('gives the same colour to the same name and a different one to another', () => {
    expect(defaultClientColor('claude-test')).toBe(defaultClientColor('claude-test'));
    expect(defaultClientColor('claude-test')).not.toBe(defaultClientColor('dashboard-full'));
  });

  it('accepts only #rrggbb as a colour', () => {
    expect(isClientColor('#1a2B3c')).toBe(true);
    for (const bad of ['red', '#12345', '#1234567', '1a2b3c', null, undefined, 3]) expect(isClientColor(bad)).toBe(false);
  });
});
