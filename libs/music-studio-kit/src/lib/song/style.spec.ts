import { applyCombo, hasTag, toggleCombo, parseTags, setVocalGender, tagsInText, toggleTag, vocalGenderOf, voiceTagsOf } from './style';
import { VOCABULARY_FIXTURE } from './vocabulary.fixture';

const VOICE = { female: 'female vocal', male: 'male vocal' };

describe('parseTags', () => {
  it('splits on commas, trims, drops empties and repeats (ignoring case)', () => {
    expect(parseTags(' Pop, , lo-fi ,pop,Piano ')).toEqual(['Pop', 'lo-fi', 'Piano']);
    expect(parseTags('')).toEqual([]);
  });
});

describe('toggleTag', () => {
  it('adds a tag once and removes it when picked again', () => {
    expect(toggleTag('', 'lo-fi')).toBe('lo-fi');
    expect(toggleTag('lo-fi', 'chill')).toBe('lo-fi, chill');
    expect(toggleTag('lo-fi, chill', 'LO-FI')).toBe('chill');
  });
  it('keeps what the user typed around the tag', () => {
    expect(toggleTag('slow burn, pop', 'pop')).toBe('slow burn');
  });
});

describe('hasTag', () => {
  it('ignores case', () => {
    expect(hasTag('Pop, Piano', 'piano')).toBe(true);
    expect(hasTag('Pop', 'rock')).toBe(false);
  });
});

describe('toggleCombo', () => {
  it('adds the combination when some of its tags are missing', () => {
    expect(toggleCombo('piano, jazz', ['jazz', 'saxophone'])).toBe('piano, jazz, saxophone');
  });

  it('takes out every tag of the combination when all are there, and keeps the others in their order', () => {
    expect(toggleCombo('piano, Jazz, saxophone, calm', ['jazz', 'saxophone', 'calm'])).toBe('piano');
    expect(toggleCombo('jazz, saxophone', ['jazz', 'saxophone'])).toBe('');
  });
});

describe('applyCombo', () => {
  it('adds every tag of the combination, none twice, and keeps the order of the style', () => {
    expect(applyCombo('piano, jazz', ['jazz', 'saxophone', 'calm'])).toBe('piano, jazz, saxophone, calm');
  });
});

describe('the vocal gender', () => {
  it('reads the two voice tags from the vocabulary of the server', () => {
    expect(voiceTagsOf({ categories: [{ id: 'vocal', tags: ['male vocal', 'female vocal', 'duet'] }], combos: [] })).toEqual(VOICE);
    expect(voiceTagsOf({ categories: [{ id: 'genre', tags: ['pop'] }], combos: [] })).toEqual({});
  });

  it('adds the voice tag of the choice and replaces the other one', () => {
    expect(setVocalGender('pop', 'female', VOICE)).toBe('pop, female vocal');
    expect(setVocalGender('pop, female vocal', 'male', VOICE)).toBe('pop, male vocal');
  });

  it('random takes both away', () => {
    expect(setVocalGender('pop, male vocal, piano', 'random', VOICE)).toBe('pop, piano');
  });

  it('leaves the style alone when the voice tag is not in the vocabulary', () => {
    expect(setVocalGender('pop', 'male', { female: 'female vocal' })).toBe('pop');
  });

  it('is read back from the style', () => {
    expect(vocalGenderOf('pop, Female Vocal', VOICE)).toBe('female');
    expect(vocalGenderOf('pop', VOICE)).toBe('random');
  });
});

describe('tagsInText', () => {
  it('finds the tags of the vocabulary in a sentence, in the order of the vocabulary, hyphens and spaces alike', () => {
    expect(tagsInText('A melancholic lo fi hip-hop track with piano and soft female vocal', VOCABULARY_FIXTURE)).toEqual(['hip-hop', 'lo-fi', 'melancholic', 'piano', 'female vocal']);
  });

  it('does not take a tag out of the middle of a word', () => {
    expect(tagsInText('A popular, rocky sound with drumsticks', VOCABULARY_FIXTURE)).toEqual([]);
  });

  it('keeps at most eight', () => {
    expect(tagsInText('pop rock jazz blues folk metal punk disco funk soul indie', VOCABULARY_FIXTURE)).toHaveLength(8);
  });

  it('finds nothing in a sentence with no tag, or in an empty one', () => {
    expect(tagsInText('A tune with a nice feeling', VOCABULARY_FIXTURE)).toEqual([]);
    expect(tagsInText('', VOCABULARY_FIXTURE)).toEqual([]);
  });
});
