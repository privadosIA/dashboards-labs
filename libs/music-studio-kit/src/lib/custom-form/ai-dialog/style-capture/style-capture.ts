import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { type Observable, firstValueFrom } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { EnginesPanel } from '../../../engines/engines-panel';
import { SongDraftStore } from '../../../song/draft.store';
import { isYoutubeUrl } from '../../../song/youtube';
import { DEFAULT_LISTEN, type ListenOptions, defaultMethod } from '../../../song/listen';
import { type Option, withOptions } from '../../../shared/with-options';
import type { Heard } from '../../../song/model';
import { ListenFailed } from '../../../song/port';
import { MAX_CAPTURED_TAGS, tagsInText } from '../../../song/style';
import { SONGS } from '../../../song/tokens';
import en from './dynamic/capture.en.json';
import es from './dynamic/capture.es.json';

/** Importing a song or a video: the server listens to a piece of it, and the style it hears is added to the style of the form. */
@Component({
  selector: 'app-style-capture',
  imports: [DynamicFormComponent, DfSlotDirective],
  templateUrl: './style-capture.html',
  styleUrl: './style-capture.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleCapture {
  private readonly store = inject(SongDraftStore);
  private readonly port = inject(SONGS);
  private readonly engines = inject(EnginesPanel);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly base = pickSchema('capture', { en, es }, this.lang);
  private readonly recognizers = toSignal(this.port.recognizers(), { initialValue: [] });
  /** The way to recognise a song is the one that tells a style best until the user picks one. */
  private chosen = false;
  protected readonly schema = computed(() => {
    const options: Option[] = (['whisper', 'clap', 'muq'] as const).map((id) => {
      const r = this.recognizers().find((x) => x.id === id);
      if (id === 'whisper' || r?.available) return { value: id, label: this.t.capture.methods[id] };
      const why = this.t.capture.reasons[r?.reason ?? ''] ?? this.t.capture.unknownReason;
      // a method the server cannot run now cannot be chosen, and its label says why
      return { value: id, label: `${this.t.capture.methods[id]} (${why})`, disabled: true };
    });
    return withOptions(this.base, 'method', options, DEFAULT_LISTEN.method);
  });
  /** A way to recognise is only stopped: the Engines panel can start it. */
  protected readonly stopped = computed(() => this.recognizers().some((r) => !r.available && r.reason === 'not_running'));
  protected readonly model = signal<Record<string, unknown>>({ ...DEFAULT_LISTEN, url: '' });
  /** What the user chose for the import. */
  private readonly options = computed<ListenOptions>(() => {
    const m = this.model();
    const method = m['method'];
    return { method: method === 'clap' || method === 'muq' ? method : 'whisper', language: String(m['language'] ?? ''), hint: String(m['hint'] ?? '') };
  });
  protected readonly validUrl = computed(() => isYoutubeUrl(String(this.model()['url'] ?? '')));
  private readonly vocabulary = toSignal(this.port.vocabulary());

  /** Closed until the person opens it (so that the dialog fits its window), and open for as long as something is happening or was heard. */
  protected readonly open = signal(false);
  protected readonly listening = signal(false);
  protected readonly heard = signal<Heard | null>(null);
  /** The tags of what was heard that the style has now. */
  protected readonly added = signal<readonly string[]>([]);
  protected readonly error = signal<ListenFailed['kind'] | 'unknown' | null>(null);

  constructor() {
    effect(() => {
      if (this.listening() || this.heard() || this.error()) this.open.set(true);
    });
    // the sound is recognised too when the server can (MuQ-MuLan or LAION-CLAP), until the user chooses
    effect(() => {
      const recognizers = this.recognizers();
      untracked(() => {
        if (recognizers.length && !this.chosen && this.model()['method'] !== defaultMethod(recognizers)) this.model.update((m) => ({ ...m, method: defaultMethod(recognizers) }));
      });
    });
    effect(() => {
      const method = this.model()['method'];
      untracked(() => {
        if (this.recognizers().length && method !== defaultMethod(this.recognizers())) this.chosen = true;
      });
    });
  }

  protected openEngines(): void {
    this.engines.open();
  }

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.capture((options) => this.port.listen(file, options));
    input.value = '';
  }

  protected async fromUrl(): Promise<void> {
    if (!this.validUrl()) return;
    await this.capture((options) => this.port.listenUrl(String(this.model()['url']).trim(), this.store.generator(), options));
  }

  /** Listens by the way given and adds what it recognises to the style; a failure is explained and changes nothing. */
  private async capture(listen: (options: ListenOptions) => Observable<Heard>): Promise<void> {
    if (this.listening()) return;
    this.heard.set(null);
    this.added.set([]);
    this.error.set(null);
    this.listening.set(true);
    try {
      const options = this.options();
      const heard = await firstValueFrom(listen(options));
      const vocabulary = this.vocabulary() ?? { categories: [], combos: [] };
      // what the user said counts first, then what the server returned and what its sentence mentions
      const tags = [...new Set([...tagsInText(options.hint, vocabulary), ...(heard.tags ?? []), ...tagsInText(heard.style, vocabulary)])].slice(0, MAX_CAPTURED_TAGS);
      this.store.captureStyle(tags, heard.style);
      this.heard.set(heard);
      this.added.set(tags);
    } catch (err) {
      this.error.set(err instanceof ListenFailed ? err.kind : 'unknown');
    } finally {
      this.listening.set(false);
    }
  }
}
