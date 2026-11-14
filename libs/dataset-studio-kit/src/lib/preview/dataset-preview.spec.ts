import { TestBed } from '@angular/core/testing';
import { ANIMATION } from '@lab/animation-core';
import { DATASET_PORT, type DatasetMode, type DatasetPort, type DatasetPreview as ServerPreview } from '@lab/dataset-import';
import { type Observable, of, throwError } from 'rxjs';

import { DATASET_STUDIO_OPTIONS } from '../core/options';
import { composePiece } from '../generate/piece';
import { kindOf, type KindId } from '../kinds/kinds';
import { DatasetPreview } from './dataset-preview';
import type { PreviewStatus } from './status';

const tuples = (...texts: string[]) => JSON.stringify(texts.map((t, i) => [`s0${i + 1}`, `Scene ${i + 1}`, '', t]));

/** A port that reads the markers the way the server does for the counts: silent is an entry with no Dialogue line, and a Dialogue line with no quotes is refused. */
function fakePort(calls: string[] = []): DatasetPort {
  return {
    preview: (content: string, _mode: DatasetMode): Observable<ServerPreview> => {
      calls.push(content);
      const rows = JSON.parse(content) as string[][];
      const report: string[] = [];
      let rejected = 0;
      let quiet = 0;
      for (const [id, , , text] of rows) {
        const dialogue = /^Dialogue:(.*)$/m.exec(text);
        if (dialogue && !/"[^"]+"/.test(dialogue[1])) {
          rejected += 1;
          report.push(`[${id}]\n  rejected: Dialogue line without quoted text`);
          continue;
        }
        if (!dialogue) quiet += 1;
        report.push(`[${id}]\n  mapped: prompt`);
      }
      return of({ yaml: 'scenes:\n', report: `${report.join('\n')}\nimported ${rows.length - rejected}\n`, entries: rows.length, imported: rows.length - rejected, quiet, rejected });
    },
    confirm: (id: string) => of(id),
  };
}

const settleFor = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 4));
  }
  fixture.detectChanges();
};

async function create(kind: KindId, raw: string, options: { port?: DatasetPort; animation?: unknown; lang?: 'es' | 'en' } = {}) {
  TestBed.resetTestingModule();
  const animation =
    options.animation ??
    ({
      songs: () => of([]),
      catalog: () => of({ parts: [], fonts: ['Inter'], features: [] }),
      references: () => of([]),
      presets: () => of([]),
      drafts: () => of([]),
      pieces: () => of([]),
    } as never);
  TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, { provide: DATASET_PORT, useValue: options.port ?? fakePort() }, { provide: ANIMATION, useValue: animation }] });
  const fixture = TestBed.createComponent(DatasetPreview);
  fixture.componentRef.setInput('kind', kindOf(kind));
  fixture.componentRef.setInput('debounceMs', 0);
  fixture.componentRef.setInput('raw', raw);
  const statuses: PreviewStatus[] = [];
  fixture.componentInstance.status.subscribe((s) => statuses.push(s));
  await settleFor(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, preview: fixture.componentInstance, statuses };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const setValue = (el: HTMLElement | null, value: string, event: 'change' | 'input' = 'change') => {
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event(event));
};

describe('DatasetPreview (tuples)', () => {
  const raw = tuples('Dialogue: "Hello."\nNegative: blur\na hive', 'Dialogue: "Good morning."\nSilence: 2\na bee', 'a meadow');

  it('reads the entries into a table with the markers in columns, and shows the server\'s counts and report', async () => {
    const { el } = await create('video', raw);
    expect((q(el, 'cell-id-0') as HTMLInputElement).value).toBe('s01');
    expect((q(el, 'cell-text-0') as HTMLTextAreaElement).value).toBe('a hive');
    expect((q(el, 'cell-Dialogue-0') as HTMLTextAreaElement).value).toBe('"Hello."');
    expect((q(el, 'cell-Negative-0') as HTMLTextAreaElement).value).toBe('blur');
    expect((q(el, 'cell-Silence-1') as HTMLTextAreaElement).value).toBe('2');
    expect(q(el, 'server-counts')!.textContent).toMatch(/3\s*Entries\s*3\s*Imported\s*1\s*Silent\s*0\s*Rejected/);
    expect(q(el, 'server-report')!.textContent).toContain('[s01]');
    expect((q(el, 'raw-text') as HTMLTextAreaElement).value).toBe(raw);
  });

  it('removing the Dialogue line of entry 2 in the raw text empties its cell and the server\'s report shows one more silent scene', async () => {
    const calls: string[] = [];
    const { fixture, el, preview } = await create('video', raw, { port: fakePort(calls) });
    const edited = JSON.parse(raw) as string[][];
    edited[1][3] = 'Silence: 2\na bee';
    setValue(q(el, 'raw-text'), JSON.stringify(edited, null, 2), 'input');
    await settleFor(fixture);
    expect((q(el, 'cell-Dialogue-1') as HTMLTextAreaElement).value).toBe('');
    expect(calls.length).toBe(2);
    expect(q(el, 'server-counts')!.textContent).toMatch(/2\s*Silent/);
    expect(preview.raw()).toContain('"Silence: 2\\na bee"');
  });

  it('editing a cell of the table rewrites the raw text and asks the server again', async () => {
    const calls: string[] = [];
    const { fixture, el, preview } = await create('video', raw, { port: fakePort(calls) });
    setValue(q(el, 'cell-Negative-0'), 'blurry, text');
    await settleFor(fixture);
    expect((JSON.parse(preview.raw()) as string[][])[0][3]).toBe('Dialogue: "Hello."\nNegative: blurry, text\na hive');
    setValue(q(el, 'cell-title-2'), 'The meadow');
    await settleFor(fixture);
    expect((JSON.parse(preview.raw()) as string[][])[2][1]).toBe('The meadow');
    expect(calls.length).toBe(3);
  });

  it('marks a row the server rejects with its reason, and the rest stay', async () => {
    const bad = tuples('Dialogue: hello without quotes\na hive', 'a meadow');
    const { el, statuses } = await create('video', bad);
    expect(q(el, 'row-0')!.classList).toContain('row--rejected');
    expect(q(el, 'why-0')!.textContent).toContain('Rejected: Dialogue line without quoted text');
    expect(q(el, 'row-1')!.classList).not.toContain('row--rejected');
    expect(statuses.at(-1)).toMatchObject({ valid: true, imported: 1, rejected: 1 });
  });

  it('marks a line it cannot read and keeps it, and says so when the file is not JSON', async () => {
    const mixed = JSON.stringify([['s01', 'One', '', 'a hive'], 'not a tuple']);
    const { el } = await create('video', mixed, { port: { preview: () => throwError(() => new Error('x')), confirm: () => of('') } });
    expect(q(el, 'unread-1')!.textContent).toContain('This line cannot be read');
    expect(q(el, 'unread-1')!.textContent).toContain('not a tuple');
    const broken = await create('video', '[{');
    expect(q(broken.el, 'unreadable')!.textContent).toContain('cannot be read');
    expect(q(broken.el, 'raw-text')).not.toBeNull();
  });

  it('shows the server\'s failure in words and reports no valid dataset', async () => {
    const { el, statuses } = await create('video', raw, { port: { preview: () => throwError(() => new Error('The file is empty.')), confirm: () => of('') } });
    expect(q(el, 'server-failed')!.textContent).toContain('The server could not read it: The file is empty.');
    expect(statuses.at(-1)?.valid).toBe(false);
  });

  it('shows Param values together for graphics and the lyrics for songs', async () => {
    const g = await create('graphics', tuples('Part: toggle\nParam count: 3\nParam label: allow'));
    expect(q(g.el, 'cell-params-0')!.textContent).toBe('count=3, label=allow');
    const s = await create('songs', JSON.stringify([['t01', 'Song', '', 'upbeat pop\nLyrics: [Verse]\nla la\nTags: pop']]));
    expect((q(s.el, 'cell-Lyrics-0') as HTMLTextAreaElement).value).toBe('[Verse]\nla la');
    expect((q(s.el, 'cell-Tags-0') as HTMLTextAreaElement).value).toBe('pop');
  });

  it('says there is nothing to see until there is a dataset', async () => {
    const { el } = await create('video', '');
    expect(q(el, 'preview-empty')).not.toBeNull();
  });
});

describe('DatasetPreview (animated piece)', () => {
  const piece = composePiece({ song: { title: 'City', caption: '', lyrics: '', tags: '', instrumental: true, seconds: 100 }, animation: { style: 'illustrated', level: 'simple', fps: 30, mode: 'dark', concept: 'c', prompt: '' }, parts: [{ name: 'sunrise', exists: false, request: 'a sunrise' }], warnings: [] }, { fonts: ['Inter'] });

  it('lists what the import would do, with the reason that the song is not there yet', async () => {
    const { el, statuses } = await create('piece', JSON.stringify(piece, null, 2));
    expect(q(el, 'plan-0')!.textContent).toContain('Cannot be done');
    expect(q(el, 'plan-0')!.textContent).toContain('the song is not in the library');
    expect(statuses.at(-1)).toMatchObject({ valid: true });
    expect(statuses.at(-1)?.dataset?.animation.title).toBe('City');
  });

  it('lists the validator\'s problems and nothing else for a file that is not a dataset', async () => {
    const { el, statuses } = await create('piece', JSON.stringify({ format: 'other' }));
    expect(q(el, 'piece-problems')!.textContent).toContain('animation dataset');
    expect(statuses.at(-1)?.valid).toBe(false);
  });
});
