import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { RecognizeMethod, Recognizer, SourceInfo, Track } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AvailabilityStore } from '../../core/availability.store';
import { EnvironmentStore } from '../../core/environment.store';
import { isKeepableVideo, isVideoFile } from '../../core/source-name';
import { SourceUrlComponent } from '../../shared/source-url/source-url.component';
import { MusicStore } from '../music.store';
import { VOCAL_LANGUAGES } from '../music-options';
import { ActivityService } from '../../core/activity.service';
import { ExtractProposal, SongExtractStore } from './song-extract.store';

export interface ExtractDialogData {
  /** The index of the track the proposal is applied to. */
  index: number;
}

/** The proposal as the user edits it. */
interface Draft {
  language: string;
  lyrics: string;
  caption: string;
  tags: string;
  bpm: string;
  keyscale: string;
  picture: string;
  /** Write the tempo and the key into the track (ACE-Step only). */
  useMeasures: boolean;
  /** Mark the track as instrumental (a source with no words). */
  instrumental: boolean;
}

/**
 * "Take it from a video or audio": the user picks a song (or a video), says
 * whether to separate the voice first and to describe the picture, and gets a
 * PROPOSAL with the lyrics, language, style, tags, tempo and key to review.
 * Nothing is written into the track until "Aplicar".
 */
@Component({
  selector: 'app-extract-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    RouterLink,
    SourceUrlComponent,
  ],
  providers: [SongExtractStore],
  templateUrl: './extract-dialog.component.html',
  styleUrl: './extract-dialog.component.scss',
})
export class ExtractDialogComponent {
  protected readonly data = inject<ExtractDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ExtractDialogComponent, boolean>>(MatDialogRef);
  protected readonly music = inject(MusicStore);
  protected readonly extract = inject(SongExtractStore);
  private readonly env = inject(EnvironmentStore);
  private readonly api = inject(ApiService);
  private readonly availability = inject(AvailabilityStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly languages = VOCAL_LANGUAGES;
  protected readonly track = computed<Track | undefined>(() => this.music.tracks()[this.data.index]);
  protected readonly generator = computed(() => this.music.settings().generator ?? 'ace-step');
  /** HeartMuLa and DiffRhythm2 take tags, and have no tempo or key to set. */
  protected readonly service = computed(() => this.generator() !== 'ace-step');

  protected readonly whisperMissing = this.env.whisperMissing;
  protected readonly whisperReady = this.env.whisperReady;
  protected readonly assistantAvailable = computed(() => this.availability.available('assistant'));
  protected readonly canDescribe = computed(() => this.availability.available('describe_video'));

  /** The project's audios and its kept videos. */
  protected readonly sources = computed(() => this.music.sources().filter((s) => (s.kind ?? 'audio') === 'audio' || s.kind === 'video'));
  protected readonly picked = signal('');
  protected readonly chosen = computed<SourceInfo | undefined>(() => this.sources().find((s) => s.name === this.picked()));
  protected readonly isVideo = computed(() => this.chosen()?.kind === 'video');

  protected readonly separateVoice = signal(false);
  protected readonly describePicture = signal(false);
  protected readonly hint = signal('');
  protected readonly language = signal('');
  protected readonly switchLevel = signal(true);

  /** How the sound is recognised: Whisper alone, or also LAION-CLAP. MuQ-MuLan runs the diffrhythm2 executable, not a service. */
  protected readonly method = signal<RecognizeMethod>('whisper');
  protected readonly recognizers = signal<Recognizer[]>([]);
  protected recognizer(id: RecognizeMethod): Recognizer | undefined {
    return this.recognizers().find((r) => r.id === id);
  }

  /** The voice can be separated: ACE-Step project, an audio source and a synthesis model that is not the turbo one. */
  protected readonly canSeparate = computed(() => !this.service() && !!this.chosen() && !this.isVideo());
  protected readonly separationReady = computed(() => this.music.separationModels().length > 0);
  protected readonly canSwitch = computed(() => this.music.synthIsTurbo() && this.separationReady());
  protected readonly separating = computed(() => this.separateVoice() && this.canSeparate() && this.separationReady());

  protected readonly canStart = computed(() => this.whisperReady() && !!this.chosen() && !this.extract.busy() && (!this.separateVoice() || !this.canSeparate() || this.separationReady()));

  protected readonly draft = signal<Draft | null>(null);
  protected readonly proposal = this.extract.proposal;

  constructor() {
    const activity = inject(ActivityService);
    effect(() => activity.track('extract', this.extract.busy()));
    inject(DestroyRef).onDestroy(() => activity.track('extract', false));
    // The first source is chosen from the start; a proposal that arrives becomes the draft to edit.
    this.api.recognizers().subscribe({
      next: (r) => {
        this.recognizers.set(r.recognizers ?? []);
        // CLAP is the better start when its service is already up; otherwise Whisper alone works as it always did.
      },
      error: () => this.recognizers.set([]),
    });
    queueMicrotask(() => {
      void this.music.loadSources().then(() => {
        if (!this.picked() && this.sources().length > 0) this.picked.set(this.sources()[0].name);
      });
    });
  }

  protected stepText(): string {
    switch (this.extract.step()) {
      case 'separating':
        return $localize`:@@extract.step.separating:Separating the voice (uses the GPU)…`;
      case 'measuring':
        return $localize`:@@extract.step.measuring:Measuring the tempo and the key…`;
      case 'listening':
        return $localize`:@@extract.step.listening:Listening to the sound with LAION-CLAP…`;
      case 'reading':
        return $localize`:@@extract.step.reading:Reading the lyrics with Whisper (uses the CPU)…`;
      case 'describing':
        return $localize`:@@extract.step.describing:Looking at the picture of the video…`;
      case 'writing':
        return $localize`:@@extract.step.writing:Ordering the lyrics and proposing the style…`;
      default:
        return '';
    }
  }

  /** The reason a method cannot be chosen, in words. */
  protected whyNot(r: Recognizer | undefined): string {
    if (!r || r.available) return '';
    switch (r.reason) {
      case 'not_running':
        return $localize`:@@extract.method.notRunning:Its service is stopped: start it in Environment.`;
      case 'no_service':
        return $localize`:@@extract.method.noService:Its service is not installed (bash scripts/get-services.sh).`;
      case 'no_weights':
        return $localize`:@@extract.method.noWeights:Its weights are missing.`;
      default:
        return r.detail ?? $localize`:@@extract.method.other:It cannot be used now.`;
    }
  }

  /** Whether the method can be chosen. */
  protected usable(id: RecognizeMethod): boolean {
    return id === 'whisper' || !!this.recognizer(id)?.available;
  }

  protected pick(name: string): void {
    this.picked.set(name);
    if (!this.canSeparate()) this.separateVoice.set(false);
    if (!this.isVideo()) this.describePicture.set(false);
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // A video is kept as a video (so its picture can be described); an .avi or an audio goes the usual way.
    const name = isKeepableVideo(file.name) ? await this.music.uploadKeptVideo(file) : await this.music.uploadSource(file);
    if (name) this.pick(name);
  }

  protected async useUrlSource(name: string): Promise<void> {
    await this.music.loadSources();
    this.pick(name);
  }

  protected isVideoName(name: string): boolean {
    return isVideoFile(name);
  }

  protected async start(): Promise<void> {
    const source = this.chosen();
    if (!source) return;
    this.draft.set(null);
    await this.extract.run({
      source,
      separateVoice: this.separating(),
      describePicture: this.describePicture() && this.isVideo() && this.canDescribe(),
      hint: this.hint(),
      method: this.method(),
      language: this.language(),
      generator: this.generator(),
      assistantAvailable: this.assistantAvailable(),
      switchToMaximum: this.switchLevel() && this.canSwitch(),
    });
    const p = this.extract.proposal();
    if (p) this.draft.set(this.draftOf(p));
    // The proposal is below the options: bring it into view so the dialog does not look finished.
    setTimeout(() => this.host.nativeElement.querySelector('[data-testid="extract-proposal"]')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 50);
  }

  private draftOf(p: ExtractProposal): Draft {
    return {
      language: this.languages.some((l) => l.value === p.language) ? p.language : '',
      lyrics: p.lyrics,
      caption: p.caption,
      tags: p.tags,
      bpm: p.bpm ? String(p.bpm) : '',
      keyscale: p.keyscale ?? '',
      picture: p.picture,
      useMeasures: !this.service() && (p.bpm !== null || p.keyscale !== null),
      instrumental: false,
    };
  }

  protected edit(patch: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected useBpm(bpm: number): void {
    this.edit({ bpm: String(bpm) });
  }

  protected async copyPicture(): Promise<void> {
    const text = this.draft()?.picture ?? '';
    if (text && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
  }

  /** Writes the reviewed proposal into the track. */
  protected apply(): void {
    const d = this.draft();
    const t = this.track();
    if (!d || !t) return;
    const patch: Partial<Track> = {};
    if (d.instrumental) patch.instrumental = true;
    else if (d.lyrics.trim()) patch.lyrics = d.lyrics.trim();
    if (d.language) patch.vocal_language = d.language;
    if (d.caption.trim()) patch.prompt = d.caption.trim();
    if (this.service() && d.tags.trim()) patch.tags = d.tags.trim();
    if (!this.service() && d.useMeasures) {
      const bpm = Number(d.bpm);
      if (d.bpm.trim() && Number.isFinite(bpm) && bpm > 0) patch.bpm = bpm;
      if (d.keyscale.trim()) patch.keyscale = d.keyscale.trim();
    }
    this.music.updateTrack(this.data.index, patch);
    this.extract.discard();
    this.ref.close(true);
  }

  protected close(): void {
    this.extract.reset();
    this.ref.close(false);
  }
}
