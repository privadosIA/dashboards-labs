import { entryOfRefusal, entryProblems, validateEntries } from './models3d-validators';

/** The tests run in Spanish (the app's own translation is loaded), so the words are the Spanish ones. */
describe('the rules of an entry', () => {
  it('accepts a text, and a picture, with a plain id', () => {
    expect(validateEntries([{ id: 'patin', prompt: 'a retro roller skate' }, { id: 'gato.2', image: 'gato.png' }]).ok).toBe(true);
  });

  it('wants a plain id: lower case, digits, dots, underscores and hyphens, up to 64', () => {
    expect(entryProblems({ id: 'Not Plain', prompt: 'x' }, 0, []).id).toContain('Letras minúsculas');
    expect(entryProblems({ id: '-bad', prompt: 'x' }, 0, []).id).not.toBe('');
    expect(entryProblems({ id: 'a'.repeat(65), prompt: 'x' }, 0, []).id).not.toBe('');
    expect(entryProblems({ id: 'ok_1.a-b', prompt: 'x' }, 0, []).id).toBe('');
  });

  it('refuses an id another entry has', () => {
    const all = [{ id: 'a', prompt: 'x' }, { id: 'a', prompt: 'y' }];
    expect(entryProblems(all[0], 0, all).id).toContain('Otra entrada');
    expect(validateEntries(all).ok).toBe(false);
  });

  it('wants one of the text and the picture, never both nor neither', () => {
    expect(entryProblems({ id: 'a', prompt: 'x', image: 'a.png' }, 0, []).source).toContain('no con los dos');
    expect(entryProblems({ id: 'a' }, 0, []).source).toContain('Escribe el texto');
    expect(entryProblems({ id: 'a', prompt: '   ' }, 0, []).source).not.toBe('');
  });

  it('refuses a text over 1000 characters', () => {
    expect(entryProblems({ id: 'a', prompt: 'y'.repeat(1001) }, 0, []).prompt).toContain('1000');
    expect(entryProblems({ id: 'a', prompt: 'y'.repeat(1000) }, 0, []).prompt).toBe('');
  });

  it('allows one to four variants, and only one for an entry with its own picture', () => {
    expect(entryProblems({ id: 'a', prompt: 'x', variants: 4 }, 0, []).variants).toBe('');
    expect(entryProblems({ id: 'a', prompt: 'x', variants: 5 }, 0, []).variants).not.toBe('');
    expect(entryProblems({ id: 'a', prompt: 'x', variants: 0 }, 0, []).variants).not.toBe('');
    expect(entryProblems({ id: 'a', image: 'a.png', variants: 2 }, 0, []).variants).toContain('un solo modelo');
  });

  it('finds the entry a server refusal names', () => {
    expect(entryOfRefusal('config: models[2].id: "x" is used by another entry')).toBe(2);
    expect(entryOfRefusal('config: scenes: a project of the mode models3d has no scenes')).toBe(-1);
  });
});
