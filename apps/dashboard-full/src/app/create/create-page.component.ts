import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { HttpErrorResponse } from '@angular/common/http';

import { describeError } from '../core/api-error.interceptor';
import { MusicGeneratorName, MusicTagCombo, RecognizeMethod, Recognizer, RequestKind } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { firstValueFrom } from 'rxjs';
import { AvailabilityStore } from '../core/availability.store';
import { ConnectionService } from '@lab/server-connection';
import { ShareService } from '../core/share.service';
import { EnginesStore } from '../core/engines.store';
import { EnvironmentStore } from '../core/environment.store';
import { activeLang } from '../core/language';
import { durationText } from '../editor/auto-plan';
import { Attachment, CreateFlowService, RequestItem, attachmentKind, holdFile } from './create-flow.service';
import { Recording, RecorderService } from './recorder.service';
import { STYLES, Style, styleHelp, styleLabel } from '../editor/quality-tiers';
import { EditEngineSelectComponent } from '../shared/edit-engine-select/edit-engine-select.component';
import { LevelChoice, SONG_LENGTHS, SongLength, lengthFor } from './request-config';
import { GENERATORS, GENERATOR_LABELS, GeneratorChoice, GeneratorInfo } from './music-generator';
import { Option, OptionRowComponent } from '../shared/option-row/option-row.component';
import { TagPickerComponent } from './tag-picker/tag-picker.component';
import { ComboChipsComponent } from './combo-chips/combo-chips.component';

/**
 * Create: ask for something by speaking or writing, check what was understood, and see the result. It is
 * the page made for a phone: one column, the input at the bottom, one card per request.
 */
@Component({
  selector: 'app-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    AutoAnimateDirective,
    MatButtonModule,
    MatButtonToggleModule,
    EditEngineSelectComponent,
    OptionRowComponent,
    TagPickerComponent,
    ComboChipsComponent,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSliderModule,
    MatSlideToggleModule,
  ],
  templateUrl: './create-page.component.html',
  styleUrl: './create-page.component.scss',
})
export class CreatePageComponent implements OnInit {
  protected readonly flow = inject(CreateFlowService);
  private readonly recorder = inject(RecorderService);
  private readonly env = inject(EnvironmentStore);
  private readonly engines = inject(EnginesStore);
  private readonly availability = inject(AvailabilityStore);
  private readonly conn = inject(ConnectionService);
  private readonly api = inject(ApiService);

  protected readonly text = signal('');
  protected readonly files = signal<Attachment[]>([]);
  protected readonly sharer = inject(ShareService);
  protected readonly note = signal('');
  /** What was heard of the last song and the note that shows it: while that note is on screen, the button next to it goes back to the card of that song to review it. */
  protected readonly heardText = signal<{ note: string; item: RequestItem } | null>(null);
  protected readonly state = signal<'idle' | 'recording' | 'transcribing' | 'listening'>('idle');
  /** What the recording in progress is for: a spoken request, or a song playing that is to be recognised. */
  protected readonly recordingFor = signal<'speech' | 'song'>('speech');
  /** How a song that plays is recognised: Whisper's lyrics alone, or also what LAION-CLAP or MuQ-MuLan hears. */
  protected readonly songMethod = signal<RecognizeMethod>('whisper');
  /** The writing area is unfolded to the whole height (a big field); it folds down when the request is sent. */
  protected readonly open = signal(false);
  /** The ear was tapped once: the methods are shown and the next tap starts listening. */
  protected readonly listenOpen = signal(false);
  protected readonly recognizers = signal<Recognizer[]>([]);
  protected readonly seconds = signal(0);
  protected readonly sending = signal(false);
  /** What the request is for, chosen before writing: null while it is being chosen, 'auto' to let the assistant decide. */
  protected readonly kindChoice = signal<RequestKind | 'auto' | null>(null);
  /** The words the field asks for, by the kind chosen. */
  protected readonly placeholder = computed(() => {
    switch (this.kindChoice()) {
      case 'video':
        return $localize`:@@create.phVideo:Tell the video: what is seen, how it moves and what it says, if anything`;
      case 'image':
        return $localize`:@@create.phImage:Tell the picture: what is seen, the place, the light and the style`;
      case 'music':
        return $localize`:@@create.phMusic:Tell the song: style, mood, what it is about and whether it has a voice`;
      default:
        return $localize`:@@create.placeholder:What do you want to create?`;
    }
  });
  /** The name of the kind chosen, for the bar over the field. */
  protected readonly kindName = computed(() => {
    switch (this.kindChoice()) {
      case 'video':
        return $localize`:@@create.kindVideo:Video`;
      case 'image':
        return $localize`:@@create.kindImage:Image`;
      case 'music':
        return $localize`:@@create.kindMusic:Music`;
      default:
        return $localize`:@@create.kindAuto:The AI decides`;
    }
  });

  /** Chooses what to make: the field unfolds at once (upwards, as it does when it is tapped). */
  protected chooseKind(kind: RequestKind | 'auto'): void {
    this.kindChoice.set(kind);
    this.open.set(true);
  }

  /** Goes back to the choice of kind, with the field folded. */
  protected changeKind(): void {
    this.kindChoice.set(null);
    this.open.set(false);
  }

  /** The assistant is rewriting the text of the field. */
  protected readonly improving = signal(false);
  /** What the field said before «Mejorar con IA», to bring it back; null when nothing was improved. */
  protected readonly improvedFrom = signal<string | null>(null);
  private recording: Recording | null = null;
  private tick: ReturnType<typeof setInterval> | undefined;

  protected readonly lengths = Object.keys(SONG_LENGTHS) as SongLength[];
  protected readonly lengthOf = (s: number): SongLength => lengthFor(s);
  protected readonly lengthSeconds = SONG_LENGTHS;

  protected readonly kindLabel = $localize`:@@create.kindLabel:What you want`;
  protected readonly kindOptions: Option<RequestKind>[] = [
    { value: 'video', label: $localize`:@@create.kindVideo:Video`, icon: 'movie', testId: 'kind-video' },
    { value: 'image', label: $localize`:@@create.kindImage:Image`, icon: 'image', testId: 'kind-image' },
    { value: 'music', label: $localize`:@@create.kindMusic:Music`, icon: 'music_note', testId: 'kind-music' },
  ];
  protected readonly generatorLabelText = $localize`:@@create.generatorLabel:Music generator`;
  protected readonly lengthLabel = $localize`:@@create.lengthLabel:Length`;
  protected readonly lengthOptions: Option<SongLength>[] = [
    { value: 'short', label: $localize`:@@create.lenShort:Short`, testId: 'length-short' },
    { value: 'normal', label: $localize`:@@create.lenNormal:Normal`, testId: 'length-normal' },
    { value: 'long', label: $localize`:@@create.lenLong:Long`, testId: 'length-long' },
  ];

  protected levelsLabel(kind: RequestKind): string {
    return kind === 'music' ? $localize`:@@create.levelsMusic:Quality` : $localize`:@@create.levelsVideo:Resolution`;
  }

  private levelLabel(l: LevelChoice): string {
    switch (l) {
      case 'auto':
        return $localize`:@@create.levelAuto:Automatic`;
      case 'draft':
        return $localize`:@@create.levelDraft:Draft`;
      case 'normal':
        return $localize`:@@create.levelNormal:Normal`;
      default:
        return $localize`:@@create.levelHigh:High`;
    }
  }

  private readonly levelOptionsOf: Record<'music' | 'other', Option<LevelChoice>[]> = {
    music: this.levelsFor('music').map((l) => ({ value: l, label: this.levelLabel(l), testId: 'level-' + l })),
    other: this.levelsFor('video').map((l) => ({ value: l, label: this.levelLabel(l), testId: 'level-' + l })),
  };

  protected levelOptions(kind: RequestKind): Option<LevelChoice>[] {
    return this.levelOptionsOf[kind === 'music' ? 'music' : 'other'];
  }

  protected generatorOptions(item: RequestItem): Option<GeneratorChoice>[] {
    return [
      { value: 'auto', label: $localize`:@@create.generatorAuto:Automatic`, testId: 'generator-auto' },
      ...item.generators().map((g) => ({ value: g as GeneratorChoice, label: GENERATOR_LABELS[g], testId: 'generator-' + g })),
    ];
  }

  /** The levels a card offers; a song has no "automatic" (it is always one version at the level chosen). */
  protected levelsFor(kind: RequestKind): LevelChoice[] {
    return kind === 'music' ? ['draft', 'normal', 'high'] : ['auto', 'draft', 'normal', 'high'];
  }
  protected readonly motionAvailable = computed(() => this.availability.available('motion_graphics'));
  protected readonly assistantAvailable = computed(() => this.availability.available('assistant'));

  /** Newest request last, next to the input. */
  protected readonly chronological = computed(() => [...this.flow.items()].reverse());

  /** Why the microphone is not offered ('' when it is). */
  protected readonly micBlock = computed(() => {
    const b = this.recorder.block();
    if (b !== '') return b;
    const d = this.env.report()?.dictation;
    return d && !d.available ? 'server' : '';
  });
  protected readonly serverReason = computed(() => this.env.report()?.dictation?.reason ?? '');
  protected readonly canSend = computed(() => this.text().trim().length > 0 && this.state() === 'idle' && !this.sending());

  private readonly end = viewChild<ElementRef<HTMLElement>>('end');

  constructor() {
    // New cards and phase changes bring the end of the list into view, next to the input.
    effect(() => {
      this.flow.items().forEach((i) => i.phase());
      const el = this.end()?.nativeElement;
      if (el) queueMicrotask(() => el.scrollIntoView?.({ block: 'end', behavior: 'smooth' }));
    });
  }

  ngOnInit(): void {
    void this.env.ensureLoaded();
    void this.availability.load();
    void this.flow.restore().catch(() => undefined);
    void this.flow.recognizers().then((r) => this.recognizers.set(r)).catch(() => undefined);
  }

  protected methodUsable(id: RecognizeMethod): boolean {
    return id === 'whisper' || !!this.recognizers().find((r) => r.id === id)?.available;
  }

  /** Why a method cannot be chosen now, for its tooltip. */
  protected methodWhy(id: RecognizeMethod): string {
    const r = this.recognizers().find((x) => x.id === id);
    if (!r || r.available) return '';
    if (r.reason === 'not_running') return $localize`:@@create.methodNotRunning:Its service is stopped: start it in Environment, on the computer.`;
    return r.detail ?? $localize`:@@create.methodOther:It cannot be used now.`;
  }

  // --- the input ------------------------------------------------------------------

  protected async toggleMic(): Promise<void> {
    return this.toggleRecording('speech');
  }

  /** Listening to a song: records the song that is playing and asks the server what kind of song it is. */
  protected async toggleListen(): Promise<void> {
    if (this.state() === 'idle' && !this.listenOpen()) {
      this.listenOpen.set(true);
      return;
    }
    this.listenOpen.set(false);
    return this.toggleRecording('song');
  }

  private async toggleRecording(purpose: 'speech' | 'song'): Promise<void> {
    this.note.set('');
    if (this.state() === 'recording') return this.stopMic();
    if (this.state() !== 'idle') return;
    this.recordingFor.set(purpose);
    try {
      this.recording = await this.recorder.start(() => {
        this.note.set($localize`:@@create.recLimit:The 60-second limit was reached: what was recorded is being transcribed.`);
        void this.stopMic();
      });
      this.state.set('recording');
      this.seconds.set(0);
      this.tick = setInterval(() => this.seconds.update((s) => s + 1), 1000);
    } catch {
      this.note.set($localize`:@@create.micDenied:The microphone could not be used. Give the browser permission for this page and try again.`);
    }
  }

  private async stopMic(): Promise<void> {
    clearInterval(this.tick);
    const rec = this.recording;
    this.recording = null;
    if (!rec) return;
    const forSong = this.recordingFor() === 'song';
    this.state.set(forSong ? 'listening' : 'transcribing');
    try {
      const blob = await rec.stop();
      if (forSong) return await this.recognise(blob);
      const said = await this.flow.transcribe(blob, activeLang());
      if (said) this.text.update((t) => (t.trim() ? `${t.trim()} ${said}` : said));
      else this.note.set($localize`:@@create.nothingHeard:Nothing was heard. Get closer to the microphone and try again.`);
    } catch (err) {
      this.note.set(
        err instanceof HttpErrorResponse
          ? describeError(err, this.conn.remote() ? this.conn.server() : undefined)
          : $localize`:@@create.recFailed:The recording failed.`,
      );
    } finally {
      this.state.set('idle');
    }
  }

  /** What was heard of the song becomes the request for a new one of that kind; the card that comes can be corrected as any other. */
  private async recognise(blob: Blob): Promise<void> {
    const { heard, item } = await this.flow.listen(blob, activeLang(), this.songMethod());
    if (!item) {
      this.note.set($localize`:@@create.notRecognised:I couldn't tell what kind of song it is. Get closer to the speaker and record about 20 seconds.`);
      return;
    }
    const facts: string[] = [];
    if (heard.bpm !== undefined) facts.push($localize`:@@create.heardBpm:about ${Math.round(heard.bpm)}:bpm: BPM`);
    if (heard.keyscale) facts.push(heard.keyscale);
    facts.push(heard.no_words ? $localize`:@@create.heardNoWords:no words were understood` : heard.theme ? $localize`:@@create.heardTheme:it is about “${heard.theme}:theme:”` : '');
    this.note.set($localize`:@@create.heard:I heard: ${heard.style ?? ''}:style:. ${facts.filter(Boolean).join(' · ')}:facts:. Neither the lyrics nor the recording are kept.`);
    if (heard.genre_unknown) this.note.update((n) => n + ' ' + $localize`:@@create.genreUnknown:I couldn't tell the genre: check the style before tapping “Do it”.`);
    this.heardText.set({ note: this.note(), item });
  }

  /** «Revisar»: goes back to the card made from what was heard, so the user decides what to do with it. */
  protected reviewHeard(): void {
    const h = this.heardText();
    if (!h) return;
    this.heardText.set(null);
    this.note.set('');
    this.open.set(false);
    queueMicrotask(() => document.querySelector(`[data-key="${h.item.key}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
  }

  protected async attach(input: HTMLInputElement): Promise<void> {
    // The files are read before the picker is cleared: see holdFile.
    const picked = Array.from(input.files ?? []);
    const added: Attachment[] = [];
    for (const f of picked) {
      const kind = attachmentKind(f);
      if (!kind) {
        this.note.set($localize`:@@create.badFile:Only images, videos and audio (mp3 or wav) can be attached.`);
        continue;
      }
      const held = await holdFile(f);
      if (held) added.push({ file: held, kind });
      else this.note.set($localize`:@@create.emptyFile:The file «${f.name}:name:» arrived empty (0 bytes) from this device. Pick it again or take the photo again.`);
    }
    this.files.update((l) => [...l, ...added]);
    input.value = '';
  }

  /**
   * «Editar» on a finished picture: the picture becomes the attachment of a new picture request, so that what
   * the user writes next is an instruction to retouch it (the card starts as a retouch when an editing model is installed).
   */
  protected async editResult(url: string): Promise<void> {
    try {
      const blob = await (await fetch(url)).blob();
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      this.files.set([{ file: new File([blob], `resultado.${ext}`, { type: blob.type || 'image/png' }), kind: 'image' }]);
      this.kindChoice.set('image');
      this.text.set('');
      this.open.set(true);
      this.note.set('');
    } catch {
      this.note.set($localize`:@@create.editFailed:I couldn't get the picture back to edit it.`);
    }
  }

  protected detach(a: Attachment): void {
    this.files.update((l) => l.filter((x) => x !== a));
  }

  protected fold(): void {
    this.open.set(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /** «Mejorar con IA»: the assistant rewrites what is in the field with more detail, in the same language; the old text can be brought back. */
  protected async improve(): Promise<void> {
    const before = this.text();
    if (!before.trim() || this.improving()) return;
    this.improving.set(true);
    this.note.set('');
    try {
      const res = await firstValueFrom(this.api.assist('improve', before));
      const better = res.text.trim();
      if (better) {
        this.improvedFrom.set(before);
        this.text.set(better);
      }
    } catch (err) {
      this.note.set(
        err instanceof HttpErrorResponse && err.status === 409
          ? $localize`:@@create.improveBusy:A run is in progress: I can't improve the text now.`
          : $localize`:@@create.improveFailed:I couldn't improve the text: ${err instanceof HttpErrorResponse ? describeError(err, this.conn.remote() ? this.conn.server() : undefined) : String(err)}:reason:.`,
      );
    } finally {
      this.improving.set(false);
    }
  }

  /** Brings back the text as it was before it was improved. */
  protected undoImprove(): void {
    const before = this.improvedFrom();
    if (before === null) return;
    this.text.set(before);
    this.improvedFrom.set(null);
  }

  protected async send(): Promise<void> {
    if (!this.canSend()) return;
    this.fold();
    this.sending.set(true);
    const text = this.text();
    const files = this.files();
    const kind = this.kindChoice();
    this.kindChoice.set(null);
    this.text.set('');
    this.improvedFrom.set(null);
    this.files.set([]);
    this.note.set('');
    try {
      await this.flow.submit(text, files, kind === 'auto' || kind === null ? undefined : kind);
    } finally {
      this.sending.set(false);
    }
  }

  // --- the cards ------------------------------------------------------------------

  protected kind(item: RequestItem): RequestKind {
    return item.draft()?.kind ?? 'video';
  }

  protected setKind(item: RequestItem, kind: RequestKind): void {
    this.flow.setKind(item, kind);
  }

  protected edit<K extends keyof NonNullable<ReturnType<RequestItem['draft']>>>(item: RequestItem, key: K, value: NonNullable<ReturnType<RequestItem['draft']>>[K]): void {
    const d = item.draft();
    if (!d) return;
    // Writing the style, the tags or the lyrics marks the suggestion as the user's: asking again will ask first.
    const touched = key === 'caption' || key === 'lyrics' || key === 'tags';
    item.draft.set({ ...d, [key]: value, ...(touched ? { suggestionEdited: true } : {}) });
    // The words and the engine change what "Automatic" takes and the times.
    if (key === 'speech' || key === 'engine' || key === 'style' || key === 'resolution' || key === 'animation') void this.flow.refreshEngines(item);
  }

  /** What the generator the song will use can and cannot do (the card hides the rest). */
  protected generatorInfo(item: RequestItem): GeneratorInfo {
    return GENERATORS[item.generator()];
  }

  protected generatorLabel(g: MusicGeneratorName): string {
    return GENERATOR_LABELS[g];
  }

  /** A popular combination: its tags for the generators that read tags, or as the style sentence for ACE-Step. */
  protected pickCombo(item: RequestItem, combo: MusicTagCombo): void {
    if (this.generatorInfo(item).style === 'tags') this.edit(item, 'tags', combo.tags.join(','));
    else this.edit(item, 'caption', combo.tags.join(', '));
  }

  protected pickGenerator(item: RequestItem, choice: GeneratorChoice): void {
    void this.flow.chooseGenerator(item, choice);
  }

  /** One line under the selector: what "Automatic" took, what the generator does not do, and whether its container is running. */
  protected generatorHelp(item: RequestItem): string {
    const d = item.draft();
    const g = item.generator();
    const parts: string[] = [];
    if (d?.generator === 'auto') parts.push($localize`:@@create.genAuto:Automatic uses ${GENERATOR_LABELS[g]}:name:.`);
    if (g === 'diffrhythm2') parts.push($localize`:@@create.genDr2:English lyrics only, and always with a voice.`);
    else if (g === 'heartmula') parts.push($localize`:@@create.genHm:English tags; no reference song.`);
    else parts.push($localize`:@@create.genAce:Supports no voice and a reference song.`);
    const stopped = (g === 'heartmula' && this.engines.heartmulaStopped()) || (g === 'diffrhythm2' && this.engines.diffrhythm2Stopped());
    if (stopped) parts.push($localize`:@@create.genStopped:Its container is stopped: it starts when the song begins.`);
    return parts.join(' ');
  }

  /** Retoque is offered: the request is an image, it has a picture to retouch and an editing model is installed. */
  protected canRetouch(item: RequestItem, kind: RequestKind): boolean {
    return kind === 'image' && this.hasPicture(item) && item.canEdit();
  }

  protected readonly help = styleHelp;
  protected readonly label = styleLabel;
  /** The looks beyond the built-in ones that an installed model declares. */
  protected readonly otherStyles = (styles: Style[]): Style[] => styles.filter((s) => !STYLES.includes(s));

  /** The card has a picture the user attached (the choice of what to do with it is offered). */
  protected hasPicture(item: RequestItem): boolean {
    return item.attachments.some((a) => a.kind === 'image');
  }

  /** Takes a card off; one that has a project asks first, because the project and what it made are deleted. */
  protected remove(item: RequestItem): void {
    if (item.project() && !confirm($localize`:@@create.confirmRemove:Delete this request and everything it generated (the project, the runs and the files)?`)) return;
    void this.flow.dismiss(item);
  }

  /** «Limpiar pantalla»: empties the list; nothing is deleted (the projects stay in the gallery and the runs go on). */
  protected clearScreen(): void {
    this.flow.clearScreen();
    this.note.set('');
  }

  protected setLength(item: RequestItem, len: SongLength): void {
    this.edit(item, 'seconds', SONG_LENGTHS[len]);
  }

  protected canRetry(item: RequestItem): boolean {
    return !!item.draft() && !!item.project();
  }

  protected download(url: string): string {
    return url;
  }

  protected readonly duration = durationText;

  protected readonly listenTip = $localize`:@@create.listenTip:Listen to a song that is playing and ask for a similar one`;
  protected readonly micTip = $localize`:@@create.micTip:Speak and tap again to stop`;
}
