import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SongDraftStore } from './draft.store';
import { takeEntry } from './take-entry';

describe('takeEntry', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('fills the Custom form with the entry, replaces what was there and shows the Custom form', async () => {
    const draft = TestBed.inject(SongDraftStore);
    draft.setMode('easy');
    draft.setTitle('old');
    draft.setLyrics('old lyrics');
    await takeEntry(TestBed.inject(Injector), { title: 'Neon Nights', style: 'synthpop, 80s', tags: '', lyrics: 'Luces de neón' });
    expect([draft.title(), draft.style(), draft.lyrics(), draft.mode()]).toEqual(['Neon Nights', 'synthpop, 80s', 'Luces de neón', 'custom']);
  });

  it('makes a title from the first words of the style when the entry has none, without a trailing comma', async () => {
    const draft = TestBed.inject(SongDraftStore);
    await takeEntry(TestBed.inject(Injector), { title: '', style: 'Synthpop de los 80, sintetizadores brillantes', tags: '', lyrics: '' });
    expect(draft.title()).toBe('Synthpop de los 80');
  });

  it('uses the tags as the style of a generator that reads tags, and the description for ACE-Step, which reads a sentence', async () => {
    const draft = TestBed.inject(SongDraftStore);
    const entry = { title: 'x', style: 'Synthpop de los 80', tags: 'synthpop, 80s', lyrics: '' };
    draft.setGenerator('heartmula');
    await takeEntry(TestBed.inject(Injector), entry);
    expect(draft.style()).toBe('synthpop, 80s');
    draft.setGenerator('ace-step');
    await takeEntry(TestBed.inject(Injector), entry);
    expect(draft.style()).toBe('Synthpop de los 80');
    await takeEntry(TestBed.inject(Injector), { ...entry, style: '' });
    expect(draft.style()).toBe('synthpop, 80s');
  });
});
