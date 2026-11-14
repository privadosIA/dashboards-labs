import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { describeError } from '../core/api-error.interceptor';
import { ApiErrorBody, AssetEntry, EstimateSource, ListenResult, RecognizeMethod, Recognizer, CatalogEntry, MusicGeneratorName, MusicTagCategory, MusicTagCombo, Run, RequestKind, RequestPlan } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { AvailabilityStore } from '../core/availability.store';
import { EnginesStore } from '../core/engines.store';
import { ConnectionService } from '@lab/server-connection';
import { activeLang } from '../core/language';
import { RunStream, RunStreamService } from '../core/run-stream.service';
import type { EditEngine, Style } from '../editor/quality-tiers';
import { editEngineLabel, editEngineOf } from '../editor/quality-tiers';
import { AutoMachine, VideoChoiceId, availableStyles, editEntriesFor, editEntryFor, machineOf, videoChoiceLabel, videoOptionsFor } from '../editor/auto-plan';
import { toYaml } from '../shared/project-yaml';
import { synthesisModels } from '../music/music-options';
import { toMusicYaml } from '../music/music-yaml';
import { buildStrip } from '../runs/phase-strip/strip-model';
import {
  REQUEST_PREFIX,
  RequestDraft,
  defaultLevel,
  draftFromPlan,
  draftFromText,
  estimateFor,
  musicConfig,
  previewStarter,
  projectIdFor,
  sourceNameFor,
  titleFromProjectId,
  videoRequestPlan,
} from './request-config';
import { planMusicAuto } from '../music/music-auto-plan';
import { GENERATORS, GENERATOR_LABELS, GeneratorChoice, resolveGenerator, usableGenerators } from './music-generator';

/** Only ACE-Step has quality levels to plan. */
const generatorHasLevels = (g: GeneratorChoice): boolean => resolveGenerator(g, []) === 'ace-step';

/** The engines a video can be made with and what each takes, for the card; `auto` is what "Automatic" would do. */
export interface EngineView {
  options: { id: VideoChoiceId; label: string; seconds: number }[];
  auto: { label: string; seconds: number; speechPick: boolean; noSpeechEngine: boolean } | null;
}

/** Where a request is: each phase is one thing the card shows. */
export type RequestPhase = 'planning' | 'review' | 'preparing' | 'queued' | 'running' | 'done' | 'failed';

/** A file the user attached on the phone. */
export interface Attachment {
  file: File;
  kind: 'image' | 'video' | 'audio';
}

/** The kind of attachment a file is, by its type or its extension; null for anything the page does not take. */
export function attachmentKind(file: { name: string; type: string }): Attachment['kind'] | null {
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/i.test(file.name)) return 'video';
  if (file.type.startsWith('audio/') || /\.(mp3|wav)$/i.test(file.name)) return 'audio';
  return null;
}

/** Bigger files stay as the browser gives them: holding a long video in memory would cost more than it protects. */
const HOLD_MAX_BYTES = 64 << 20;

/**
 * The bytes of a picked file, read at once. A phone hands over a reference to a temporary file that can be gone by the
 * time the upload starts (the picker is cleared, the picture is measured, the project is created), and then it reads
 * as 0 bytes. Null when the file is empty or cannot be read.
 */
export async function holdFile(file: File): Promise<File | null> {
  if (file.size === 0) return null;
  if (file.size > HOLD_MAX_BYTES) return file;
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return null;
  }
}

/** What a finished request shows. */
export interface RequestResult {
  kind: RequestKind;
  /** The url to play or show (video, image, audio) and the cover of a song, when it has one. */
  url: string;
  cover?: string;
}

/** One request of the page: the words, what was understood, and how far it got. All state is in signals. */
export class RequestItem {
  readonly phase = signal<RequestPhase>('planning');
  readonly plan = signal<RequestPlan | null>(null);
  /** What the card edits; set once the request has been understood (or could not be). */
  readonly draft = signal<RequestDraft | null>(null);
  /** The assistant did not interpret the request (it waited for a run, or is not available): the card was filled without it. */
  readonly manual = signal<'' | 'busy' | 'unavailable' | 'refused'>('');
  readonly warnings = signal<string[]>([]);
  readonly error = signal('');
  readonly uploading = signal<number | null>(null);
  readonly project = signal('');
  readonly run = signal<Run | null>(null);
  readonly queuePosition = signal<number | undefined>(undefined);
  readonly stream = signal<RunStream | null>(null);
  /** The quality the machine can give and the time that takes, shown before and after confirming. */
  readonly chosen = signal<{ lines: string[]; seconds: number; source?: EstimateSource; executions?: number } | null>(null);
  readonly result = signal<RequestResult | null>(null);
  /** The engines of a video card with their times; null until known, or when the request is not a video. */
  readonly engines = signal<EngineView | null>(null);
  /** The looks the machine has a model for, for the picture and video cards (the toggle is shown with two or more). */
  readonly styles = signal<Style[]>([]);
  /** An editing model is installed and fits this machine, so a picture can be edited by instruction. */
  readonly canEdit = signal(false);
  /** The card already started as a retouch because of its picture (so the user's change back to another look stays). */
  retouchOffered = false;
  /** The engines of Retoque installed that fit this machine (the choice is offered with two). */
  readonly editEngines = signal<EditEngine[]>([]);
  /** The generators a song card can use now, ACE-Step first; empty until known or when the request is not a song. */
  readonly generators = signal<MusicGeneratorName[]>([]);
  /** A new suggestion is being asked for. */
  readonly suggesting = signal(false);
  /** A change of generator (or a new suggestion) waits for the user to accept losing what they edited. */
  readonly pendingGenerator = signal<GeneratorChoice | null>(null);
  /** Why the last suggestion could not be asked, or what is missing in it; empty when there is nothing to say. */
  readonly suggestNote = signal('');
  /** The generator the card will use: the pick, or what "Automatic" takes. */
  readonly generator = computed(() => resolveGenerator(this.draft()?.generator ?? 'auto', this.generators()));
  /** Stops following the run (its timer and the listeners of the screen coming back); called when the request ends or is dismissed. */
  stopWatching: (() => void) | undefined;

  constructor(
    readonly key: string,
    readonly text: string,
    readonly attachments: Attachment[],
    readonly language: string,
  ) {}

  readonly kindSource = computed(() => this.plan()?.kind_source ?? null);

  /** How far a running request is, 0 to 1, from the phases its stream has told, and the phase it is in. */
  readonly progress = computed(() => {
    const model = buildStrip(this.stream()?.events() ?? []);
    const rows = [...model.rows, ...(model.globalRow ? [model.globalRow] : [])];
    const cells = rows.flatMap((r) => r.cells);
    if (cells.length === 0) return { ratio: 0, phase: '' };
    const done = cells.filter((c) => c.state === 'done' || c.state === 'cache' || c.state === 'na').length;
    const running = cells.find((c) => c.state === 'running');
    return { ratio: done / cells.length, phase: running?.phase ?? '' };
  });
}

const LIMIT = 10;

const KEEP = 'Keep everything else exactly the same.';

/** The fixed retouches a code word launches on the picture attached (one precise retouch each). */
export const CODES = {
  platinum: { words: 'codigo platino|code platinum', instruction: `Put a long platinum blonde wig on the person in the picture. ${KEEP}` },
  bright: { words: 'codigo luminoso|code bright|code luminous', instruction: `Make the person in the picture completely bald, with a shiny, glowing scalp, and remove their eyebrows. ${KEEP}` },
  red: { words: 'codigo rojo|code red', instruction: `Turn the person in the picture into a clown: a colourful clown wig and full clown makeup with a red nose. ${KEEP}` },
  military: { words: 'codigo militar|code military', instruction: `Paint camouflage makeup on the face of the person in the picture. ${KEEP}` },
} as const;

export type CodeName = keyof typeof CODES;

/** The codes «código total» launches, in order. */
export const TOTAL_ORDER: CodeName[] = ['platinum', 'bright', 'red', 'military'];

const plain = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const codeRegex = (words: string): RegExp => new RegExp(`^[¡!\\s]*(${words})[.!\\s]*$`);

/** Which code the words are (any case, with or without the accent or the marks around it), or 'total' for all of them. */
export function codeOf(text: string): CodeName | 'total' | null {
  const t = plain(text);
  if (codeRegex('codigo total|code total|code all').test(t)) return 'total';
  return TOTAL_ORDER.find((c) => codeRegex(CODES[c].words).test(t)) ?? null;
}

const codeTitle = (code: CodeName): string => {
  switch (code) {
    case 'platinum': return $localize`:@@create.codePlatinumTitle:Platinum code`;
    case 'bright': return $localize`:@@create.codeBrightTitle:Bright code`;
    case 'red': return $localize`:@@create.codeRedTitle:Red code`;
    case 'military': return $localize`:@@create.codeMilitaryTitle:Military code`;
  }
};

/** The requests made in this browser tab, so that opening the page later does not show other people's (or earlier) ones. */
const SESSION_KEY = 'mo.create.session';

function sessionProjects(): string[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return []; // no storage: nothing is remembered
  }
}

function forgetProjects(ids: readonly string[]): void {
  try {
    const gone = new Set(ids);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionProjects().filter((p) => !gone.has(p))));
  } catch {
    // not stored: nothing to forget
  }
}

function rememberProject(id: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...new Set([...sessionProjects(), id])]));
  } catch {
    // not stored: the request still works, it is just not shown again after a reload
  }
}

/**
 * The life of a request made on the phone: understand it (the assistant, or the user's words when the
 * assistant cannot), confirm it, create the project with the best settings the machine allows, upload the
 * attachments, launch the run, follow it and find the result. The page only draws what this holds.
 */
@Injectable({ providedIn: 'root' })
export class CreateFlowService {
  private readonly api = inject(ApiService);
  private readonly streams = inject(RunStreamService);
  private readonly conn = inject(ConnectionService);
  private readonly availability = inject(AvailabilityStore);
  private readonly engines = inject(EnginesStore);

  /** The vocabulary of HeartMuLa's tags, read once for the chips; empty until it arrives (or when the server has none). */
  readonly tagVocabulary = signal<MusicTagCategory[]>([]);
  /** The popular combinations of tags the song card offers. */
  readonly tagCombos = signal<MusicTagCombo[]>([]);
  private tagsAsked = false;

  async loadTagVocabulary(): Promise<void> {
    if (this.tagsAsked) return;
    this.tagsAsked = true;
    try {
      const res = await firstValueFrom(this.api.getMusicTags());
      this.tagVocabulary.set(res.categories);
      this.tagCombos.set(res.combos ?? []);
    } catch {
      this.tagsAsked = false; // asked again the next time a song card needs it
    }
  }

  /** Newest first. */
  readonly items = signal<RequestItem[]>([]);
  private counter = 0;

  private machineCache: Promise<{ catalog: CatalogEntry[]; machine: AutoMachine; edition: string; music: AssetEntry[] }> | undefined;

  /** The catalog, the machine and the edition of the program, read once (and again after a failure). */
  private machineAndCatalog(): Promise<{ catalog: CatalogEntry[]; machine: AutoMachine; edition: string; music: AssetEntry[] }> {
    this.machineCache ??= Promise.all([firstValueFrom(this.api.getCatalog()), firstValueFrom(this.api.getEnvironment())])
      .then(([catalog, env]) => ({ catalog: catalog.entries, machine: machineOf(env.gpus, env.ram), edition: env.edition ?? 'public', music: env.music ?? [] }))
      .catch((err) => {
        this.machineCache = undefined;
        throw err;
      });
    return this.machineCache;
  }

  /** Works out the engines a video card offers, each with its time, and what "Automatic" would take. Silent on failure: the card then offers none. */
  async refreshEngines(item: RequestItem): Promise<void> {
    const d = item.draft();
    if (!d || d.kind === 'music') {
      item.engines.set(null);
      item.styles.set([]);
      return;
    }
    try {
      const { catalog, machine } = await this.machineAndCatalog();
      item.styles.set(availableStyles(catalog, machine));
      const canEdit = !!editEntryFor(catalog, machine);
      item.canEdit.set(canEdit);
      item.editEngines.set(editEntriesFor(catalog, machine).map(editEngineOf));
      // Without an editing model a picture can only start a generation.
      // (read the draft again: the user may have changed the card while the catalog was loading)
      const now = item.draft();
      if (!canEdit && now?.style === 'edit') item.draft.set({ ...now, style: 'auto' });
      // A picture attached to a picture request is most often there to be retouched: that is what it starts as (once; the user can change it).
      if (canEdit && !item.retouchOffered && now?.kind === 'image' && now.style === 'auto' && item.attachments.some((a) => a.kind === 'image')) {
        item.retouchOffered = true;
        item.draft.set({ ...now, style: 'edit' });
      }
      if (d.kind !== 'video') {
        item.engines.set(null);
        return;
      }
      const starter = previewStarter();
      const seconds = (engine: RequestDraft['engine']) => {
        const p = videoRequestPlan(starter, { ...d, engine }, catalog, machine);
        return p ? { plan: p, seconds: estimateFor(p.config, catalog, machine) } : null;
      };
      const auto = seconds('auto');
      const options = videoOptionsFor({ ...starter, scenes: auto?.plan.config.scenes ?? [] }, catalog, machine)
        .map((o) => ({ id: o.id, label: videoChoiceLabel(o.video), seconds: seconds(o.id)?.seconds ?? o.seconds }));
      item.engines.set({
        options,
        auto: auto?.plan.video
          ? { label: videoChoiceLabel(auto.plan.video), seconds: auto.seconds, speechPick: auto.plan.speechPick, noSpeechEngine: auto.plan.noSpeechEngine }
          : null,
      });
    } catch {
      item.engines.set(null);
    }
  }

  /** Whether this is the public edition (also when it cannot be known): it does not work around a refusal of the model. */
  private async publicEdition(): Promise<boolean> {
    try {
      return (await this.machineAndCatalog()).edition !== 'private';
    } catch {
      return true;
    }
  }

  /** A text the assistant could not write is the user's own words in the private edition; the public one leaves it empty. */
  private async fillWithUserWords(item: RequestItem): Promise<void> {
    if (await this.publicEdition()) return;
    const d = item.draft();
    if (d) item.draft.set(withUserWords(d, item.text));
  }

  /** Reads the size of the first picture attached, so an edit keeps its shape. Silent when the browser cannot. */
  private async measurePicture(item: RequestItem): Promise<void> {
    const file = item.attachments.find((a) => a.kind === 'image')?.file;
    if (!file || typeof createImageBitmap !== 'function') return;
    try {
      const bmp = await createImageBitmap(file);
      const d = item.draft();
      if (d) item.draft.set({ ...d, pictureSize: { width: bmp.width, height: bmp.height } });
      bmp.close();
    } catch {
      // not a picture the browser reads: the edit uses the model's own size
    }
  }

  /** Listens to a recording of a song that is playing and, when its style can be told, starts a request for a new original song of that kind. */
  async listen(recording: Blob, language: string, method: RecognizeMethod = 'whisper'): Promise<{ heard: ListenResult; item: RequestItem | null }> {
    const heard = await firstValueFrom(this.api.listenSong(recording, language, method));
    if (!heard.request) return { heard, item: null };
    return { heard, item: await this.submit(heard.request, [], 'music') };
  }

  /** The methods to recognise a song and whether each can be used now. */
  async recognizers(): Promise<Recognizer[]> {
    return (await firstValueFrom(this.api.recognizers())).recognizers ?? [];
  }

  /** Asks the server to read a recording. The text goes to the field; nothing is generated yet. */
  async transcribe(recording: Blob, language: string): Promise<string> {
    const res = await firstValueFrom(this.api.transcribe(recording, language));
    return res.text.trim();
  }

  /** The generators a song can be made with on this machine; ACE-Step when nothing can be read, since it is what always worked. */
  private async usableFor(audioAttached: boolean): Promise<MusicGeneratorName[]> {
    try {
      if (this.engines.data() === null) await this.engines.refresh();
      const { music } = await this.machineAndCatalog();
      return usableGenerators({ ace: synthesisModels(music).length > 0, heartmula: this.engines.heartmulaAvailable(), diffrhythm2: this.engines.diffrhythm2Available() }, audioAttached);
    } catch {
      return audioAttached ? ['ace-step'] : [];
    }
  }

  /** Reads which generators a song card offers. Silent on failure: the card then offers none and the song is made by ACE-Step. */
  async refreshGenerators(item: RequestItem): Promise<void> {
    const d = item.draft();
    if (!d || d.kind !== 'music') {
      item.generators.set([]);
      return;
    }
    const usable = await this.usableFor(item.attachments.some((a) => a.kind === 'audio'));
    item.generators.set(usable);
    void this.loadTagVocabulary();
    const now = item.draft();
    // A generator picked before the list was known that cannot be used here goes back to Automatic.
    if (now && now.generator !== 'auto' && usable.length > 0 && !usable.includes(now.generator)) item.draft.set({ ...now, generator: 'auto' });
  }

  /** Changes the generator of a song card: asks first when the user edited the suggestion, then asks the assistant again for that generator. */
  async chooseGenerator(item: RequestItem, choice: GeneratorChoice): Promise<void> {
    const d = item.draft();
    if (!d || item.suggesting()) return;
    if (choice === d.generator) return;
    if (d.suggestionEdited && !item.manual()) {
      item.pendingGenerator.set(choice);
      return;
    }
    await this.askSuggestion(item, choice);
  }

  /** "Regenerar sugerencia": a new suggestion for the generator in use, asking first when the user edited the old one. */
  async regenerate(item: RequestItem): Promise<void> {
    const d = item.draft();
    if (!d || item.suggesting()) return;
    if (d.suggestionEdited) {
      item.pendingGenerator.set(d.generator);
      return;
    }
    await this.askSuggestion(item, d.generator);
  }

  /** The user accepted losing what they edited. */
  async acceptPending(item: RequestItem): Promise<void> {
    const choice = item.pendingGenerator();
    item.pendingGenerator.set(null);
    if (choice !== null) await this.askSuggestion(item, choice);
  }

  cancelPending(item: RequestItem): void {
    item.pendingGenerator.set(null);
  }

  /**
   * Asks the assistant for the style (or tags) and the lyrics for a generator, from the user's own words;
   * the title, the length and the voice stay. It fails softly: the old suggestion and generator stay and the card says why.
   */
  private async askSuggestion(item: RequestItem, choice: GeneratorChoice): Promise<void> {
    const before = item.draft();
    if (!before) return;
    const generator = resolveGenerator(choice, item.generators());
    const info = GENERATORS[generator];
    const instrumental = info.instrumental ? before.instrumental : false;
    item.draft.set({ ...before, generator: choice, instrumental });
    item.suggestNote.set('');
    if (item.manual() || !this.availability.available('assistant')) return; // no assistant: only the generator changes
    item.suggesting.set(true);
    try {
      const plan = await firstValueFrom(
        this.api.planRequest({
          text: item.text,
          language: item.language,
          kind: 'music',
          instrumental,
          seconds: before.seconds,
          ...(generator !== 'ace-step' ? { generator } : {}),
          attachments: { audio: item.attachments.some((a) => a.kind === 'audio') || undefined },
        }),
      );
      const now = item.draft() ?? before;
      item.draft.set({ ...now, caption: plan.caption ?? '', lyrics: plan.lyrics ?? '', tags: plan.tags ?? '', suggestionEdited: false });
      item.warnings.set(plan.warnings ?? []);
    } catch (err) {
      item.draft.set({ ...(item.draft() ?? before), generator: before.generator, instrumental: before.instrumental });
      item.suggestNote.set(
        err instanceof HttpErrorResponse && err.status === 409
          ? $localize`:@@create.suggestBusy:A run is in progress: I can't write another suggestion now. The previous one stays.`
          : $localize`:@@create.suggestFailed:I couldn't write another suggestion: ${errorText(err, this.conn)}:reason:. The previous one stays.`,
      );
    } finally {
      item.suggesting.set(false);
    }
  }

  /** Fills the card with the retouch of a code and launches it: no card to review, the instruction is not shown. */
  private launchCode(item: RequestItem, code: CodeName): RequestItem {
    item.draft.set({ ...draftFromText(item.text, 'image', codeTitle(code)), imagePrompt: CODES[code].instruction, style: 'edit', editEngine: 'precise' });
    void this.measurePicture(item).then(() => this.confirm(item));
    return item;
  }

  /** Starts a request: the assistant reads it; when it cannot, the card is filled with the user's words. */
  async submit(text: string, files: Attachment[], kind?: RequestKind): Promise<RequestItem> {
    const item = new RequestItem(`r${++this.counter}`, text.trim(), files, activeLang());
    this.items.update((l) => [item, ...l]);
    const att = {
      image: files.some((f) => f.kind === 'image') || undefined,
      video: files.some((f) => f.kind === 'video') || undefined,
      audio: files.some((f) => f.kind === 'audio') || undefined,
    };
    // «Código platino/luminoso/rojo/militar»: the picture attached is retouched with the precise engine by a fixed instruction, launched at once. No assistant call.
    // «Código total» does all of them on the same picture, one card each.
    const code = codeOf(item.text);
    if (code) {
      if (!att.image) {
        fail(item, $localize`:@@create.codeNoPicture:Codes need a photo: attach one and say it again.`);
        return item;
      }
      if (code === 'total') {
        this.items.update((l) => l.filter((i) => i !== item));
        const made = TOTAL_ORDER.map((c) => this.launchCode(new RequestItem(`r${++this.counter}`, item.text, files, item.language), c));
        this.items.update((l) => [...made, ...l]);
        return made[0];
      }
      this.launchCode(item, code);
      return item;
    }
    const fallbackKind: RequestKind = kind ?? (att.audio ? 'music' : 'video');
    const manual = (why: 'busy' | 'unavailable' | 'refused') => {
      item.manual.set(why);
      item.draft.set(draftFromText(item.text, fallbackKind, titleOf(item.text)));
      item.phase.set('review');
      void this.measurePicture(item);
      void this.refreshEngines(item);
      void this.refreshGenerators(item);
    };
    if (!this.availability.available('assistant')) {
      manual('unavailable');
      return item;
    }
    try {
      // A song is written for the generator that will make it: the usable ones are read before asking.
      let generator: MusicGeneratorName | undefined;
      if (!kind || kind === 'music') {
        const usable = await this.usableFor(!!att.audio);
        item.generators.set(usable);
        generator = resolveGenerator('auto', usable);
      }
      const plan = await firstValueFrom(
        this.api.planRequest({ text: item.text, language: item.language, ...(kind ? { kind } : {}), ...(generator && generator !== 'ace-step' ? { generator } : {}), attachments: att }),
      );
      item.plan.set(plan);
      item.warnings.set(plan.warnings ?? []);
      const draft = draftFromPlan(plan);
      item.draft.set(draft);
      item.phase.set('review');
      if (withUserWords(draft, item.text) !== draft) void this.fillWithUserWords(item);
      void this.measurePicture(item);
      void this.refreshEngines(item);
      void this.refreshGenerators(item);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) manual('busy');
      else if (err instanceof HttpErrorResponse && err.status === 422 && (err.error as ApiErrorBody | undefined)?.error?.code === 'assist_refused') {
        // The private edition goes on with the user's words; the public one reports the refusal.
        if (await this.publicEdition()) fail(item, errorText(err, this.conn));
        else manual('refused');
      }
      else if (err instanceof HttpErrorResponse && (err.status === 503 || err.status === 0)) manual('unavailable');
      else fail(item, errorText(err, this.conn));
    }
    return item;
  }

  /** Changes the kind of a card without asking the model again; the texts it does not use are kept. */
  setKind(item: RequestItem, kind: RequestKind): void {
    const d = item.draft();
    if (!d) return;
    // A request with the user's words only: the words fill the prompt of the new kind.
    const wasEmpty = (k: RequestKind) => (k === 'music' ? !d.caption : !d.imagePrompt);
    const next: RequestDraft = { ...d, kind, resolution: defaultLevel(kind), animation: 'image', ...(kind !== 'image' && d.style === 'edit' ? { style: 'auto' as const } : {}) };
    if (wasEmpty(kind) && item.manual()) {
      if (kind === 'music') next.caption = item.text;
      else next.imagePrompt = item.text;
    }
    item.draft.set(next);
    void this.refreshEngines(item);
    if (kind === 'music') {
      void this.refreshGenerators(item).then(() => {
        // A request understood as a video has no song written yet: the assistant writes it for the generator in use.
        const now = item.draft();
        if (now && !now.caption && !now.lyrics && !item.manual()) void this.askSuggestion(item, now.generator);
      });
    }
  }

  /** Creates the project, uploads the attachments, saves the best configuration and launches the run. */
  async confirm(item: RequestItem): Promise<void> {
    const d = item.draft();
    if (!d || item.phase() === 'preparing') return;
    item.error.set('');
    item.phase.set('preparing');
    try {
      const id = await this.createProject(d.title);
      item.project.set(id);
      rememberProject(id);
      const names = await this.upload(item, id, d);
      const draft: RequestDraft = { ...d, ...names, ...(d.kind === 'music' ? { generator: item.generator() } : {}) };
      const { yaml, lines, seconds } = await this.configure(id, draft);
      await firstValueFrom(this.api.saveConfig(id, yaml));
      item.chosen.set({ lines, ...(await this.estimateOf(id, yaml, d.kind, seconds)) });
      const launched = await firstValueFrom(this.api.launchRun(id, {}, true));
      this.follow(item, launched.run, launched.queue_position);
    } catch (err) {
      item.phase.set('review');
      item.error.set(errorText(err, this.conn));
    }
  }

  /** The same request again with another seed: a new project, so the first result stays. */
  async again(item: RequestItem): Promise<void> {
    const d = item.draft();
    if (!d) return;
    const copy = new RequestItem(`r${++this.counter}`, item.text, item.attachments, item.language);
    copy.plan.set(item.plan());
    copy.manual.set(item.manual());
    copy.draft.set({ ...d });
    this.items.update((l) => [copy, ...l]);
    await this.confirm(copy);
  }

  /** Retries a request that failed to start or to finish, from the card. */
  retry(item: RequestItem): Promise<void> {
    item.stopWatching?.();
    item.stream()?.close();
    item.result.set(null);
    item.run.set(null);
    return this.confirm(item);
  }

  /**
   * Takes a request off the list. One that already has a project loses it with everything it made (the server
   * deletes the folder and the run history); the card stays, with the reason, when the server refuses.
   */
  async dismiss(item: RequestItem): Promise<void> {
    const id = item.project();
    if (id) {
      try {
        await firstValueFrom(this.api.deleteProject(id));
      } catch (err) {
        if (!(err instanceof HttpErrorResponse && err.status === 404)) {
          item.error.set(errorText(err, this.conn));
          return;
        }
      }
    }
    item.stopWatching?.();
    item.stream()?.close();
    this.items.update((l) => l.filter((i) => i !== item));
  }

  /** The projects this tab made (the ones in the list and the ones remembered for the session), without repeats. */
  sessionProjectIds(): string[] {
    return [...new Set([...sessionProjects(), ...this.items().map((i) => i.project()).filter((p) => p !== '')])];
  }

  /**
   * «Limpiar pantalla»: empties the list and forgets the session, nothing more. The projects, their files and the runs
   * stay on the server (a run in progress goes on and its result is in the gallery); only this tab stops following them.
   */
  clearScreen(): void {
    for (const item of this.items()) {
      item.stopWatching?.();
      item.stream()?.close();
    }
    forgetProjects(this.sessionProjectIds());
    this.items.set([]);
  }

  /** The project id, with a number added when the name is taken. */
  private async createProject(title: string): Promise<string> {
    const base = projectIdFor(title, new Date());
    for (let n = 1; n <= 5; n++) {
      const id = n === 1 ? base : `${base.slice(0, 60)}-${n}`;
      try {
        await firstValueFrom(this.api.createProject(id));
        return id;
      } catch (err) {
        if (!(err instanceof HttpErrorResponse && err.status === 409)) throw err;
      }
    }
    throw new Error($localize`:@@create.errName:The project could not be created: the name is taken.`);
  }

  /** Uploads the first picture and the first song attached, and answers the names the server stored. */
  private async upload(item: RequestItem, id: string, d: RequestDraft): Promise<{ picture?: string; audio?: string }> {
    const out: { picture?: string; audio?: string } = {};
    const picture = item.attachments.find((a) => a.kind === 'image' || a.kind === 'video');
    const audio = item.attachments.find((a) => a.kind === 'audio');
    const jobs: { a: Attachment; as: 'picture' | 'audio'; set: (n: string) => void }[] = [];
    if (picture && d.kind !== 'music') jobs.push({ a: picture, as: 'picture', set: (n) => (out.picture = n) });
    if (audio && d.kind === 'music') jobs.push({ a: audio, as: 'audio', set: (n) => (out.audio = n) });
    for (const [i, j] of jobs.entries()) {
      item.uploading.set(0);
      const name = sourceNameFor(j.a.file.name, Date.now() + i, j.as === 'audio' ? 'mp3' : 'png');
      let stored: string | undefined;
      await new Promise<void>((resolve, reject) => {
        this.api.uploadWithProgress(id, name, j.a.file, j.as).subscribe({
          next: (e) => {
            item.uploading.set(e.progress);
            if (e.name) stored = e.name;
          },
          error: reject,
          complete: resolve,
        });
      });
      j.set(stored ?? name);
    }
    item.uploading.set(null);
    return out;
  }

  /**
   * The estimated time of the project that was just made, from what this machine has measured where it has enough and
   * from the table where not, and which of the two it was. The table's own figure stays when the server cannot say.
   */
  private async estimateOf(id: string, yaml: string, kind: RequestKind, table: number): Promise<{ seconds: number; source?: EstimateSource; executions?: number }> {
    if (kind === 'music' || table <= 0) return { seconds: table };
    try {
      const e = await firstValueFrom(this.api.estimate({ yaml, project: id }));
      return { seconds: e.seconds, source: e.source, ...(e.executions ? { executions: e.executions } : {}) };
    } catch {
      return { seconds: table };
    }
  }

  /** The project's configuration for the draft at the best the machine can do, and what that is. */
  private async configure(id: string, d: RequestDraft): Promise<{ yaml: string; lines: string[]; seconds: number }> {
    const [res, catalog, env] = await Promise.all([
      firstValueFrom(this.api.getConfig(id)),
      firstValueFrom(this.api.getCatalog()),
      firstValueFrom(this.api.getEnvironment()),
    ]);
    const starter = res.parsed;
    if (!starter) throw new Error($localize`:@@create.errStarter:The server could not read the new project.`);
    const machine = machineOf(env.gpus, env.ram);
    if (d.kind === 'music') {
      const cfg = musicConfig(starter, d, env.music ?? [], machine);
      const plan = generatorHasLevels(d.generator) ? planMusicAuto(cfg, env.music ?? [], machine, null, null, d.resolution) : null;
      return {
        yaml: toMusicYaml(cfg),
        lines: [GENERATOR_LABELS[resolveGenerator(d.generator, [])], ...(plan ? [plan.tier.label] : generatorHasLevels(d.generator) ? [$localize`:@@create.musicDefault:Default quality`] : [])],
        seconds: plan?.seconds ?? 0,
      };
    }
    const plan = videoRequestPlan(starter, d, catalog.entries, machine);
    if (!plan) throw new Error($localize`:@@create.errNoModel:No image model that fits this machine is installed: install one in Models.`);
    const cfg = plan.config;
    const lines = [plan.graphic ? `${$localize`:@@create.graphic:animated graphic`} · ${cfg.defaults.resolution}` : `${cfg.defaults.model.replace(/^models\//, '').replace(/\.[a-z]+$/i, '')} · ${cfg.defaults.resolution}`];
    if (d.kind === 'video' && plan.video) lines.push(videoChoiceLabel(plan.video));
    if (plan.editing) lines.push($localize`:@@create.editingModel:retouch: ${editEngineLabel(plan.editEngine ?? 'fast')}:engine:`);
    if (plan.speechBy === 'model') lines.push($localize`:@@create.speechModel:the model says the line`);
    else if (plan.speechBy === 'narration') lines.push($localize`:@@create.speechNarration:with narration`);
    return { yaml: toYaml(cfg), lines, seconds: plan.graphic ? 0 : estimateFor(cfg, catalog.entries, machine) };
  }

  /**
   * Follows a launched run and shows each request as it moves: queued, running, done. The stream says the state when it
   * connects and when the run ends, not when it starts, and a phone that sleeps or goes to another app loses it; so the
   * run itself is also asked every few seconds and as soon as the screen is back. Whichever answers last wins.
   */
  private follow(item: RequestItem, run: Run, queuePosition: number | undefined): void {
    item.stopWatching?.();
    item.run.set(run);
    item.queuePosition.set(queuePosition);
    item.phase.set(run.state === 'running' ? 'running' : 'queued');
    const stream = this.streams.connect(run.id);
    item.stream.set(stream);
    let seen: unknown = null;
    let ended = false;
    let ticks = 0;
    const onBack = () => {
      if (document.visibilityState === 'visible') void ask();
    };
    const timer = setInterval(() => {
      const s = stream.state();
      if (s && s !== seen) {
        seen = s;
        apply(s);
      }
      if (++ticks % 6 === 0) void ask();
    }, 800);
    const stop = () => {
      ended = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('online', onBack);
    };
    const apply = (s: { state: Run['state']; queue_position?: number; artifact?: string; error?: string }) => {
      if (ended) return;
      item.queuePosition.set(s.queue_position);
      if (s.state === 'queued') item.phase.set('queued');
      else if (s.state === 'running') item.phase.set('running');
      else if (s.state === 'succeeded') {
        stop();
        void this.finish(item, s.artifact);
      } else {
        stop();
        item.error.set(s.error ?? $localize`:@@create.errRun:The generation did not finish.`);
        item.phase.set('failed');
      }
    };
    const ask = async () => {
      if (ended) return;
      try {
        const r = await firstValueFrom(this.api.getRun(run.id, true));
        apply({ state: r.run.state, queue_position: r.queue_position, artifact: r.run.artifact, error: r.run.error });
      } catch {
        // the stream, or the next ask, will say
      }
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('online', onBack);
    item.stopWatching = stop;
  }

  /** Finds the result of a succeeded run: the video, the image or the song with its cover. */
  private async finish(item: RequestItem, artifact: string | undefined): Promise<void> {
    const d = item.draft();
    const id = item.project();
    if (!d) return;
    try {
      if (d.kind === 'video' && artifact) {
        item.result.set({ kind: 'video', url: this.api.artifactUrl(id, artifact) });
      } else if (d.kind === 'image') {
        const man = await firstValueFrom(this.api.getManifest(id, id));
        const img = man.images[0];
        if (!img) throw new Error($localize`:@@create.errNoImage:The generation finished but left no image.`);
        item.result.set({ kind: 'image', url: this.api.artifactUrl(id, img.file) });
      } else if (d.kind === 'music') {
        const man = await firstValueFrom(this.api.getMusicManifest(id, id));
        const song = man.tracks[0];
        if (!song) throw new Error($localize`:@@create.errNoSong:The generation finished but left no song.`);
        item.result.set({ kind: 'music', url: this.api.artifactUrl(id, song.file), cover: song.cover ? this.api.artifactUrl(id, song.cover) : undefined });
      } else {
        throw new Error($localize`:@@create.errNoResult:The generation finished but the result cannot be found.`);
      }
      item.phase.set('done');
    } catch (err) {
      item.error.set(errorText(err, this.conn));
      item.phase.set('failed');
    }
  }

  /** Cancels the run of a request that is queued or running. */
  async cancel(item: RequestItem): Promise<void> {
    const run = item.run();
    if (!run) return;
    try {
      await firstValueFrom(this.api.cancelRun(run.id));
    } catch (err) {
      item.error.set(errorText(err, this.conn));
    }
  }

  /**
   * The requests made in this browser tab (a reload does not lose them), from the projects and runs on the server.
   * The ones of earlier visits are not shown: they stay in the gallery and the projects, where they are looked for on purpose.
   */
  async restore(): Promise<void> {
    const mine = new Set(sessionProjects());
    if (mine.size === 0) return;
    const known = new Set(this.items().map((i) => i.project()));
    const projects = (await firstValueFrom(this.api.listProjects())).filter((p) => p.id.startsWith(REQUEST_PREFIX) && mine.has(p.id) && !known.has(p.id));
    projects.sort((a, b) => b.id.localeCompare(a.id));
    for (const p of projects.slice(0, LIMIT)) {
      const runs = await firstValueFrom(this.api.listRuns(p.id, 1));
      const run = runs[0];
      const kind: RequestKind = p.mode === 'music' ? 'music' : p.mode === 'images' ? 'image' : 'video';
      const title = titleFromProjectId(p.id);
      const item = new RequestItem(`r${++this.counter}`, title, [], activeLang());
      item.project.set(p.id);
      item.draft.set({ ...draftFromText(title, kind, title) });
      item.run.set(run ?? null);
      this.items.update((l) => [...l, item]);
      if (!run) {
        item.phase.set('failed');
        item.error.set($localize`:@@create.errNeverRan:This request never got to start.`);
      } else if (run.state === 'queued' || run.state === 'running') {
        this.follow(item, run, undefined);
      } else if (run.state === 'succeeded') {
        await this.finish(item, run.artifact);
      } else {
        item.phase.set('failed');
        item.error.set(run.error ?? $localize`:@@create.errRun:The generation did not finish.`);
      }
    }
  }
}

/** A text the assistant could not write (it refused, or failed) is the user's own words: what they typed is what is sent. */
function withUserWords(d: RequestDraft, text: string): RequestDraft {
  if (d.kind === 'music') return d.caption.trim() ? d : { ...d, caption: text };
  return d.imagePrompt.trim() ? d : { ...d, imagePrompt: text };
}

function titleOf(text: string): string {
  return text.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?¡¿"'«»]+$/g, '');
}

function fail(item: RequestItem, message: string): void {
  item.error.set(message);
  item.phase.set('failed');
}

function errorText(err: unknown, conn: ConnectionService): string {
  if (err instanceof HttpErrorResponse) return describeError(err, conn.remote() ? conn.server() : undefined);
  return err instanceof Error ? err.message : String(err);
}
