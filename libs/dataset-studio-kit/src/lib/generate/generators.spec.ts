import { validateAnimationDataset } from '@lab/animation-dataset';
import { firstValueFrom, lastValueFrom, of, throwError, toArray } from 'rxjs';

import { kindOf, type KindId } from '../kinds/kinds';
import { type GenerateDeps, type GenerateRequest, type Progress, generate, readPartLine, takeQuote, withInlineExamples } from './generators';
import { parseText } from './markers';
import { SONG_TO_CHOOSE, composePiece } from './piece';
import { type DatasetInput, GenerateFailed, MemoryWriter, type MusicInput, type WriteInput, type WriterPort } from './writer';

interface Calls {
  image: WriteInput[];
  motion: WriteInput[];
  music: MusicInput[];
  dataset: DatasetInput[];
}
function fakeDeps(over: Partial<WriterPort> = {}): { deps: GenerateDeps; calls: Calls } {
  const calls: Calls = { image: [], motion: [], music: [], dataset: [] };
  const writer: WriterPort = {
    image: (i) => (calls.image.push(i), of(`PROMPT(${i.text})`)),
    motion: (i) => (calls.motion.push(i), of(`MOTION(${i.text})`)),
    music: (i) => (calls.music.push(i), of({ caption: `style of ${i.text}`, lyrics: i.instrumental ? '' : '[Verse]\nla', tags: i.generator === 'ace-step' ? '' : 'pop, calm' })),
    dataset: (i) => (calls.dataset.push(i), of({ entries: [['s01', 'One', '', 'text']] as never, warnings: ['scene 4 had no dialogue'] })),
    ...over,
  };
  const plan = { song: { title: 'City waking', caption: 'c', lyrics: '', tags: '', instrumental: true, seconds: 120 }, animation: { style: 'illustrated', level: 'medium', fps: 24, mode: 'light', concept: 'a city wakes', prompt: 'p' }, parts: [{ name: 'toggle', exists: true }, { name: 'sunrise', exists: false, request: 'a sunrise over roofs' }], warnings: ['one value was empty'] };
  const animation = { plan: () => of(plan), catalog: () => of({ fonts: ['Inter'], features: ['plan'] }) } as never;
  return { deps: { writer, animation }, calls };
}
const request = (kind: KindId, over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  kind: kindOf(kind),
  mode: kind === 'songs' ? 'track' : kind === 'piece' ? 'plan' : 'lines',
  brief: '',
  negative: '',
  engine: '',
  generator: 'ace-step',
  instrumental: false,
  variants: 1,
  language: 'en',
  assistant: { provider: '', model: '' },
  examples: [],
  features: ['plan'],
  existing: [],
  ...over,
});
const last = (p: Progress[]): Progress => p[p.length - 1];

describe('storyboard (one line per scene)', () => {
  it('composes three entries: the second with Dialogue, the third silent, one assistant call per line', async () => {
    const { deps, calls } = fakeDeps();
    const progress = await lastValueFrom(generate(deps, request('video', { brief: 'The hive at dawn\nThe bee says "good morning" on a flower\n- a silent shot of the meadow', negative: 'blurry' })).pipe(toArray()));
    const done = last(progress);
    expect(done.finished).toBe(true);
    expect(calls.image.length).toBe(3);
    expect(done.tuples.map((t) => t[0])).toEqual(['s01', 's02', 's03']);
    const [a, b, c] = done.tuples.map((t) => parseText(t[3]));
    expect(a.markers).toEqual([{ name: 'Negative', value: 'blurry' }]);
    expect(b.markers).toEqual([{ name: 'Dialogue', value: '"good morning"' }, { name: 'Negative', value: 'blurry' }]);
    expect(c.markers).toEqual([{ name: 'Silence', value: '2' }, { name: 'Negative', value: 'blurry' }]);
    expect(b.prompt).toBe('PROMPT(The bee says on a flower)');
    expect(done.tuples[2][1]).toBe('a silent shot of the meadow');
  });

  it('shows its progress as it goes, so a Stop keeps what was written', async () => {
    const { deps } = fakeDeps();
    const all = await lastValueFrom(generate(deps, request('video', { brief: 'one\ntwo\nthree' })).pipe(toArray()));
    expect(all.map((p) => [p.done, p.total, p.tuples.length])).toEqual([[0, 3, 0], [1, 3, 1], [2, 3, 2], [3, 3, 3]]);
  });

  it('adds Variants for images, and the look\'s words to every call but never counts the style line as a scene', async () => {
    const { deps, calls } = fakeDeps();
    const done = last(await lastValueFrom(generate(deps, request('images', { brief: 'a neon street\nstyle: soft light\nan empty room', variants: 3 })).pipe(toArray())));
    expect(done.tuples.length).toBe(2);
    expect(calls.image.map((c) => c.text)).toEqual(['a neon street, soft light', 'an empty room, soft light']);
    expect(parseText(done.tuples[0][3]).markers).toContainEqual({ name: 'Variants', value: '3' });
  });

  it('keeps a line the model declines as the person wrote it, with a note, and goes on', async () => {
    const { deps } = fakeDeps({ image: (i) => (i.text.startsWith('bad') ? throwError(() => new GenerateFailed('refused', 'no')) : of('ok')) });
    const done = last(await lastValueFrom(generate(deps, request('video', { brief: 'fine\nbad line' })).pipe(toArray())));
    expect(done.tuples.map((t) => parseText(t[3]).prompt)).toEqual(['ok', 'bad line']);
    expect(done.warnings).toEqual([{ code: 'kept-as-written', line: 2, detail: 'no' }]);
  });

  it('stops everything when a run is in progress', async () => {
    const { deps } = fakeDeps({ image: () => throwError(() => new GenerateFailed('busy')) });
    await expect(lastValueFrom(generate(deps, request('video', { brief: 'one\ntwo' })))).rejects.toMatchObject({ kind: 'busy' });
  });

  it('writes a part line with no model call', async () => {
    const { deps, calls } = fakeDeps();
    const done = last(await lastValueFrom(generate(deps, request('graphics', { brief: 'part: toggle count=3 label=allow' })).pipe(toArray())));
    expect(calls.motion.length + calls.image.length).toBe(0);
    expect(parseText(done.tuples[0][3]).markers).toEqual([{ name: 'Part', value: 'toggle' }, { name: 'Param count', value: '3' }, { name: 'Param label', value: 'allow' }]);
    expect(done.tuples[0][0]).toBe('g01');
  });

  it('expands another graphics line with the motion task', async () => {
    const { deps, calls } = fakeDeps();
    const done = last(await lastValueFrom(generate(deps, request('graphics', { brief: 'a counter that counts to 100' })).pipe(toArray())));
    expect(calls.motion.map((c) => c.text)).toEqual(['a counter that counts to 100']);
    expect(parseText(done.tuples[0][3]).prompt).toBe('MOTION(a counter that counts to 100)');
  });

  it('sends the pair chosen with every call, and the examples only when the server lists them', async () => {
    const examples = [{ prompt: 'house style one' }, { prompt: 'house style two' }, { prompt: 'three' }];
    const a = fakeDeps();
    await lastValueFrom(generate(a.deps, request('video', { brief: 'one', assistant: { provider: 'router', model: 'gpt-x' }, examples, features: ['plan', 'examples'] })).pipe(toArray()));
    expect(a.calls.image[0]).toMatchObject({ provider: 'router', model: 'gpt-x', examples });
    const b = fakeDeps();
    const done = last(await lastValueFrom(generate(b.deps, request('video', { brief: 'one', examples })).pipe(toArray())));
    expect(b.calls.image[0].examples).toBeUndefined();
    expect(b.calls.image[0].text).toContain('- house style one');
    expect(b.calls.image[0].text).not.toContain('three');
    expect(done.warnings).toEqual([{ code: 'examples-inline', count: 2 }]);
  });

  it('answers an empty, finished progress for a brief with no scenes', async () => {
    const { deps } = fakeDeps();
    expect(await firstValueFrom(generate(deps, request('video', { brief: 'style: only a style\n\n' })))).toMatchObject({ finished: true, tuples: [] });
  });
});

describe('one sentence', () => {
  it('calls the server\'s dataset writer once with the brief, the engine, the negative, the look and the examples', async () => {
    const { deps, calls } = fakeDeps();
    const done = last(
      await lastValueFrom(
        generate(deps, request('images', { mode: 'sentence', brief: 'a bee documentary\nstyle: photorealistic', negative: 'text', engine: 'jug', variants: 2, features: ['plan', 'dataset', 'examples'], examples: [{ prompt: 'x' }], assistant: { provider: '', model: 'qwen3:8b' } })).pipe(toArray()),
      ),
    );
    expect(calls.dataset).toEqual([{ mode: 'video', text: 'a bee documentary', language: 'en', engine: 'jug', negative: 'text', look: 'photorealistic', images: { variants: 2 }, examples: [{ prompt: 'x' }], model: 'qwen3:8b' }]);
    expect(done.tuples.length).toBe(1);
    expect(done.warnings).toEqual([{ code: 'server', detail: 'scene 4 had no dialogue' }]);
  });
});

describe('songs', () => {
  it('writes one track per generation and appends the next, each with style, Lyrics and the generator\'s Tags', async () => {
    const { deps } = fakeDeps();
    const first = last(await lastValueFrom(generate(deps, request('songs', { brief: 'summer pop', generator: 'heartmula' })).pipe(toArray())));
    expect(first.tuples.length).toBe(1);
    const second = last(await lastValueFrom(generate(deps, request('songs', { brief: 'night jazz', generator: 'heartmula', existing: first.tuples })).pipe(toArray())));
    expect(second.tuples.map((t) => t[0])).toEqual(['t01', 't02']);
    for (const t of second.tuples) {
      const p = parseText(t[3]);
      expect(p.markers.map((m) => m.name)).toEqual(['Lyrics', 'Tags']);
      expect(p.prompt).toMatch(/^style of /);
    }
  });

  it('leaves out Lyrics and says Instrumental, and ACE-Step takes no Tags', async () => {
    const { deps } = fakeDeps();
    const done = last(await lastValueFrom(generate(deps, request('songs', { brief: 'calm', instrumental: true })).pipe(toArray())));
    expect(parseText(done.tuples[0][3]).markers).toEqual([{ name: 'Instrumental', value: '' }]);
  });
});

describe('animated piece', () => {
  it('composes a music-motion-dataset v2 without a script, with the song to choose, the plan\'s options and the parts the catalog lacks', async () => {
    const { deps } = fakeDeps();
    const done = last(await lastValueFrom(generate(deps, request('piece', { brief: 'a city waking' })).pipe(toArray())));
    const a = done.piece!.animation;
    expect(a.song).toMatchObject({ project: SONG_TO_CHOOSE, title: 'City waking', seconds: 120 });
    expect(a.options).toMatchObject({ style: 'illustrated', level: 'medium', fps: 24 });
    expect(a.design).toMatchObject({ defaultMode: 'light', concept: 'a city wakes', display: 'Inter' });
    expect(a.script.pieces).toEqual([]);
    expect(a.parts).toEqual([{ name: 'sunrise', description: 'a sunrise over roofs', text: null }]);
    expect(done.warnings).toEqual([{ code: 'server', detail: 'one value was empty' }]);
    expect(validateAnimationDataset(JSON.parse(JSON.stringify(done.piece)), 'en')).toMatchObject({ ok: true });
  });

  it('says there is no plan when the server does not list it', async () => {
    const { deps } = fakeDeps();
    expect(last(await lastValueFrom(generate(deps, request('piece', { features: [] })).pipe(toArray()))).warnings).toEqual([{ code: 'no-plan' }]);
  });

  it('falls back to the first options when the plan left a value empty', () => {
    const p = composePiece({ song: { title: '', caption: '', lyrics: '', tags: '', instrumental: false, seconds: 0 }, animation: { style: '', level: '', fps: 0, mode: '', concept: '', prompt: '' }, parts: [], warnings: [] }, { fonts: [] });
    expect(p.animation.options).toMatchObject({ style: 'typographic', level: 'simple', fps: 30 });
    expect(p.animation.song).toMatchObject({ title: 'Untitled', seconds: 180 });
    expect(validateAnimationDataset(JSON.parse(JSON.stringify(p)), 'en')).toMatchObject({ ok: true });
  });
});

describe('small readers', () => {
  it('takes a quoted sentence in any of the quote styles', () => {
    expect(takeQuote('a bee says "hello there" slowly')).toEqual({ quote: 'hello there', rest: 'a bee says slowly' });
    expect(takeQuote('dice «hola»')).toEqual({ quote: 'hola', rest: 'dice' });
    expect(takeQuote('no quote')).toEqual({ quote: '', rest: 'no quote' });
  });

  it('reads a part line with plain and quoted values, and nothing else', () => {
    expect(readPartLine('part: toggle count=3 label="allow all"')).toEqual({ part: 'toggle', params: [{ name: 'count', value: '3' }, { name: 'label', value: 'allow all' }] });
    expect(readPartLine('a toggle')).toBeNull();
  });

  it('does not add examples that would pass the limit', () => {
    expect(withInlineExamples('x'.repeat(1990), [{ prompt: 'long example' }])).toEqual({ text: 'x'.repeat(1990), used: 0 });
    expect(withInlineExamples('x', [])).toEqual({ text: 'x', used: 0 });
  });

  it('the in-memory writer answers every task', async () => {
    const w = new MemoryWriter();
    expect(await firstValueFrom(w.image({ text: 'a' }))).toContain('a');
    expect((await firstValueFrom(w.music({ text: 's', generator: 'heartmula', instrumental: false }))).tags).toBe('pop, upbeat, warm');
    expect((await firstValueFrom(w.dataset({ mode: 'video', text: 'one. two', language: 'en' }))).entries.length).toBe(2);
  });
});

