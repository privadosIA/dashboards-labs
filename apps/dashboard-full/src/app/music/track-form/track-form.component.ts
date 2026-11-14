import { ChangeDetectionStrategy, Component, ViewContainerRef, computed, inject, input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { MusicGeneratorName, Track } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { MusicProposal } from '../music-assist.store';
import { ExtractDialogComponent, ExtractDialogData } from '../extract/extract-dialog.component';
import { MusicStore } from '../music.store';
import { TrackAssistComponent } from '../track-assist/track-assist.component';
import { StyleTemplatesComponent } from '../style-templates/style-templates.component';
import { TrackTaskComponent } from '../track-task/track-task.component';
import { TrackField, TrackErrors } from '../music-validators';
import { EnvironmentStore } from '../../core/environment.store';
import { adapterOptions, VOCAL_LANGUAGES, VOCAL_STYLES } from '../music-options';

type NumberField = 'seed' | 'bpm' | 'variants' | 'duration_seconds' | 'adapter_scale';

/**
 * The fields of one track. Only what applies to a song appears: the style,
 * the lyrics (off for an instrumental track), the musical metadata, the
 * seed and the number of variants. Every field left empty is an absent key,
 * which means "automatic" (the server decides the language from the lyrics). Client errors show next to the field;
 * the server's rejection is tied to the field it names, or listed for the
 * track when it names none.
 */
@Component({
  selector: 'app-track-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatButtonModule, MatIconModule, TrackAssistComponent, TrackTaskComponent, StyleTemplatesComponent],
  templateUrl: './track-form.component.html',
  styleUrl: './track-form.component.scss',
})
export class TrackFormComponent {
  readonly index = input.required<number>();

  protected readonly store = inject(MusicStore);
  protected readonly languages = VOCAL_LANGUAGES;
  protected readonly vocalStyles = VOCAL_STYLES;
  private readonly env = inject(EnvironmentStore);
  private readonly dialog = inject(MatDialog);
  private readonly vcr = inject(ViewContainerRef);
  protected readonly whisperReady = this.env.whisperReady;
  protected readonly whisperMissing = this.env.whisperMissing;
  private readonly api = inject(ApiService);

  /** The project makes its songs with HeartMuLa: it takes tags and has no reference, tonality, tempo or adapter. */
  protected readonly heart = computed(() => this.store.settings().generator === 'heartmula');
  /** The project makes its songs with DiffRhythm2: English lyrics only, no instrumentals, tasks or references. */
  protected readonly dr2 = computed(() => this.store.settings().generator === 'diffrhythm2');
  /** Either generator that runs as a service: they take tags and have no tonality, tempo, adapter or ACE-Step options. */
  protected readonly service = computed(() => this.heart() || this.dr2());
  /** The languages the generator can read: DiffRhythm2 reads English only (Spanish comes out badly pronounced). */
  protected readonly languageOptions = computed(() => (this.dr2() ? this.languages.filter((l) => l.value === 'en') : this.languages));
  /** What DiffRhythm2 cannot make of this track, in words; empty when it can make it. */
  protected readonly dr2Cannot = computed(() => {
    const t = this.track();
    if (!this.dr2() || !t) return '';
    if (t.task) return $localize`:@@music.dr2NoTask:This generator does not transform songs: remove the task or use ACE-Step.`;
    if (t.reference) return $localize`:@@music.dr2NoReference:This generator does not take references: remove it or use ACE-Step.`;
    if (t.instrumental) return $localize`:@@music.dr2NoInstrumental:This generator makes no instrumentals: write lyrics or use ACE-Step.`;
    if (t.vocal_language && t.vocal_language !== 'en') return $localize`:@@music.dr2NoLanguage:This generator reads English lyrics only: change the lyrics or use ACE-Step.`;
    return '';
  });
  /** The name of the project's generator, as the assistant takes it. */
  protected readonly generatorName = computed<MusicGeneratorName>(() => this.store.settings().generator ?? 'ace-step');
  protected readonly tagsExample = 'piano,happy,wedding';
  protected readonly tagsBusy = signal(false);
  protected readonly tagsError = signal('');

  protected readonly track = computed<Track | undefined>(() => this.store.tracks()[this.index()]);
  protected readonly errors = computed<TrackErrors>(() => this.store.validation().tracks[this.index()] ?? {});

  private readonly serverHere = computed(() => {
    const id = this.track()?.id;
    return id ? this.store.serverErrors().filter((e) => e.trackId === id) : [];
  });
  /** What the server said about each field of this track. */
  private readonly serverByField = computed(() => {
    const out: Partial<Record<TrackField, string>> = {};
    for (const e of this.serverHere()) {
      if (e.field && !out[e.field]) out[e.field] = e.text;
    }
    return out;
  });
  /** Rejections of this track that name no field. */
  protected readonly serverRest = computed(() => this.serverHere().filter((e) => !e.field));

  /** The adapters this track can pick: the installed ones, plus its own if it is not installed. */
  protected readonly adapterChoices = computed(() => adapterOptions(this.env.musicAdapters(), this.track()?.adapter));
  /** The selector shows only when there is something to choose, or a name to keep visible. */
  protected readonly showAdapter = computed(() => this.adapterChoices().length > 0 || !!this.store.settings().adapter);

  /** The message to show for a field: the client's, else the server's. */
  protected error(field: TrackField): string | undefined {
    return this.errors()[field] ?? this.serverByField()[field];
  }

  /** What the title shows when empty: the id with spaces. */
  protected readonly titlePlaceholder = computed(() => (this.track()?.id ?? '').replace(/[_-]+/g, ' ').trim());
  /** The pictures of the project's sources a track can take as its cover (plus its own when it is no longer there). */
  protected readonly pictures = computed(() => {
    const names = this.store.sources().filter((s) => s.kind === 'image').map((s) => s.name);
    const own = this.track()?.cover;
    return own && own !== 'off' && !names.includes(own) ? [...names, own] : names;
  });

  protected patch(p: Partial<Track>): void {
    this.store.updateTrack(this.index(), p);
  }

  /**
   * Applies the assistant's proposal: the style goes into the prompt and the
   * lyrics into the lyrics; with HeartMuLa or DiffRhythm2 the tags go into the
   * tags too, so the track can be created without another step. An instrumental
   * track keeps its lyrics, and a proposal without lyrics or tags leaves the
   * track's own alone (the field then says that the tags are missing).
   */
  protected applyProposal(p: MusicProposal): void {
    const patch: Partial<Track> = { prompt: p.caption };
    if (p.lyrics && this.track()?.instrumental !== true) patch.lyrics = p.lyrics;
    this.tagsError.set('');
    if (this.service()) {
      if (p.tags) patch.tags = p.tags;
      else if (!this.track()?.tags) this.tagsError.set($localize`:@@music.tagsMissingFromProposal:The proposal brought no tags: write them or press the button to propose them from the style.`);
    }
    this.patch(patch);
  }

  /** Asks the assistant for the tags that describe the style of the track. */
  protected async deriveTags(): Promise<void> {
    const style = this.track()?.prompt?.trim();
    if (!style) return;
    this.tagsBusy.set(true);
    this.tagsError.set('');
    try {
      const res = await firstValueFrom(this.api.assist('tags', style));
      if (res.text) this.patch({ tags: res.text });
    } catch {
      this.tagsError.set($localize`:@@music.tagsFailed:They could not be suggested; write them by hand.`);
    } finally {
      this.tagsBusy.set(false);
    }
  }

  /** Reads a song or a video and proposes its lyrics, language, style, tags, tempo and key for this track. */
  protected openExtract(): void {
    this.dialog.open<ExtractDialogComponent, ExtractDialogData, boolean>(ExtractDialogComponent, {
      data: { index: this.index() },
      viewContainerRef: this.vcr,
      width: '1040px',
      maxWidth: '95vw',
      disableClose: false,
    });
  }

  protected setNumber(field: NumberField, raw: string): void {
    const text = raw.trim();
    const value = text === '' ? undefined : Number(text);
    this.patch({ [field]: value === undefined || Number.isNaN(value) ? undefined : value });
  }
}
