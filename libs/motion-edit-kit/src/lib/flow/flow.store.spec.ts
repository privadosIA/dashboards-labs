import { DEFAULT_RESOLUTION } from '@lab/animation-core';

import { FlowStorage, type KeyValueStore } from './flow.storage';
import { FlowStore } from './flow.store';
import { MAX_FLOWS, type Plan } from './model';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

const plan = (parts: Plan['parts'] = []): Plan => ({
  song: { title: 'Night Drive', lyrics: '', style: 'synthwave', generator: 'ace-step', instrumental: true },
  animation: { choices: { style: 'illustrated', level: 'medium', fps: 30, resolution: DEFAULT_RESOLUTION, prompt: 'a neon track' } },
  parts,
});

const setup = (max?: number) => {
  const kv = memoryStore();
  let t = 1000;
  let n = 0;
  const storage = new FlowStorage('motion-edit', kv, max);
  const store = new FlowStore(storage, { now: () => (t += 10), newId: () => `f${++n}` });
  return { kv, storage, store };
};

describe('FlowStore', () => {
  it('starts with the plan done and the song next, and keeps it under <client>.flows', () => {
    const { store, kv } = setup();
    const flow = store.start('a neon track', plan());
    expect(flow.current).toBe('song');
    expect(flow.steps.plan.status).toBe('done');
    expect(flow.steps.song.status).toBe('pending');
    expect(JSON.parse(kv.data['motion-edit.flows'])).toHaveLength(1);
    expect(store.flow()?.id).toBe(flow.id);
  });

  it('runs a step, stops it in review with its result, and Continue moves to the next', () => {
    const { store } = setup();
    store.start('x', plan());
    store.run('song');
    expect(store.flow()?.steps.song.status).toBe('running');
    expect(store.complete('song', { id: 's1' })).toBe('song');
    expect(store.flow()?.steps.song).toMatchObject({ status: 'waiting', result: { id: 's1' } });
    expect(store.continue()).toBe('map');
    expect(store.flow()?.steps.song.status).toBe('done');
    expect(store.flow()?.steps.map.status).toBe('pending');
  });

  it('does not continue a step that is not in review', () => {
    const { store } = setup();
    store.start('x', plan());
    expect(store.continue()).toBe('song');
    expect(store.flow()?.steps.song.status).toBe('pending');
  });

  it('goes straight on after a step whose switch is set, and still stops where there is none', () => {
    const { store } = setup();
    store.start('x', plan());
    expect(store.setAuto('map', true)).toBe(true);
    store.run('song');
    store.complete('song');
    store.continue();
    store.run('map');
    expect(store.complete('map')).toBe('design');
    expect(store.flow()?.steps.map.status).toBe('done');
    store.run('design');
    expect(store.complete('design')).toBe('design');
    expect(store.flow()?.steps.design.status).toBe('waiting');
  });

  it('offers no switch on Song, Script or Render, and Render always stops even with every switch set', () => {
    const { store } = setup();
    store.start('x', plan());
    for (const step of ['song', 'script', 'render', 'plan', 'done'] as const) expect(store.setAuto(step, true)).toBe(false);
    for (const step of ['map', 'design', 'parts'] as const) expect(store.setAuto(step, true)).toBe(true);
    store.run('script');
    store.complete('script');
    expect(store.flow()?.steps.script.status).toBe('waiting');
    store.continue();
    expect(store.flow()?.current).toBe('render'); // parts skipped: none wanted
    store.run('render');
    expect(store.complete('render')).toBe('render');
    expect(store.flow()?.steps.render.status).toBe('waiting');
  });

  it('leaves Parts out when the plan wants none, and stops at it when it wants some', () => {
    const none = setup();
    none.store.start('x', plan());
    none.store.run('script');
    none.store.complete('script');
    expect(none.store.continue()).toBe('render');
    expect(none.store.flow()?.steps.parts).toMatchObject({ status: 'skipped', reason: 'no-parts-wanted' });

    const some = setup();
    some.store.start('x', plan([{ name: 'year-counter', request: 'a counter' }]));
    some.store.run('script');
    some.store.complete('script');
    expect(some.store.continue()).toBe('parts');
  });

  it('ends on Done when Render is continued', () => {
    const { store } = setup();
    store.start('x', plan());
    store.run('render');
    store.complete('render', { video: 'v.mp4' });
    expect(store.continue()).toBe('done');
    expect(store.flow()?.steps.done.status).toBe('waiting');
  });

  it('stops a failed step with its reason, and Retry runs it again', () => {
    const { store } = setup();
    store.start('x', plan());
    store.run('design');
    store.fail('design', 'the model refused');
    expect(store.flow()?.steps.design).toMatchObject({ status: 'failed', reason: 'the model refused' });
    expect(store.flow()?.current).toBe('design');
    store.run('design');
    expect(store.flow()?.steps.design).toMatchObject({ status: 'running' });
    expect(store.flow()?.steps.design.reason).toBeUndefined();
  });

  it('skips a step and goes on', () => {
    const { store } = setup();
    store.start('x', plan([{ name: 'p', request: 'r' }]));
    store.run('parts');
    store.fail('parts', 'no model');
    store.skip('parts');
    expect(store.flow()?.steps.parts.status).toBe('skipped');
    expect(store.flow()?.current).toBe('render');
  });

  describe('going back', () => {
    const farAlong = () => {
      const s = setup();
      s.store.start('x', plan([{ name: 'p', request: 'r' }]));
      s.store.setRefs({ songId: 'song-1', libraryKey: 'song-1/track-1/0', pieceId: 'piece-1', drafts: { p: 'draft-1' } });
      for (const step of ['song', 'map', 'design', 'script'] as const) {
        s.store.run(step);
        s.store.complete(step, { step });
        s.store.continue();
      }
      s.store.run('parts');
      s.store.complete('parts', { drafts: 1 });
      return s;
    };

    it('to Song makes map, design, script, parts and render stale with no result, and lists the piece as an earlier attempt', () => {
      const { store } = farAlong();
      store.back('song');
      const f = store.flow()!;
      expect(f.current).toBe('song');
      expect(f.steps.song.status).toBe('waiting');
      for (const step of ['map', 'design', 'script', 'parts'] as const) expect(f.steps[step]).toEqual({ status: 'stale', reason: 'back-to-song' });
      expect(f.attempts).toEqual([expect.objectContaining({ kind: 'piece', id: 'piece-1' })]);
      expect(f.refs.pieceId).toBeUndefined();
      expect(f.refs.songId).toBe('song-1');
    });

    it('to Design keeps the script, out of date and with its result, and makes parts and render stale', () => {
      const { store } = farAlong();
      store.back('design');
      const f = store.flow()!;
      expect(f.steps.design.status).toBe('waiting');
      expect(f.steps.script).toMatchObject({ status: 'stale', result: { step: 'script' } });
      expect(f.steps.parts).toEqual({ status: 'stale', reason: 'back-to-design' });
      expect(f.refs.pieceId).toBe('piece-1');
      expect(f.attempts).toEqual([]);
    });

    it('to Script keeps the parts as they are', () => {
      const { store } = farAlong();
      store.back('script');
      const f = store.flow()!;
      expect(f.steps.script.status).toBe('waiting');
      expect(f.steps.parts).toMatchObject({ status: 'waiting', result: { drafts: 1 } });
      expect(f.refs.drafts).toEqual({ p: 'draft-1' });
    });

    it('to Map lists the piece it will replace, and keeps the song', () => {
      const { store } = farAlong();
      store.back('map');
      const f = store.flow()!;
      expect(f.attempts.map((a) => a.id)).toEqual(['piece-1']);
      expect(f.refs.songId).toBe('song-1');
      expect(f.steps.design.status).toBe('stale');
    });

    it('does nothing for a step that has not run, and deletes no result of the step it goes back to', () => {
      const { store } = farAlong();
      store.back('render');
      expect(store.flow()?.current).toBe('parts');
      store.back('map');
      expect(store.flow()?.steps.map.result).toEqual({ step: 'map' });
    });

    it('a stale step with no result is pending again when the flow reaches it, and one that kept its result waits for the answer', () => {
      const { store } = farAlong();
      store.back('design');
      store.run('design');
      store.complete('design');
      store.continue();
      expect(store.flow()?.current).toBe('script');
      expect(store.flow()?.steps.script).toMatchObject({ status: 'stale', result: { step: 'script' } });
      store.keep('script');
      expect(store.flow()?.steps.script).toMatchObject({ status: 'waiting', result: { step: 'script' } });
      expect(store.flow()?.steps.script.reason).toBeUndefined();
      const fresh = farAlong().store;
      fresh.back('song');
      fresh.run('song');
      fresh.complete('song');
      fresh.continue();
      expect(fresh.flow()?.steps.map.status).toBe('pending');
    });

    it('keeps nothing that has no result to keep', () => {
      const { store } = farAlong();
      store.back('song');
      store.keep('map');
      expect(store.flow()?.steps.map.status).toBe('stale');
    });
  });

  it('retires a song once, however many times', () => {
    const { store } = setup();
    store.start('x', plan());
    store.setRefs({ songId: 's1', libraryKey: 's1/track-1/0' });
    store.retireSong();
    store.setRefs({ songId: 's1' });
    store.retireSong();
    expect(store.flow()?.attempts).toHaveLength(1);
    expect(store.flow()?.refs.libraryKey).toBeUndefined();
  });

  it('writes the flow on every move, so another store reads it as it is', () => {
    const { store, storage } = setup();
    const flow = store.start('x', plan());
    store.run('song');
    expect(storage.get(flow.id)?.steps.song.status).toBe('running');
    store.complete('song');
    expect(storage.get(flow.id)?.steps.song.status).toBe('waiting');
    store.setAuto('map', true);
    expect(storage.get(flow.id)?.autoContinue).toEqual({ map: true });
  });

  it('opens a kept flow, and says when there is none', () => {
    const { store } = setup();
    const flow = store.start('x', plan());
    store.close();
    expect(store.open('nope')).toBe(false);
    expect(store.open(flow.id)).toBe(true);
    expect(store.flow()?.prompt).toBe('x');
  });

  it('starts a new flow from another one: same plan and prompt, nothing run', () => {
    const { store } = setup();
    const first = store.start('x', plan([{ name: 'p', request: 'r' }]));
    store.run('song');
    store.complete('song');
    const second = store.startFrom(store.flow()!);
    expect(second.id).not.toBe(first.id);
    expect(second.plan).toEqual(first.plan);
    expect(second.steps.song.status).toBe('pending');
    expect(store.flows()).toHaveLength(2);
  });

  it('starts with the switches the person keeps by default, and a flow started from another keeps its switches', () => {
    const { store } = setup();
    const first = store.start('x', plan(), { map: true, parts: true });
    expect(first.autoContinue).toEqual({ map: true, parts: true });
    expect(store.startFrom(store.flow()!).autoContinue).toEqual({ map: true, parts: true });
  });

  it('removes a flow', () => {
    const { store } = setup();
    const flow = store.start('x', plan());
    store.remove(flow.id);
    expect(store.flow()).toBeUndefined();
    expect(store.flows()).toEqual([]);
  });

  it('keeps 20 flows, drops the oldest and says so', () => {
    const { store, storage } = setup();
    const first = store.start('first', plan());
    for (let i = 0; i < MAX_FLOWS; i++) store.start(`n${i}`, plan());
    expect(storage.list()).toHaveLength(MAX_FLOWS);
    expect(storage.get(first.id)).toBeUndefined();
    expect(store.notice()).toBe('dropped:1');
    store.clearNotice();
    expect(store.notice()).toBeUndefined();
  });

  it('says so when the browser will not keep a flow, and works from memory', () => {
    const storage = new FlowStorage('motion-edit', { getItem: () => null, setItem: () => { throw new Error('full'); } });
    const store = new FlowStore(storage);
    store.start('x', plan());
    expect(store.notice()).toBe('not-kept');
    expect(store.flow()?.prompt).toBe('x');
  });
});

describe('the default switches', () => {
  it('are kept in the browser, only for the steps that may run on, and read by another store', () => {
    const kv = memoryStore();
    const first = new FlowStore(new FlowStorage('motion-edit', kv));
    expect(first.setDefault('map', true)).toBe(true);
    expect(first.setDefault('parts', true)).toBe(true);
    expect(first.setDefault('song', true)).toBe(false);
    expect(first.setDefault('render', true)).toBe(false);
    expect(JSON.parse(kv.data['motion-edit.flow-defaults'])).toEqual({ map: true, parts: true });
    const second = new FlowStore(new FlowStorage('motion-edit', kv));
    expect(second.defaults()).toEqual({ map: true, parts: true });
    second.setDefault('map', false);
    expect(new FlowStore(new FlowStorage('motion-edit', kv)).defaults()).toEqual({ parts: true });
  });

  it('ignore anything in storage that is not a switch of a step that may run on', () => {
    const kv = memoryStore();
    kv.data['motion-edit.flow-defaults'] = JSON.stringify({ song: true, render: true, design: true, map: 'yes' });
    expect(new FlowStorage('motion-edit', kv).defaults()).toEqual({ design: true });
    kv.data['motion-edit.flow-defaults'] = 'garbage';
    expect(new FlowStorage('motion-edit', kv).defaults()).toEqual({});
  });
});

describe('FlowStorage', () => {
  it('exports a flow as JSON and imports it, with a new id when it is kept already', () => {
    const { store, storage } = setup();
    const flow = store.start('x', plan());
    const text = storage.export(flow);
    const copy = storage.import(text, () => 'copy-1');
    expect(copy?.id).toBe('copy-1');
    expect(storage.list()).toHaveLength(2);
  });

  it('refuses text that is not a flow and ignores damaged storage', () => {
    const { storage, kv } = setup();
    expect(storage.import('{"id":1}', () => 'x')).toBeUndefined();
    expect(storage.import('not json', () => 'x')).toBeUndefined();
    kv.data['motion-edit.flows'] = 'garbage';
    expect(storage.list()).toEqual([]);
    kv.data['motion-edit.flows'] = JSON.stringify([{ id: 'only-an-id' }]);
    expect(storage.list()).toEqual([]);
  });
});
