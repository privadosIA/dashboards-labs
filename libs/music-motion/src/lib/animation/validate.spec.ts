import type { Choices } from '@lab/animation-core';
import { parseTags, rhythmOk, validateDraftInput, validateReferenceInput, defaultChoices, defaultFps, validateChoices } from './validate';

describe('the choices of a piece', () => {
  it('start as typographic, simple, 30 fps at 1280x720, which are fine', () => {
    expect(defaultChoices()).toEqual({ style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720' });
    expect(validateChoices(defaultChoices())).toEqual([]);
  });

  it('draw the illustrated style at 24 fps unless told otherwise', () => {
    expect(defaultFps('illustrated')).toBe(24);
    expect(defaultFps('typographic')).toBe(30);
  });

  it('name each field that is wrong', () => {
    const bad = { style: 'cartoon', level: 'huge', fps: 25, resolution: 'big' } as unknown as Choices;
    expect(validateChoices(bad)).toEqual(['style', 'level', 'fps', 'resolution']);
    expect(validateChoices({ ...defaultChoices(), fps: 60, resolution: '1920x1080' })).toEqual([]);
    expect(validateChoices({ ...defaultChoices(), resolution: '1280 x 720' })).toEqual(['resolution']);
  });
});

describe('a reference to add', () => {
  it('needs an address or a file, not both nor none, and the address must be http(s)', () => {
    expect(validateReferenceInput({ url: 'https://youtu.be/x' })).toEqual([]);
    expect(validateReferenceInput({ file: new File(['x'], 'v.mp4') })).toEqual([]);
    expect(validateReferenceInput({})).toEqual(['source']);
    expect(validateReferenceInput({ url: '   ' })).toEqual(['source']);
    expect(validateReferenceInput({ url: 'not an address' })).toEqual(['source']);
    expect(validateReferenceInput({ url: 'https://youtu.be/x', file: new File(['x'], 'v.mp4') })).toEqual(['source']);
  });

  it('keeps the title, the notes and the tags within the server\'s limits', () => {
    const url = 'https://youtu.be/x';
    expect(validateReferenceInput({ url, title: 'a'.repeat(121) })).toEqual(['title']);
    expect(validateReferenceInput({ url, notes: 'a'.repeat(2001) })).toEqual(['notes']);
    expect(validateReferenceInput({ url, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toEqual(['tags']);
    expect(validateReferenceInput({ url, tags: ['a'.repeat(41)] })).toEqual(['tags']);
    expect(validateReferenceInput({ url, title: 'a'.repeat(120), notes: 'a'.repeat(2000), tags: ['ok'] })).toEqual([]);
  });

  it('reads tags written with commas: trimmed, no empty one, none twice', () => {
    expect(parseTags(' pop, , rock,pop ,')).toEqual(['pop', 'rock']);
    expect(parseTags('')).toEqual([]);
  });
});

describe('the rhythm of a preset', () => {
  it('is between 2 and 15 seconds', () => {
    expect([1.9, 2, 8.5, 15, 15.1, NaN].map(rhythmOk)).toEqual([false, true, true, true, false, false]);
  });
});

describe('a part to ask for', () => {
  const image = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'p', { type });

  it('needs a phrase of 1 to 500 characters, and a picture is not needed', () => {
    expect(validateDraftInput({ request: 'a clock' })).toEqual([]);
    expect(validateDraftInput({ request: '   ' })).toEqual(['request']);
    expect(validateDraftInput({ request: 'a'.repeat(500) })).toEqual([]);
    expect(validateDraftInput({ request: 'a'.repeat(501) })).toEqual(['request']);
  });

  it('takes a frame of a reference (the reference and the frame together) or a file, not both', () => {
    expect(validateDraftInput({ request: 'x', referenceId: 'ref-1', frame: '03.jpg' })).toEqual([]);
    expect(validateDraftInput({ request: 'x', referenceId: 'ref-1' })).toEqual(['picture']);
    expect(validateDraftInput({ request: 'x', frame: '03.jpg' })).toEqual(['picture']);
    expect(validateDraftInput({ request: 'x', referenceId: 'ref-1', frame: '03.jpg', file: image() })).toEqual(['picture']);
  });

  it('takes a png, a jpg or a webp of up to 20 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(validateDraftInput({ request: 'x', file: image(type) })).toEqual([]);
    expect(validateDraftInput({ request: 'x', file: image('image/gif') })).toEqual(['picture']);
    expect(validateDraftInput({ request: 'x', file: image('text/plain') })).toEqual(['picture']);
    expect(validateDraftInput({ request: 'x', file: image('image/png', 20 * 1024 * 1024 + 1) })).toEqual(['picture']);
  });
});
