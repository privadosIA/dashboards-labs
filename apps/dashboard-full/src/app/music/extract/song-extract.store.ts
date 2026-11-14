import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { ApiErrorBody, MeasureResult, MusicGeneratorName, RecognizeMethod, SourceInfo, TranscribeResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AssistModelStore } from '../../editor/assist-model/assist-model.store';
import { RoutingStore } from '../../core/routing.store';
import { MusicStore } from '../music.store';

/** What is being done now; the dialog says it. */
export type ExtractStep = 'separating' | 'measuring' | 'listening' | 'reading' | 'describing' | 'writing';

export interface ExtractOptions {
  /** A source of the project: an audio, or a video that is kept as a video. */
  source: SourceInfo;
  /** Take the voice out of the song first and read the lyrics from it (ACE-Step projects, audio sources). */
  separateVoice: boolean;
  /** Describe what the picture of a video shows. */
  describePicture: boolean;
  /** What the user knows about the song. */
  hint: string;
  /** How the sound is recognised besides the lyrics: Whisper alone, or also LAION-CLAP or MuQ-MuLan. */
  method: RecognizeMethod;
  /** The language of the lyrics; empty lets Whisper detect it. */
  language: string;
  generator: MusicGeneratorName;
  /** The assistant can run: without it the proposal is the transcription as it is. */
  assistantAvailable: boolean;
  /** Switch the project to the Maximum level before separating (its model is a turbo one, which cannot). */
  switchToMaximum: boolean;
}

/** What reading a song gave. It is a PROPOSAL: nothing reaches the track until the user applies it. */
export interface ExtractProposal {
  source: string;
  language: string;
  languageDetected: boolean;
  lyrics: string;
  caption: string;
  tags: string;
  bpm: number | null;
  bpmAlternatives: number[];
  bpmConfidence: number;
  keyscale: string | null;
  keyConfidence: number;
  /** What the picture of the video shows; empty when it was not asked or could not be read. */
  picture: string;
  /** The tags LAION-CLAP gave to the sound (genre, mood, instruments); empty with another method. */
  heard: string[];
  /** The source has no words. */
  noWords: boolean;
  /** The assistant changed the words and the transcription was kept as it was. */
  wordsKept: boolean;
  /** The assistant could not run, so the style and the tags are empty. */
  withoutAssistant: boolean;
  /** Things that did not work and did not stop the rest. */
  notes: string[];
}

const CANCELLED = Symbol('cancelled');

/**
 * Reads a song for a track: separates the voice if asked, measures its tempo
 * and key, reads its lyrics with Whisper, describes the picture of a video if
 * asked and lets the assistant order the lyrics into sections and propose a
 * style. One reading at a time. A failure of the lyrics or of the separation
 * stops it; a failure of the measure, the picture or the assistant is a note
 * and the rest is kept.
 */
/** One per dialog: it needs the MusicStore of the page, which the root injector does not have. */
@Injectable()
export class SongExtractStore {
  private readonly api = inject(ApiService);
  private readonly music = inject(MusicStore);
  private readonly model = inject(AssistModelStore);
  private readonly routing = inject(RoutingStore);

  readonly busy = signal(false);
  readonly step = signal<ExtractStep | null>(null);
  readonly elapsed = signal(0);
  readonly proposal = signal<ExtractProposal | null>(null);
  readonly failure = signal<string | null>(null);

  private current?: Subscription;
  /** Rejects the request being waited for, so cancelling does not leave the reading hanging. */
  private abort?: (reason: unknown) => void;
  private cancelled = false;
  private timer?: ReturnType<typeof setInterval>;

  async run(o: ExtractOptions): Promise<void> {
    if (this.busy()) return;
    this.proposal.set(null);
    this.failure.set(null);
    this.cancelled = false;
    this.busy.set(true);
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
    try {
      this.proposal.set(await this.read(o));
    } catch (err) {
      if (err !== CANCELLED) this.failure.set(messageOf(err));
    } finally {
      clearInterval(this.timer);
      this.timer = undefined;
      this.busy.set(false);
      this.step.set(null);
    }
  }

  /** Stops the reading: the request in flight is aborted and neither a proposal nor an error is shown. */
  cancel(): void {
    this.cancelled = true;
    this.current?.unsubscribe();
    this.abort?.(CANCELLED);
    if (this.step() === 'separating') void this.music.cancel();
  }

  discard(): void {
    this.proposal.set(null);
  }

  dismissFailure(): void {
    this.failure.set(null);
  }

  reset(): void {
    this.cancel();
    this.proposal.set(null);
    this.failure.set(null);
  }

  private async read(o: ExtractOptions): Promise<ExtractProposal> {
    const project = this.music.projectId();
    const notes: string[] = [];
    let voice = o.source.name;

    if (o.separateVoice) {
      this.step.set('separating');
      voice = await this.separate(o);
    }

    this.step.set('measuring');
    let measure: MeasureResult | null = null;
    try {
      measure = await this.call(this.api.measureSource(project, o.source.name));
    } catch (err) {
      if (err === CANCELLED) throw err;
      notes.push($localize`:@@extract.noteMeasure:The tempo and the key could not be measured: ${messageOf(err)}:error:`);
    }

    // What the sound is like, when LAION-CLAP or MuQ-MuLan was chosen: it is a hint for the assistant, and a failure of it is a note.
    let heardTags: string[] = [];
    if (o.method === 'clap' || o.method === 'muq') {
      this.step.set('listening');
      const engine = o.method === 'muq' ? 'MuQ-MuLan' : 'LAION-CLAP';
      try {
        heardTags = (await this.call(this.api.recognizeSource(project, o.source.name, o.method))).tags;
      } catch (err) {
        if (err === CANCELLED) throw err;
        notes.push($localize`:@@extract.noteClap:The sound could not be heard with ${engine}:engine:: ${messageOf(err)}:error:`);
      }
    }

    this.step.set('reading');
    const heard: TranscribeResult = await this.call(this.api.transcribeSource(project, voice, o.language || undefined));

    let picture = '';
    if (o.describePicture && o.source.kind === 'video') {
      this.step.set('describing');
      try {
        picture = (await this.call(this.api.describe(project, o.source.name))).prompt;
      } catch (err) {
        if (err === CANCELLED) throw err;
        notes.push($localize`:@@extract.notePicture:The picture could not be described: ${messageOf(err)}:error:`);
        await this.music.loadSources(); // a refused picture may have been deleted by the server
      }
    }

    const noWords = heard.text.trim() === '';
    const base: ExtractProposal = {
      source: o.source.name,
      language: heard.language,
      languageDetected: heard.language_detected,
      lyrics: heard.text,
      caption: '',
      tags: '',
      bpm: measure?.bpm ?? null,
      bpmAlternatives: measure?.bpm_alternatives ?? [],
      bpmConfidence: measure?.bpm_confidence ?? 0,
      keyscale: measure?.keyscale ?? null,
      keyConfidence: measure?.key_confidence ?? 0,
      picture,
      heard: heardTags,
      noWords,
      wordsKept: false,
      withoutAssistant: true,
      notes,
    };
    if (!o.assistantAvailable) return base;

    this.step.set('writing');
    try {
      const draft = await this.call(
        this.api.assistSong({
          text: heard.text,
          generator: o.generator,
          ...(heard.language ? { language: heard.language } : {}),
          ...(hintOf(o.hint, heardTags) ? { hint: hintOf(o.hint, heardTags) } : {}),
          ...(measure?.bpm ? { bpm: measure.bpm } : {}),
          ...(measure?.keyscale ? { keyscale: measure.keyscale } : {}),
          ...(picture ? { picture } : {}),
          ...(this.routing.external('assistant') ? {} : this.model.selected() ? { model: this.model.selected() } : {}),
        }),
      );
      return { ...base, lyrics: noWords ? '' : draft.lyrics, caption: draft.caption, tags: draft.tags ?? '', wordsKept: !noWords && draft.unchanged_words === false, withoutAssistant: false };
    } catch (err) {
      if (err === CANCELLED) throw err;
      notes.push($localize`:@@extract.noteAssist:The assistant could not propose the style: ${messageOf(err)}:error:`);
      return base;
    }
  }

  /** Takes the voice out of the song with the extraction that already exists and returns the source holding it. */
  private async separate(o: ExtractOptions): Promise<string> {
    if (this.music.separationModels().length === 0) {
      throw new Error($localize`:@@extract.noModel:Separating the voice needs a synthesis model that is not the turbo one, and none is installed (they are in the Models catalog).`);
    }
    if (o.switchToMaximum && this.music.synthIsTurbo()) this.music.useMaximumLevel();
    const ids = await this.music.separateSong(o.source, ['vocals']);
    if (ids.length === 0) throw new Error($localize`:@@extract.sepNone:The track that separates the voice could not be added.`);
    await this.music.createTracks(ids);
    if (this.cancelled) throw CANCELLED;
    const made = this.music.resultsOf(ids[0])[0];
    if (!made) throw new Error($localize`:@@extract.sepFailed:The voice separation did not finish. The track stays added and not created, as in “Separate into instruments”.`);
    const name = await this.music.adoptExport(made);
    if (!name) throw new Error(this.music.sourceError() ?? $localize`:@@extract.sepCopy:The separated voice could not be used as a source.`);
    return name;
  }

  /** Waits for a request; cancelling aborts it. */
  private call<T>(obs: Observable<T>): Promise<T> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    return new Promise<T>((resolve, reject) => {
      let value: T;
      let got = false;
      this.abort = reject;
      this.current = obs.subscribe({
        next: (v) => {
          value = v;
          got = true;
        },
        error: (e: unknown) => reject(e),
        complete: () => (got ? resolve(value) : reject(CANCELLED)),
      });
    });
  }
}

/** The server's explanation of a failed request, or the error's own text. */
function messageOf(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/** The assistant takes at most this many characters of hint. */
const HINT_LIMIT = 500;

/** What the user knows about the song plus what the sound was heard to be, as one text for the assistant. */
function hintOf(hint: string, heard: string[]): string {
  const sound = heard.length > 0 ? `Sound analysis (closest tags, a hint, not certain): ${heard.join(', ')}.` : '';
  const own = hint.trim().slice(0, Math.max(0, HINT_LIMIT - sound.length - 1));
  return [own, sound].filter(Boolean).join(' ');
}
