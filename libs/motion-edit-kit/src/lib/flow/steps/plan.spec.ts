import { CATALOG } from '@lab/animation-core/testing';
import { AssistFailed, type SongPort } from '@lab/music-studio-kit';
import { firstValueFrom, of, throwError } from 'rxjs';

import type { AssistedPlan } from '@lab/animation-core';
import { assistantOf, defaultChoices, defaultPlan, planFromAssisted, modelOfPlan, parsePartLines, partLines, planOfModel, titleOf, withWritten, writeSong } from './plan';

describe('the plan', () => {
  it('starts from the sentence as the prompt, with the catalog default choices, an empty song and no parts', () => {
    const plan = defaultPlan('  a neon synthwave track about driving at night  ', CATALOG);
    expect(plan.animation.choices).toEqual({ style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720', prompt: 'a neon synthwave track about driving at night' });
    expect(plan.song).toMatchObject({ title: 'a neon synthwave track about driving', lyrics: '', style: '', generator: 'ace-step', instrumental: false });
    expect(plan.parts).toEqual([]);
  });

  it('takes a style, level and frame rate the catalog has when it lacks the usual ones', () => {
    const c = defaultChoices('x', { ...CATALOG, styles: ['illustrated'], levels: ['medium'], frameRates: [60] });
    expect(c).toMatchObject({ style: 'illustrated', level: 'medium', fps: 60 });
  });

  it('puts what the assistant wrote in the empty fields and keeps what the person already has', () => {
    const base = defaultPlan('night drive', null, { lyrics: 'mine' });
    const filled = withWritten(base, 'night drive', { title: 'Night Drive', lyrics: 'theirs', style: 'synthwave' });
    expect(filled.song).toMatchObject({ title: 'Night Drive', lyrics: 'mine', style: 'synthwave' });
    expect(withWritten(base, 'night drive', { title: '', lyrics: '', style: '' }).song.title).toBe('night drive');
    expect(titleOf('one two three four five six seven')).toBe('one two three four five six');
  });

  describe('the plan the server wrote in one call', () => {
    const answer: AssistedPlan = {
      song: { title: 'Night Drive', caption: 'a synthwave sentence', lyrics: '[Verse]\nla', tags: 'synthwave, night', instrumental: false, seconds: 90 },
      animation: { style: 'illustrated', level: 'medium', fps: 24, mode: 'dark', concept: 'a drive that ends at dawn', prompt: 'a neon track' },
      parts: [{ name: 'timeline-strip', exists: true }, { name: 'year-counter', exists: false, request: 'a counter that rolls through years' }],
      warnings: [],
    };

    it('fills the song, the choices, the prompt with the concept and the mode, and the parts', () => {
      const plan = planFromAssisted('a neon track', answer, CATALOG);
      expect(plan.song).toMatchObject({ title: 'Night Drive', lyrics: '[Verse]\nla', style: 'a synthwave sentence', generator: 'ace-step', instrumental: false, seconds: 90 });
      expect(plan.animation.choices).toEqual({ style: 'illustrated', level: 'medium', fps: 24, resolution: '1280x720', prompt: 'a neon track\nConcept: a drive that ends at dawn\nMode: dark.' });
      expect(plan.parts).toEqual([{ name: 'timeline-strip', request: 'timeline strip' }, { name: 'year-counter', request: 'a counter that rolls through years' }]);
    });

    it('reads the tags, not the caption, for a generator that takes tags, and no lyrics for an instrumental song', () => {
      const plan = planFromAssisted('x', { ...answer, song: { ...answer.song, instrumental: true } }, CATALOG, { provider: '', model: '' }, 'heartmula');
      expect(plan.song).toMatchObject({ style: 'synthwave, night', lyrics: '', generator: 'heartmula', instrumental: true });
    });

    it('keeps the catalog defaults for what the server left empty or the catalog does not offer, and has no length when none was named', () => {
      const plan = planFromAssisted('a calm piece', { song: { title: '', caption: 'c', lyrics: '', tags: '', instrumental: true, seconds: 0 }, animation: { style: '', level: 'galactic', fps: 0, mode: '', concept: '', prompt: '' }, parts: [], warnings: ['no style'] }, CATALOG);
      expect(plan.animation.choices).toMatchObject({ style: 'typographic', level: 'simple', fps: 30, prompt: 'a calm piece' });
      expect(plan.song.title).toBe('a calm piece');
      expect('seconds' in plan.song).toBe(false);
    });

    it('puts the run\'s provider and model on the calls that write', () => {
      const plan = planFromAssisted('x', answer, CATALOG, { provider: 'router', model: 'gpt' });
      expect(plan.song).toMatchObject({ provider: 'router', model: 'gpt' });
      expect(plan.animation).toMatchObject({ provider: 'router', model: 'gpt' });
    });

    it('goes through the form with the length as text, and an empty or bad length means none', () => {
      const plan = planFromAssisted('x', answer, CATALOG);
      const model = modelOfPlan(plan);
      expect(model['seconds']).toBe('90');
      expect(planOfModel(model).plan.song.seconds).toBe(90);
      for (const bad of ['', '0', 'abc', '12.5', -3]) expect(planOfModel({ ...model, seconds: bad }).plan.song.seconds, String(bad)).toBeUndefined();
      expect(planOfModel({ ...model, seconds: 45 }).plan.song.seconds).toBe(45);
    });
  });

  describe('writing the song', () => {
    const port = (write: SongPort['write']) => ({ write }) as unknown as SongPort;
    const options = { generator: 'heartmula', instrumental: false } as const;

    it('asks with the provider and the model of the card and returns the texts, creating nothing', async () => {
      const write = vi.fn(() => of({ title: '', lyrics: 'l', style: 's' }));
      const generate = vi.fn();
      const songs = { write, generate } as unknown as SongPort;
      expect(await firstValueFrom(writeSong(songs, ' night ', { ...options, provider: 'router', model: 'qwen3:8b' }))).toEqual({ written: { title: '', lyrics: 'l', style: 's' } });
      expect(write).toHaveBeenCalledWith({ text: 'night', generator: 'heartmula', instrumental: false, provider: 'router', model: 'qwen3:8b' });
      expect(generate).not.toHaveBeenCalled();
    });

    it('does not send an empty provider or model', async () => {
      const write = vi.fn(() => of({ title: '', lyrics: '', style: '' }));
      await firstValueFrom(writeSong(port(write), 'x', options));
      expect(write).toHaveBeenCalledWith({ text: 'x', generator: 'heartmula', instrumental: false });
    });

    it('gives the reason instead of failing when the assistant cannot write', async () => {
      expect(await firstValueFrom(writeSong(port(() => throwError(() => new AssistFailed('busy', 'a run is active'))), 'x', options))).toEqual({ failed: 'busy: a run is active' });
      expect(await firstValueFrom(writeSong(port(() => throwError(() => new Error('boom'))), 'x', options))).toEqual({ failed: 'boom' });
    });
  });

  describe('the form model', () => {
    it('goes both ways, with the frame rate as text; the run\'s provider and model go on every call that writes and none when empty', () => {
      const assistant = { provider: 'router', model: 'gpt' };
      const plan = defaultPlan('x', CATALOG, {}, assistant);
      plan.parts = [{ name: 'year-counter', request: 'a counter' }];
      const model = modelOfPlan(plan);
      expect(model['fps']).toBe('30');
      expect(planOfModel(model, assistant)).toEqual({ plan, invalidParts: [] });
      expect(plan.song).toMatchObject({ provider: 'router', model: 'gpt' });
      expect(plan.animation).toMatchObject({ provider: 'router', model: 'gpt' });
      expect(assistantOf(plan)).toEqual(assistant);
      const bare = planOfModel(model).plan;
      expect(bare.song.provider).toBeUndefined();
      expect(bare.song.model).toBeUndefined();
      expect(bare.animation.provider).toBeUndefined();
      expect(bare.animation.model).toBeUndefined();
      expect(assistantOf(bare)).toEqual({ provider: '', model: '' });
    });

    it('reads the parts: one per line, the name alone gets a request from itself, bad and repeated names are returned', () => {
      expect(parsePartLines('year-counter: rolls the years\ntimeline\nBad Name: x\nyear-counter: again\n\n')).toEqual({
        parts: [{ name: 'year-counter', request: 'rolls the years' }, { name: 'timeline', request: 'timeline' }],
        invalid: ['Bad Name: x', 'year-counter: again'],
      });
      expect(partLines([{ name: 'a', request: 'b c' }])).toBe('a: b c');
    });
  });
});
