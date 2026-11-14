import { parseText, writeText, markerValue, withMarker } from './markers';
import { composeTuple, entryId, parseTuples, serializeTuples, setEntryMarker, titleOf } from './tuples';

describe('markers', () => {
  it('reads the marker lines apart from the description, in order', () => {
    const p = parseText('Dialogue: "Good morning, hive."\nNegative: text, watermark\nMotion: slow push-in\nwide shot of a wooden beehive');
    expect(p.prompt).toBe('wide shot of a wooden beehive');
    expect(p.markers).toEqual([
      { name: 'Dialogue', value: '"Good morning, hive."' },
      { name: 'Negative', value: 'text, watermark' },
      { name: 'Motion', value: 'slow push-in' },
    ]);
  });

  it('reads the graphics grammar: Part, Param <name> and Duration', () => {
    const p = parseText('Part: toggle\nParam count: 3\nParam label: allow\nDuration: 4');
    expect(p.markers.map((m) => [m.name, m.value])).toEqual([['Part', 'toggle'], ['Param count', '3'], ['Param label', 'allow'], ['Duration', '4']]);
    expect(p.prompt).toBe('');
  });

  it('reads a song: the style, then Lyrics over many lines, Tags and a bare Instrumental', () => {
    const p = parseText('upbeat acoustic pop\nLyrics: [Verse]\nline one\nline two\n[Chorus]\nsing\nTags: pop, upbeat\nInstrumental');
    expect(p.prompt).toBe('upbeat acoustic pop');
    expect(markerValue(p, 'Lyrics')).toBe('[Verse]\nline one\nline two\n[Chorus]\nsing');
    expect(markerValue(p, 'Tags')).toBe('pop, upbeat');
    expect(p.markers.at(-1)).toEqual({ name: 'Instrumental', value: '' });
  });

  it('matches the marker names without regard to case and keeps a line that only looks like a marker in the description', () => {
    const p = parseText('dialogue: hi\nthe sky: blue');
    expect(p.markers).toEqual([{ name: 'Dialogue', value: 'hi' }]);
    expect(p.prompt).toBe('the sky: blue');
  });

  it('writes markers first for scenes and graphics, and the style first for songs, and reads back what it wrote', () => {
    const markers = [{ name: 'Dialogue', value: '"Hi."' }, { name: 'Negative', value: 'blur' }];
    expect(writeText('a hive', markers)).toBe('Dialogue: "Hi."\nNegative: blur\na hive');
    expect(writeText('pop', [{ name: 'Tags', value: 'pop' }, { name: 'Instrumental', value: '' }], 'prompt-first')).toBe('pop\nTags: pop\nInstrumental');
    expect(parseText(writeText('a hive', markers))).toMatchObject({ prompt: 'a hive', markers });
  });

  it('sets, replaces and takes away a marker', () => {
    expect(withMarker([{ name: 'Seed', value: '1' }], 'Seed', '2')).toEqual([{ name: 'Seed', value: '2' }]);
    expect(withMarker([{ name: 'Seed', value: '1' }], 'Seed', '')).toEqual([]);
    expect(setEntryMarker('Dialogue: hi\na hive', 'Dialogue', '')).toBe('a hive');
    expect(setEntryMarker('a hive', 'Silence', '2')).toBe('Silence: 2\na hive');
  });
});

describe('tuples', () => {
  it('numbers entries and makes titles from the description', () => {
    expect(entryId('s', 0)).toBe('s01');
    expect(entryId('g', 11)).toBe('g12');
    expect(titleOf('- The hive at dawn, wide shot')).toBe('The hive at dawn');
    expect(titleOf('x'.repeat(80)).length).toBe(58);
  });

  it('composes, serialises and parses a dataset', () => {
    const t = composeTuple({ id: 's01', title: 'Hive', prompt: 'a hive', markers: [{ name: 'Negative', value: 'blur' }] });
    expect(t).toEqual(['s01', 'Hive', '', 'Negative: blur\na hive']);
    const raw = serializeTuples([t]);
    expect(parseTuples(raw)).toEqual({ ok: true, entries: [t] });
  });

  it('names what is wrong with a file that is not a dataset', () => {
    expect(parseTuples('{').ok).toBe(false);
    expect(parseTuples('{}')).toEqual({ ok: false, error: 'the dataset must be a list of entries' });
    expect(parseTuples('[["a","b"]]')).toEqual({ ok: false, error: 'entry 1 must be [id, title, lora_info, text]' });
  });
});
