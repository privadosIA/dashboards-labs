/* eslint-disable @typescript-eslint/no-explicit-any */
import { DATASET_FORMAT, DATASET_VERSION, validateAnimationDataset, type AnimationDataset } from './dataset-file';

/** The tests below write into a dataset to break it: its types are read-only on purpose. */
type Loose = any;

const design = { dark: '#1d1425', light: '#c7ad93', accent: '#6e58db', display: 'condensed', body: 'grotesk', defaultMode: 'dark', modes: { intro: 'dark', chorus: 'light' }, concept: 'neon city' };
const script = { version: 1, pieces: [{ id: 'p1', start: 0, end: 10, part: 'synth-sun' }, { id: 'p2', start: 10, end: 20, part: 'warp-grid', with: [{ part: 'nebula' }] }] };

const good = (): AnimationDataset =>
  structuredClone({
    format: DATASET_FORMAT,
    version: DATASET_VERSION,
    exportedAt: '2026-11-09T10:00:00.000Z',
    animation: {
      title: 'Neon Pulse',
      song: { project: 'ms-1', trackId: 'pista_1', variant: 0, title: 'Neon Pulse', seconds: 20 },
      options: { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' },
      design,
      script,
      look: {
        style: { name: 'Meat Proxy', reference: 'https://www.youtube.com/watch?v=gQvQ2NanBTI', design, rhythm: 8, parts: ['synth-sun', 'warp-grid'] },
        reference: { title: 'A video', notes: '', tags: ['edm'], source: 'https://youtu.be/abc' },
      },
      parts: [
        { name: 'my-part', description: 'a part', text: null },
        { name: 'draft-part', description: 'from a draft', text: { request: 'a sun', manifest: '{"name":"draft-part"}', fragment: '<div></div>' } },
      ],
    },
  }) as unknown as AnimationDataset;

const problems = (json: unknown, lang: 'es' | 'en' = 'en') => {
  const r = validateAnimationDataset(json, lang);
  return r.ok ? [] : r.problems;
};

describe('validateAnimationDataset', () => {
  it('accepts a whole animation, and one with only what is needed', () => {
    expect(validateAnimationDataset(good(), 'en')).toEqual({ ok: true, dataset: good() });
    const bare = good();
    delete bare.animation.look;
    delete bare.animation.parts;
    delete bare.exportedAt;
    expect(validateAnimationDataset(bare, 'en').ok).toBe(true);
  });

  it('keeps a verse style and a hit style this dashboard does not know', () => {
    const d = good();
    d.animation.design = { ...design, verseStyle: 'sparkle', hitStyle: 'confetti' } as never;
    expect(problems(d)).toEqual([]);
  });

  it('refuses what is not an object', () => {
    expect(problems([])).toEqual(['the file is not a JSON object']);
    expect(problems('x')).toEqual(['the file is not a JSON object']);
    expect(problems(null)).toEqual(['the file is not a JSON object']);
  });

  it('refuses a project dataset, a demonstration file and any other file, and says which', () => {
    expect(problems({ scenes: [] })).toEqual(['the file is a project dataset of the dashboard, not an animation dataset']);
    expect(problems({ songs: [], pieces: [] })).toEqual(['the file is the descriptor file of the demonstration data, not an animation dataset']);
    expect(problems({ hello: 1 })).toEqual([`the file is not an animation dataset: it has no "format": "${DATASET_FORMAT}"`]);
    expect(problems({ scenes: [] }, 'es')).toEqual(['el fichero es un dataset de proyecto del dashboard, no un dataset de animación']);
  });

  it('refuses the file of lists of the first version', () => {
    const lists = { format: DATASET_FORMAT, version: 1, styles: [], pieces: [] };
    expect(problems(lists)).toEqual(['the file is a dataset of lists (version 1), which this dashboard no longer reads: an animation dataset has one "animation"']);
    expect(problems(lists, 'es')[0]).toContain('dataset de listas');
    expect(problems({ format: DATASET_FORMAT, version: 2, pieces: [] })[0]).toContain('dataset of lists');
  });

  it('refuses a version it does not read and a file with no animation', () => {
    expect(problems({ format: DATASET_FORMAT, version: 3, animation: {} })).toEqual(['version 3 is not one this dashboard reads: it reads version 2']);
    expect(problems({ format: DATASET_FORMAT, version: 2 })).toEqual(['the file has no "animation": an animation dataset is the dataset of one animation']);
    expect(problems({ format: DATASET_FORMAT, version: 2, animation: [] }, 'es')).toEqual(['el fichero no tiene "animation": un dataset de animación es el de una sola animación']);
  });

  it('lists every problem with its place, in both languages', () => {
    const d = good();
    d.animation.look!.style!.parts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    d.animation.look!.style!.rhythm = 30;
    expect(problems(d)).toEqual(['animation.look.style: rhythm must be from 2 to 15 seconds', 'animation.look.style.parts: has 9 parts and a style has at most 8']);
    expect(problems(d, 'es')).toEqual(['animation.look.style: rhythm debe estar entre 2 y 15 segundos', 'animation.look.style.parts: tiene 9 partes y un estilo tiene como mucho 8']);
  });

  it('lists a script piece that ends before it starts together with a colour that is not one', () => {
    const d = good();
    (d.animation.script.pieces as Loose)[0] = { id: 'p1', start: 5, end: 5, part: 'x' };
    d.animation.design = { ...design, accent: 'red' } as never;
    expect(problems(d)).toEqual(['animation: design.accent must be a colour like #1d1425', 'animation.script.pieces[0]: needs an id, a part, and a start that comes before its end']);
  });

  it.each([
    ['a repeated part in the style', (d: Loose) => (d.animation.look.style.parts = ['synth-sun', 'synth-sun']), 'animation.look.style.parts: the part "synth-sun" is listed more than once'],
    ['a bad part name in the style', (d: Loose) => (d.animation.look.style.parts = ['Bad Name']), 'animation.look.style.parts: a part name must be lowercase words joined by hyphens'],
    ['a style with no name', (d: Loose) => (d.animation.look.style.name = ''), 'animation.look.style: needs a name of up to 120 characters'],
    ['a bad style design', (d: Loose) => (d.animation.look.style.design.accent = 'red'), 'animation.look.style: design.accent must be a colour like #1d1425'],
    ['a bad mode', (d: Loose) => (d.animation.design.defaultMode = 'grey'), 'animation: design.defaultMode must be one of dark, light'],
    ['a bad style address', (d: Loose) => (d.animation.look.style.reference = 'ftp://x'), 'animation.look.style: reference must be an http or https address'],
    ['an animation with no title', (d: Loose) => (d.animation.title = ''), 'animation: needs a title of up to 120 characters'],
    ['a bad level', (d: Loose) => (d.animation.options.level = 'extreme'), 'animation.options: level must be one of simple, medium, advanced'],
    ['a bad frame rate', (d: Loose) => (d.animation.options.fps = 25), 'animation.options: fps must be one of 24, 30, 60'],
    ['a bad resolution', (d: Loose) => (d.animation.options.resolution = 'big'), 'animation.options: resolution must look like 1280x720'],
    ['options that are not an object', (d: Loose) => (d.animation.options = 3), 'animation.options: must be an object'],
    ['a song with no project', (d: Loose) => (d.animation.song.project = ''), 'animation.song: needs a project, a trackId, a variant (a whole number from 0 to 99) and a title'],
    ['a song with no length', (d: Loose) => delete d.animation.song.seconds, 'animation.song: needs seconds, the length of the song, from 1 to 7200'],
    ['a script piece with four extra parts', (d: Loose) => (d.animation.script.pieces[1] = { id: 'p2', start: 10, end: 20, part: 'x', with: [{ part: 'a' }, { part: 'b' }, { part: 'c' }, { part: 'd' }] }), 'animation.script.pieces[1]: with can have at most 3 parts, each with a part name'],
    ['a script that is not a script', (d: Loose) => (d.animation.script = []), 'animation.script: the script must be { "version": 1, "pieces": [...] } with up to 400 pieces'],
    ['a part with a bad name', (d: Loose) => (d.animation.parts[0].name = 'Bad'), 'animation.parts[0]: a part name must be lowercase words joined by hyphens'],
    ['a part with a text that is not whole', (d: Loose) => (d.animation.parts[1].text = { request: 'x' }), 'animation.parts[1]: text must be null or have request, manifest and fragment as text'],
    ['too many tags', (d: Loose) => (d.animation.look.reference.tags = Array.from({ length: 11 }, (_, i) => `t${i}`)), 'animation.look.reference: tags must be a list of up to 10 short texts'],
    ['a reference with a bad address', (d: Loose) => (d.animation.look.reference.source = 'nope'), 'animation.look.reference: source must be an http or https address'],
    ['parts that are not a list', (d: Loose) => (d.animation.parts = {}), 'animation.parts: must be a list'],
    ['a part that is not an object', (d: Loose) => (d.animation.parts[0] = 3), 'animation.parts[0]: must be an object'],
    ['a look that is not an object', (d: Loose) => (d.animation.look = 'x'), 'animation.look: must be an object'],
  ])('refuses %s', (_name, change, expected) => {
    const d = good();
    change(d);
    expect(problems(d)).toContain(expected);
  });

  it('refuses a part name that is used twice, since the catalog has each name once', () => {
    const d = good();
    d.animation.parts!.push({ ...d.animation.parts![0] });
    expect(problems(d)).toEqual(['animation.parts: "my-part" is used more than once']);
  });

  it('refuses more than 50 own parts', () => {
    const d = good();
    d.animation.parts = Array.from({ length: 51 }, (_, i) => ({ name: `part-${i}`, description: 'x', text: null }));
    expect(problems(d)).toEqual(['animation.parts: has 51 items and at most 50 are accepted']);
  });

  it('accepts an approved part with no text and a reference with no address', () => {
    const d = good();
    delete (d.animation.look!.reference as { source?: string }).source;
    expect(d.animation.parts![0].text).toBeNull();
    expect(problems(d)).toEqual([]);
  });

  it('accepts a look with only a reference, or only a style', () => {
    const a = good();
    delete a.animation.look!.style;
    const b = good();
    delete b.animation.look!.reference;
    expect(problems(a)).toEqual([]);
    expect(problems(b)).toEqual([]);
  });
});
