import { STRUCTURE_TAGS, insertSection } from './sections';

describe('structure tags', () => {
  it('are the ten the generators read, in the order a song usually takes them', () => {
    expect(STRUCTURE_TAGS).toEqual(['intro', 'verse', 'chorus', 'bridge', 'outro', 'inst', 'solo', 'hook', 'break', 'end']);
  });
});

describe('insertSection', () => {
  it('writes the tag on its own line in an empty lyrics and leaves the cursor on the next line', () => {
    expect(insertSection('', 0, 0, 'chorus')).toEqual({ text: '[chorus]\n', cursor: 9 });
  });

  it('starts a new line when the cursor is at the end of a line of text', () => {
    expect(insertSection('la la', 5, 5, 'verse')).toEqual({ text: 'la la\n[verse]\n', cursor: 14 });
  });

  it('does not add a second break when the cursor is at the start of a line', () => {
    expect(insertSection('one\ntwo', 4, 4, 'chorus')).toEqual({ text: 'one\n[chorus]\ntwo', cursor: 13 });
  });

  it('splits a line when the cursor is in the middle of it', () => {
    expect(insertSection('abcd', 2, 2, 'bridge')).toEqual({ text: 'ab\n[bridge]\ncd', cursor: 12 });
  });

  it('uses the break that is already there instead of adding one', () => {
    expect(insertSection('ab\ncd', 2, 2, 'hook')).toEqual({ text: 'ab\n[hook]\ncd', cursor: 10 });
  });

  it('replaces what is selected', () => {
    expect(insertSection('one\nold\ntwo', 4, 7, 'solo')).toEqual({ text: 'one\n[solo]\ntwo', cursor: 11 });
  });
});
