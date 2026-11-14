import { TestBed } from '@angular/core/testing';

import { stubStorage } from '../../testing/memory-storage';
import { SongDraftStore } from './draft.store';

function store(saved: Record<string, string> = {}): SongDraftStore {
  stubStorage(saved);
  TestBed.resetTestingModule();
  return TestBed.inject(SongDraftStore);
}

describe('SongDraftStore', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('the mode', () => {
    it('is Easy the first time', () => {
      expect(store().mode()).toBe('easy');
    });

    it('is remembered between visits', () => {
      store().setMode('custom');
      expect(store({ 'music-studio.mode': 'custom' }).mode()).toBe('custom');
    });

    it('ignores a stored value it does not know', () => {
      expect(store({ 'music-studio.mode': 'wizard' }).mode()).toBe('easy');
    });

    it('does not lose what was typed when the mode changes', () => {
      const s = store();
      s.setTitle('Night drive');
      s.setPrompt('A soothing piano melody');
      s.setMode('easy');
      s.setMode('custom');
      expect(s.title()).toBe('Night drive');
      expect(s.prompt()).toBe('A soothing piano melody');
    });
  });

  describe('Custom', () => {
    it('cannot be generated without a title, lyrics or (for a tag generator) a style tag, and says which is missing', () => {
      const s = store();
      expect(s.customProblems()).toEqual(['title.required', 'lyrics.required', 'style.required']);
      s.setTitle('Night drive');
      s.setLyrics('la la');
      expect(s.customProblems()).toEqual(['style.required']);
      s.setStyle('lo-fi');
      expect(s.customProblems()).toEqual([]);
      s.setStyle('');
      s.setGenerator('ace-step');
      expect(s.customProblems()).toEqual([]);
    });

    it('makes the request from the fields, with the generator that was chosen', () => {
      const s = store();
      s.setTitle('Night drive');
      s.setLyrics('la');
      s.setStyle('lo-fi');
      s.setGenerator('ace-step');
      expect(s.request()).toEqual({ title: 'Night drive', lyrics: 'la', style: 'lo-fi', generator: 'ace-step', instrumental: false });
    });

    it('toggles tags and applies combinations in the style', () => {
      const s = store();
      s.toggleTag('lo-fi');
      s.toggleTag('lo-fi');
      s.toggleTag('piano');
      s.applyCombo(['piano', 'chill']);
      expect(s.style()).toBe('piano, chill');
      s.toggleCombo(['piano', 'chill']);
      expect(s.style()).toBe('');
    });

    it('inserts a structure tag at the cursor and reports where the cursor goes', () => {
      const s = store();
      s.setLyrics('la la');
      expect(s.insertSection(5, 5, 'chorus')).toBe(15);
      expect(s.lyrics()).toBe('la la\n[chorus]\n');
    });
  });

  describe('the vocal gender', () => {
    it('adds the voice tag to the style, replacing the other, and random takes it away', () => {
      const s = store();
      s.setStyle('pop');
      s.setGender('female');
      expect(s.style()).toBe('pop, female vocal');
      s.setGender('male');
      expect(s.style()).toBe('pop, male vocal');
      s.setGender('random');
      expect(s.style()).toBe('pop');
    });

    it('follows a voice tag typed in the style', () => {
      const s = store();
      s.setStyle('pop, female vocal');
      expect(s.gender()).toBe('female');
      s.setStyle('pop');
      expect(s.gender()).toBe('random');
    });

    it('uses the voice tags the server lists', () => {
      const s = store();
      s.setVoiceTags({ female: 'woman voice', male: 'man voice' });
      s.setGender('male');
      expect(s.style()).toBe('man voice');
    });
  });

  describe('Easy', () => {
    it('needs a prompt of at most 2000 characters', () => {
      const s = store();
      expect(s.easyProblems()).toEqual(['prompt.required']);
      s.setPrompt('x'.repeat(2001));
      expect(s.easyProblems()).toEqual(['prompt.tooLong']);
      s.setPrompt('A soothing piano melody');
      expect(s.easyProblems()).toEqual([]);
    });

    it('fills the prompt from a quick example', () => {
      const s = store();
      s.setPrompt('Tropical house with steel drums');
      expect(s.prompt()).toBe('Tropical house with steel drums');
    });
  });

  describe('what the assistant wrote', () => {
    it('knows whether there is text it would replace', () => {
      const s = store();
      expect(s.hasWrittenText()).toBe(false);
      s.setStyle('pop');
      expect(s.hasWrittenText()).toBe(true);
    });

    it('fills the fields, keeps the title when it gave none, and re-applies the gender that was chosen', () => {
      const s = store();
      s.setTitle('Mine');
      s.setGender('female');
      s.adopt({ title: '', lyrics: '[verse]\nla', style: 'pop, male vocal, piano' });
      expect(s.title()).toBe('Mine');
      expect(s.lyrics()).toBe('[verse]\nla');
      expect(s.style()).toBe('pop, piano, female vocal');
      s.adopt({ title: 'New', lyrics: '', style: 'rock' });
      expect(s.title()).toBe('New');
    });
  });

  describe('the song Easy asks for', () => {
    const written = { title: 'Rain song', lyrics: '[verse]\nla', style: 'piano, calm' };

    it('is the written song with the gender that was chosen on its style', () => {
      const s = store();
      s.setPrompt('a soothing piano melody');
      s.setGender('female');
      s.setStyle('');
      s.setGender('female');
      expect(s.easyRequest(written)).toEqual({ title: 'Rain song', lyrics: '[verse]\nla', style: 'piano, calm, female vocal', generator: 'heartmula', instrumental: false });
    });

    it('has no lyrics when it is instrumental, and the title of the prompt when the assistant gave none', () => {
      const s = store();
      s.setPrompt('a rock anthem with drums');
      s.setInstrumental(true);
      expect(s.easyRequest({ ...written, title: '' })).toMatchObject({ title: 'A rock anthem with', lyrics: '', instrumental: true });
    });

    it('ignores the instrumental switch for a generator that cannot make it, and adds the voice to the sentence of ACE-Step', () => {
      const s = store();
      s.setPrompt('slow song');
      s.setInstrumental(true);
      s.setGenerator('diffrhythm2');
      expect(s.easyRequest(written).instrumental).toBe(false);
      s.setGenerator('ace-step');
      s.setGender('male');
      expect(s.easyRequest({ ...written, style: 'a slow song' }).style).toBe('a slow song, male vocal');
    });

    it('moves to Custom with what the assistant wrote and a title from the prompt', () => {
      const s = store();
      s.setPrompt('a soothing piano melody');
      s.adoptFromEasy({ title: '', lyrics: '[verse]\nla', style: 'piano' });
      expect(s.mode()).toBe('custom');
      expect(s.title()).toBe('A soothing piano melody');
      expect(s.lyrics()).toBe('[verse]\nla');
      expect(s.style()).toBe('piano');
    });

    it('puts the chosen voice on the sentence of ACE-Step when adopting', () => {
      const s = store();
      s.setGenerator('ace-step');
      s.setGender('male');
      s.adopt({ title: '', lyrics: '', style: 'a slow sentence' });
      expect(s.style()).toBe('a slow sentence, male vocal');
    });
  });

  describe('what the AI lyrics dialog wrote', () => {
    it('replaces the lyrics and fills the style and the title only when they are empty', () => {
      const s = store();
      s.setLyrics('old');
      s.adoptLyrics({ title: 'Rain', lyrics: '[verse]\nla', style: 'piano, calm' });
      expect(s.lyrics()).toBe('[verse]\nla');
      expect(s.style()).toBe('piano, calm');
      expect(s.title()).toBe('Rain');
      s.adoptLyrics({ title: 'Other', lyrics: '[chorus]\nna', style: 'rock' });
      expect(s.lyrics()).toBe('[chorus]\nna');
      expect(s.style()).toBe('piano, calm');
      expect(s.title()).toBe('Rain');
    });
  });

  describe('the style captured from a file', () => {
    it('adds the recognised tags to the style and keeps the ones there', () => {
      const s = store();
      s.setStyle('blues, piano');
      s.captureStyle(['lo-fi', 'piano', 'calm'], 'Calm lo-fi with piano');
      expect(s.style()).toBe('blues, piano, lo-fi, calm');
    });

    it('gives ACE-Step the sentence when no tag was recognised and the style is empty', () => {
      const s = store();
      s.setGenerator('ace-step');
      s.captureStyle([], 'A warm tune with a nice feeling');
      expect(s.style()).toBe('A warm tune with a nice feeling');
      s.captureStyle([], 'Another sentence');
      expect(s.style()).toBe('A warm tune with a nice feeling');
    });

    it('changes nothing for a tag generator when no tag was recognised', () => {
      const s = store();
      s.setStyle('blues');
      s.captureStyle([], 'A warm tune with a nice feeling');
      expect(s.style()).toBe('blues');
    });
  });
});
