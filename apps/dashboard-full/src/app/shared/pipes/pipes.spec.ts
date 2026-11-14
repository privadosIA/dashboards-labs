import { BytesPipe } from './bytes.pipe';
import { DurationPipe } from './duration.pipe';

describe('DurationPipe', () => {
  const pipe = new DurationPipe();

  it('formats sub-minute, minutes and hours', () => {
    expect(pipe.transform(3000)).toBe('0:03');
    expect(pipe.transform(252_000)).toBe('4:12');
    expect(pipe.transform(3_727_000)).toBe('1:02:07');
  });

  it('answers — for missing or invalid input', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform(-5)).toBe('—');
  });
});

describe('BytesPipe', () => {
  const pipe = new BytesPipe();

  it('formats across units', () => {
    expect(pipe.transform(512)).toBe('512 B');
    expect(pipe.transform(4096)).toBe('4,0 KB');
    expect(pipe.transform(3.4 * 1024 * 1024)).toBe('3,4 MB');
    expect(pipe.transform(250 * 1024 * 1024)).toBe('250 MB');
  });

  it('answers — for missing input', () => {
    expect(pipe.transform(null)).toBe('—');
  });
});

import { MiddleEllipsisPipe } from './middle-ellipsis.pipe';

describe('MiddleEllipsisPipe', () => {
  const pipe = new MiddleEllipsisPipe();

  it('leaves short names alone, and empty values empty', () => {
    expect(pipe.transform('m.safetensors', 32)).toBe('m.safetensors');
    expect(pipe.transform('', 32)).toBe('');
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('x'.repeat(32), 32)).toBe('x'.repeat(32)); // exactly at the limit
  });

  it('keeps the start and the end (the extension and the variant), never more than max characters', () => {
    const name = 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors';
    const out = pipe.transform(name, 30);
    expect(out.length).toBe(30);
    expect(out.startsWith('Juggernaut-XL_')).toBe(true);
    expect(out.endsWith('v2.safetensors')).toBe(true);
    expect(out).toContain('…');
  });

  it('keeps the variant of a model path', () => {
    const out = pipe.transform('models/krea2_turbo-Q4_K_M.gguf', 24);
    expect(out.endsWith('Q4_K_M.gguf')).toBe(true);
    expect(out.startsWith('models/')).toBe(true);
    expect(out.length).toBe(24);
  });

  it('survives a tiny maximum without producing more than it was asked for', () => {
    expect(pipe.transform('abcdefghijklmnop', 5).length).toBeLessThanOrEqual(5);
  });
});
