import type { Design } from '@lab/animation-core';
import { fieldOf, fromModel, modeKey, sectionTags, toModel } from './design-model';

const design: Design = { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Space Grotesk', body: 'Inter', defaultMode: 'dark', modes: { chorus: 'light' }, concept: 'Words on the beat.' };

describe('the design as a form model', () => {
  it('has a field for each part of the design and a mode for each section tag, the default where the design has none', () => {
    const model = toModel(design, ['verse', 'chorus']);
    expect(model).toEqual({ dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Space Grotesk', body: 'Inter', defaultMode: 'dark', concept: 'Words on the beat.', verseStyle: 'plain', hitStyle: 'plain', [modeKey(0)]: 'dark', [modeKey(1)]: 'light' });
  });

  it('comes back as the design, with every tag\'s mode written', () => {
    const back = fromModel(toModel(design, ['verse', 'chorus']), ['verse', 'chorus']);
    expect(back).toEqual({ ...design, modes: { verse: 'dark', chorus: 'light' } });
  });

  it('trims the colours and typefaces and falls back to the default mode for one it does not know', () => {
    const back = fromModel({ ...toModel(design, ['verse']), accent: ' #ff5a3c ', [modeKey(0)]: 'sepia' }, ['verse']);
    expect(back.accent).toBe('#ff5a3c');
    expect(back.modes).toEqual({ verse: 'dark' });
  });

  it('keeps a verse and a hit style the person chose, and leaves plain out of the design', () => {
    const styled = { ...design, verseStyle: 'karaoke', hitStyle: 'metal' } as Design;
    expect(toModel(styled, [])).toMatchObject({ verseStyle: 'karaoke', hitStyle: 'metal' });
    expect(fromModel(toModel(styled, []), [])).toMatchObject({ verseStyle: 'karaoke', hitStyle: 'metal' });
    const plain = fromModel({ ...toModel(design, []), verseStyle: 'plain', hitStyle: '' }, []);
    expect('verseStyle' in plain).toBe(false);
    expect('hitStyle' in plain).toBe(false);
    expect(fromModel({ ...toModel(design, []), verseStyle: 'neon' }, []).verseStyle).toBe('neon');
  });

  it('reads the tags of the sections once each, in lowercase', () => {
    const songMap = { sections: [{ tag: 'Verse', start: 0, end: 1 }, { tag: 'Chorus', start: 1, end: 2 }, { tag: 'verse', start: 2, end: 3 }] };
    expect(sectionTags({ songMap } as never)).toEqual(['verse', 'chorus']);
  });
});

describe('fieldOf', () => {
  it('names the field a reason starts with', () => {
    expect(fieldOf('accent #ff0000 has less than 3:1 contrast')).toBe('accent');
    expect(fieldOf('dark is not a hexadecimal colour')).toBe('dark');
    expect(fieldOf('concept is longer than 200 characters')).toBe('concept');
    expect(fieldOf('default_mode "sepia" is neither')).toBe('default_mode');
  });

  it('is nothing for a reason that starts with another word', () => {
    expect(fieldOf('the design is missing')).toBeNull();
    expect(fieldOf('')).toBeNull();
  });
});
