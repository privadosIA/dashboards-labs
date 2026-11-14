import { Injectable, computed, signal } from '@angular/core';

import { GENERATORS } from './generators';
import type { GeneratorName, Mode, SongRequest, VocalGender, Written } from './model';
import { titleFromPrompt } from './request';
import { insertSection, type StructureTag } from './sections';
import { applyCombo, parseTags, setVocalGender, toggleCombo, toggleTag, vocalGenderOf, type VoiceTags } from './style';
import { validateCustom, validateEasy } from './validate';

const MODE_KEY = 'music-studio.mode';
const DEFAULT_VOICE: VoiceTags = { female: 'female vocal', male: 'male vocal' };

const readMode = (): Mode => {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'easy' || saved === 'custom' ? saved : 'easy';
  } catch {
    return 'easy';
  }
};

/**
 * What the user has written in both forms, in one place so that switching between Easy and Custom loses nothing. The
 * style is the one text; the vocal gender is a view of it (a voice tag) that the store keeps in step both ways.
 */
@Injectable({ providedIn: 'root' })
export class SongDraftStore {
  readonly mode = signal<Mode>(readMode());
  readonly title = signal('');
  readonly lyrics = signal('');
  readonly style = signal('');
  readonly prompt = signal('');
  readonly instrumental = signal(false);
  readonly generator = signal<GeneratorName>('heartmula');
  readonly gender = signal<VocalGender>('random');
  private readonly voice = signal<VoiceTags>(DEFAULT_VOICE);

  readonly customProblems = computed(() => validateCustom({ title: this.title(), lyrics: this.lyrics(), style: this.style(), generator: this.generator() }));
  readonly easyProblems = computed(() => validateEasy({ prompt: this.prompt() }));
  /** The song of the Custom form. */
  readonly request = computed<SongRequest>(() => ({ title: this.title(), lyrics: this.lyrics(), style: this.style(), generator: this.generator(), instrumental: false }));
  /** There is lyrics or style that writing again would replace. */
  readonly hasWrittenText = computed(() => this.lyrics().trim() !== '' || parseTags(this.style()).length > 0);

  setMode(mode: Mode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // the choice is only not remembered
    }
  }

  setTitle(value: string): void {
    this.title.set(value);
  }

  setLyrics(value: string): void {
    this.lyrics.set(value);
  }

  setPrompt(value: string): void {
    this.prompt.set(value);
  }

  setInstrumental(value: boolean): void {
    this.instrumental.set(value);
  }

  setGenerator(value: GeneratorName): void {
    this.generator.set(value);
  }

  /** The style as typed; a voice tag in it changes the gender. */
  setStyle(value: string): void {
    this.style.set(value);
    this.gender.set(vocalGenderOf(value, this.voice()));
  }

  toggleTag(tag: string): void {
    this.setStyle(toggleTag(this.style(), tag));
  }

  /** A combination pressed: its tags go in, or out when all were there. */
  toggleCombo(tags: readonly string[]): void {
    this.setStyle(toggleCombo(this.style(), tags));
  }

  applyCombo(tags: readonly string[]): void {
    this.setStyle(applyCombo(this.style(), tags));
  }

  setGender(gender: VocalGender): void {
    this.gender.set(gender);
    this.style.set(setVocalGender(this.style(), gender, this.voice()));
  }

  /** The voice tags the server lists (when it has been asked). */
  setVoiceTags(voice: VoiceTags): void {
    this.voice.set(voice);
  }

  /** Writes `[tag]` in the lyrics where the cursor is; the position the cursor goes to. */
  insertSection(start: number, end: number, tag: StructureTag): number {
    const edit = insertSection(this.lyrics(), start, end, tag);
    this.lyrics.set(edit.text);
    return edit.cursor;
  }

  /** Takes what the assistant wrote: the title only when it gave one, and the gender that was chosen stays on the style. */
  adopt(written: Written): void {
    if (written.title.trim()) this.title.set(written.title.trim());
    this.lyrics.set(written.lyrics);
    this.style.set(this.styleOf(written.style));
  }

  /**
   * The style recognised in a song or a video: its tags join the style (the ones there stay). With no tag recognised, ACE-Step,
   * which reads a sentence, takes the sentence when the style is empty; a tag generator is left as it was.
   */
  captureStyle(tags: readonly string[], sentence: string): void {
    if (tags.length) this.applyCombo(tags);
    else if (this.generator() === 'ace-step' && parseTags(this.style()).length === 0 && sentence.trim()) this.setStyle(sentence.trim());
  }

  /** What the AI Lyrics dialog wrote: the lyrics replace the ones there; the style and the title only fill what is empty. */
  adoptLyrics(written: Written): void {
    this.lyrics.set(written.lyrics);
    if (parseTags(this.style()).length === 0 && written.style.trim()) this.setStyle(this.styleOf(written.style));
    if (!this.title().trim() && written.title.trim()) this.title.set(written.title.trim());
  }

  /** What Easy hands to Custom: everything the assistant wrote, with a title from the prompt when it gave none, and the mode changes. */
  adoptFromEasy(written: Written): void {
    this.adopt({ ...written, title: written.title.trim() || titleFromPrompt(this.prompt()) });
    this.setMode('custom');
  }

  /** The song of the Easy form once the assistant has written: its lyrics and style, the gender chosen, no lyrics when instrumental. */
  easyRequest(written: Written): SongRequest {
    const generator = this.generator();
    const instrumental = this.instrumental() && GENERATORS[generator].instrumental;
    return {
      title: written.title.trim() || titleFromPrompt(this.prompt()),
      lyrics: instrumental ? '' : written.lyrics,
      style: this.styleOf(written.style),
      generator,
      instrumental,
    };
  }

  /** The style with the chosen voice tag (ACE-Step reads it as part of its sentence). */
  private styleOf(style: string): string {
    return setVocalGender(style, this.gender(), this.voice());
  }
}
