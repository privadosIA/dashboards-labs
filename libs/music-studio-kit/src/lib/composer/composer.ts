import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { firstValueFrom, switchMap } from 'rxjs';

import { CustomForm } from '../custom-form/custom-form';
import { EasyForm } from '../easy-form/easy-form';
import { EngineControl } from '../engines/engine-control';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { type Option, withOptions } from '../shared/with-options';
import { SongDraftStore } from '../song/draft.store';
import { GENERATORS, GENERATOR_LABELS, GENERATOR_ORDER, defaultGenerator, isStopped } from '../song/generators';
import type { GeneratorName, Mode, SongRequest } from '../song/model';
import { SongRefused } from '../song/port';
import { validateCustom } from '../song/validate';
import { SONGS } from '../song/tokens';
import { SongWriter } from '../song/writer.service';
import en from './dynamic/generator.en.json';
import es from './dynamic/generator.es.json';

/**
 * The form side of the page: the Easy / Custom switch, the form of the mode, the generator and the Generate button with
 * what is still missing. A song asked for appears in My songs through the port, so the composer shows only whether the
 * request was accepted.
 */
@Component({
  selector: 'app-composer',
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
  imports: [CustomForm, EasyForm, DynamicFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Composer {
  protected readonly store = inject(SongDraftStore);
  private readonly port = inject(SONGS);
  private readonly writer = inject(SongWriter);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly baseSchema = pickSchema('generator', { en, es }, this.lang);

  private readonly control = inject(EngineControl);
  /** The engines are read again whenever one starts, stops or comes up. */
  protected readonly engines = toSignal(toObservable(this.control.version).pipe(switchMap(() => this.port.engines())), { initialValue: [] });
  /** The engine the user picked at least once: from then on the default no longer replaces it. */
  private chosen = false;
  /** The server has said which generators it can use: until then the default is a guess, and a song would be made with it. */
  protected readonly ready = computed(() => this.engines().length > 0);
  protected readonly selected = computed(() => this.engines().find((e) => e.generator === this.store.generator()));
  protected readonly schema = computed(() => {
    const options: Option[] = GENERATOR_ORDER.map((g) => {
      const engine = this.engines().find((e) => e.generator === g);
      if (engine?.available !== false) return { value: g, label: GENERATOR_LABELS[g] };
      // a stopped one can still be chosen (and started); one that is broken cannot
      return isStopped(engine) ? { value: g, label: `${GENERATOR_LABELS[g]} ${this.t.composer.stopped}` } : { value: g, label: `${GENERATOR_LABELS[g]} ${this.t.composer.unavailable}`, disabled: true };
    });
    // the default is the generator in the draft: the form takes it again whenever it is redrawn instead of going back to another
    return withOptions(this.baseSchema, 'generator', options, this.store.generator());
  });
  protected readonly generatorModel = signal<Record<string, unknown>>({ generator: this.store.generator() });
  /** Why the chosen generator cannot be used, in words; null when it can. */
  protected readonly reason = computed(() => {
    const engine = this.selected();
    if (!engine || engine.available) return null;
    return this.t.composer.engineReasons[engine.reason ?? ''] ?? this.t.composer.unknownReason;
  });
  protected readonly blockers = computed(() => [...(this.store.mode() === 'custom' ? this.store.customProblems() : this.store.easyProblems()), ...(this.selected()?.available === false ? (['generator.unavailable'] as const) : [])]);
  protected readonly todo = computed(() => this.blockers().map((b) => this.t.composer.todo[b]).join(', '));
  /** The container of the chosen generator is stopped: it can be started from here. */
  protected readonly canStart = computed(() => isStopped(this.selected()));
  protected readonly starting = computed(() => this.control.starting().has(this.store.generator()));
  protected readonly submitting = signal(false);
  protected readonly error = signal<'refused' | 'failed' | null>(null);

  constructor() {
    // until the user picks one, the best generator the server can use is the one chosen
    effect(() => {
      const engines = this.engines();
      if (engines.length && !this.chosen) untracked(() => this.store.setGenerator(defaultGenerator(engines)));
    });
    effect(() => {
      const generator = this.store.generator();
      untracked(() => {
        if (this.generatorModel()['generator'] !== generator) this.generatorModel.set({ generator });
      });
    });
    effect(() => {
      const picked = this.generatorModel()['generator'] as GeneratorName | undefined;
      untracked(() => {
        if (picked && picked !== this.store.generator()) {
          this.chosen = true;
          this.store.setGenerator(picked);
        }
      });
    });
  }

  /** Starts the stopped generator; the engines are read again every few seconds until it is up (or a couple of minutes pass). */
  protected async start(): Promise<void> {
    if (this.starting()) return;
    try {
      await this.control.start(this.store.generator());
    } catch {
      this.error.set('failed');
    }
  }

  protected setMode(mode: Mode): void {
    this.store.setMode(mode);
  }

  /** Easy: the assistant writes the song from the prompt; null when it could not (the form says why). */
  private async writeEasy(): Promise<SongRequest | null> {
    const generator = this.store.generator();
    const written = await this.writer.write({ text: this.store.prompt().trim(), generator, instrumental: this.store.instrumental() && GENERATORS[generator].instrumental });
    if (!written) return null;
    const request = this.store.easyRequest(written);
    // the server refuses a song for a tag generator without style tags: when the assistant gave none, the user adds them in Custom
    if (validateCustom(request).includes('style.required')) {
      this.store.adoptFromEasy(written);
      return null;
    }
    return request;
  }

  protected async generate(): Promise<void> {
    if (!this.ready() || this.blockers().length || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const request = this.store.mode() === 'custom' ? this.store.request() : await this.writeEasy();
      if (request) await firstValueFrom(this.port.generate(request));
    } catch (err) {
      this.error.set(err instanceof SongRefused ? 'refused' : 'failed');
    } finally {
      this.submitting.set(false);
    }
  }
}
