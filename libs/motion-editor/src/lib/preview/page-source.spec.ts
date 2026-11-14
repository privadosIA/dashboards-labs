import { firstValueFrom, of, throwError } from 'rxjs';

import { AnimationFailure } from '@lab/animation-core';

import { FragmentSource } from './fragment-source';
import { LocalPageSource, ServerPageSource, scenesUsing } from './page-source';
import { CATALOG, DESIGN, SCRIPT, SONG_MAP } from './test-data';

const text = (name: string) => ({ name, manifest: '{}', fragment: `<div>${name}</div><script>window.__partSeek=function(){};</script>` });

function setup(known: string[] = ['pulse-ring']) {
  const calls: string[] = [];
  const port = { partText: (name: string) => (calls.push(name), known.includes(name) ? of(text(name)) : throwError(() => new AnimationFailure('missing', 'no'))) };
  const fragments = new FragmentSource(port);
  return { calls, fragments, source: new LocalPageSource(fragments), input: { piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script: SCRIPT, catalog: CATALOG } };
}

describe('FragmentSource', () => {
  it('reads a part once and keeps the answer, also when it is missing', async () => {
    const { fragments, calls } = setup();
    expect((await firstValueFrom(fragments.fragment('pulse-ring')))!.fragment).toContain('pulse-ring');
    expect(await firstValueFrom(fragments.fragment('toggle'))).toBeNull();
    await firstValueFrom(fragments.fragment('pulse-ring'));
    await firstValueFrom(fragments.fragment('toggle'));
    expect(calls).toEqual(['pulse-ring', 'toggle']);
  });

  it('does not keep a failure that is not "missing", so the next read asks again', async () => {
    const calls: string[] = [];
    const fragments = new FragmentSource({ partText: (n) => (calls.push(n), throwError(() => new AnimationFailure('unavailable', 'down'))) });
    expect(await firstValueFrom(fragments.fragment('x'))).toBeNull();
    expect(await firstValueFrom(fragments.fragment('x'))).toBeNull();
    expect(calls).toEqual(['x', 'x']);
  });

  it('loads the names once each, and forgets on request', async () => {
    const { fragments, calls } = setup();
    const all = await firstValueFrom(fragments.load(['pulse-ring', 'toggle', 'pulse-ring']));
    expect([...all.keys()]).toEqual(['pulse-ring', 'toggle']);
    fragments.forget('toggle');
    await firstValueFrom(fragments.fragment('toggle'));
    expect(calls).toEqual(['pulse-ring', 'toggle', 'toggle']);
  });
});

describe('LocalPageSource', () => {
  it('builds a wrapped page for every piece, with the fidelity and the gaps', async () => {
    const { source, input } = setup();
    const pages = await firstValueFrom(source.pages(input));
    expect(pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(pages[1].html).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(pages[1].html).toContain('<div>pulse-ring</div>');
    expect(pages[0].gaps).toContainEqual({ kind: 'missing-part', name: 'toggle' });
    expect(pages[1].gaps).toContainEqual({ kind: 'missing-part', name: 'counter' });
    expect(pages.every((p) => p.fidelity === 'approximate')).toBe(true);
  });

  it('builds only the pages asked for, and reads only their parts', async () => {
    const { source, input, calls } = setup();
    const pages = await firstValueFrom(source.pages(input, ['p2']));
    expect(pages.map((p) => p.id)).toEqual(['p2']);
    expect(calls.sort()).toEqual(['counter', 'pulse-ring']);
  });

  it('rebuilds only the pieces that changed and gives back the same page for the others', async () => {
    const { source, input } = setup();
    const before = await firstValueFrom(source.pages(input));
    const again = await firstValueFrom(source.pages(input));
    expect(again.every((p, i) => p === before[i])).toBe(true);
    const edited = { ...input, script: { ...input.script, pieces: input.script.pieces.map((p, i) => (i === 1 ? { ...p, mode: p.mode === 'light' ? ('dark' as const) : ('light' as const) } : p)) } };
    const after = await firstValueFrom(source.pages(edited));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].html).not.toBe(before[1].html);
    expect(after[2]).toBe(before[2]);
  });

  it('forgets every page when the song map is another one', async () => {
    const { source, input } = setup();
    const before = await firstValueFrom(source.pages(input));
    const after = await firstValueFrom(source.pages({ ...input, piece: { ...input.piece, songMap: { ...SONG_MAP } } }));
    expect(after[0]).not.toBe(before[0]);
    expect(after[0].html).toBe(before[0].html);
  });

  it('turns a fragment that uses a slot the part does not have into a page that says so', async () => {
    const calls: string[] = [];
    const fragments = new FragmentSource({ partText: (n) => (calls.push(n), of({ name: n, manifest: '{}', fragment: '<div>{{nope}}</div>' })) });
    const source = new LocalPageSource(fragments);
    const { input } = setup();
    const pages = await firstValueFrom(source.pages(input, ['p2']));
    expect(pages[0].error).toContain('{{nope}}');
    expect(pages[0].html).toContain('{{nope}}');
  });
});

describe('ServerPageSource', () => {
  const answer = { width: 1280, height: 720, fps: 30, replacements: [], scenes: [{ id: 'p1', start: 0, end: 7.5, html: '<p>server</p>' }] };

  it('shows the pages the server builds as exact, asking only for the named pieces', async () => {
    const asked: unknown[] = [];
    const { source: local, input } = setup();
    const source = new ServerPageSource((i) => (asked.push(i), of(answer)), local);
    const pages = await firstValueFrom(source.pages(input, ['p1']));
    expect(pages).toEqual([expect.objectContaining({ id: 'p1', html: '<p>server</p>', fidelity: 'exact', gaps: [] })]);
    expect(asked).toEqual([expect.objectContaining({ scenes: ['p1'] })]);
    expect(source.lastProblem).toBeNull();
  });

  it('builds the pages itself and says why when the server refuses the edit', async () => {
    const { source: local, input } = setup();
    const source = new ServerPageSource(() => throwError(() => new AnimationFailure('refused', 'piece "p1" (#1): the part "x" is not in the catalog')), local);
    const pages = await firstValueFrom(source.pages(input));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].fidelity).toBe('approximate');
    expect(source.lastProblem).toContain('not in the catalog');
  });
});

describe('scenesUsing', () => {
  it('names the scenes that draw a part as their own, as an extra, or through a layer item that shows in them', () => {
    expect(scenesUsing(SCRIPT, 'pulse-ring')).toContain('p2');
    expect(scenesUsing(SCRIPT, 'counter')).toEqual(['p2']);
    expect(scenesUsing(SCRIPT, 'nothing-uses-this')).toEqual([]);
    const withLayer = { ...SCRIPT, layers: [{ id: 'l1', name: 'Layer', items: [{ part: 'toggle', start: 3, end: 5, params: {} }] }] } as unknown as typeof SCRIPT;
    const ids = scenesUsing(withLayer, 'toggle');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(SCRIPT.pieces.filter((p) => p.start < 5 && p.end > 3 || p.part === 'toggle').map((p) => p.id));
  });
});

describe('FragmentSource.forget', () => {
  it('makes the next page read the part again, and the page changes with its text', async () => {
    let version = 1;
    const port = { partText: (name: string) => of({ name, manifest: '{}', fragment: `<div>v${version}</div><script>window.__partSeek=function(){};</script>` }) };
    const fragments = new FragmentSource(port);
    const source = new LocalPageSource(fragments);
    const input = { piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script: SCRIPT, catalog: CATALOG };
    const before = await firstValueFrom(source.pages(input, ['p2']));
    version = 2;
    expect(await firstValueFrom(source.pages(input, ['p2']))).toEqual(before);
    fragments.forget('pulse-ring');
    const after = await firstValueFrom(source.pages(input, ['p2']));
    expect(after[0].html).toContain('v2');
    expect(before[0].html).toContain('v1');
  });
});

