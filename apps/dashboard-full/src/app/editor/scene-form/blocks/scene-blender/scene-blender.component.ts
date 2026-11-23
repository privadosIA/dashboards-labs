import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { firstValueFrom } from 'rxjs';

import { BlenderDescription } from '../../../../core/api.models';
import { ApiService } from '../../../../core/api.service';
import { schemaFor } from '../../../../shared/dynamic/schema-loader';
import { EditorStore } from '../../../editor.store';
import { BlenderCall, MAX_IDEA, MAX_SECONDS, MIN_SECONDS, blenderProblem, jsonProblem, readableError } from './blender-problem';
import formsEn from './dynamic/forms.en.json';
import formsEs from './dynamic/forms.es.json';

/** The length a scene gets when nothing says how long it is. */
const DEFAULT_SECONDS = 5;

/** The description as the editor shows it. */
const pretty = (description: Record<string, unknown>): string => JSON.stringify(description, null, 2);

/**
 * The section of a 3D scene: a model writes (or changes) the description of what Blender builds from an idea, the description is edited and
 * saved by hand as JSON, and a cheap frame of it is drawn to look at before rendering. The description lives in the project's `sources/`
 * under the name the scene gives in `blender.build`; the scene's own length is the one the descriptions are checked against.
 */
@Component({
  selector: 'app-scene-blender',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatIconModule, MatSliderModule, AutoAnimateDirective],
  templateUrl: './scene-blender.component.html',
  styleUrl: './scene-blender.component.scss',
})
export class SceneBlenderComponent {
  readonly sceneId = input.required<string>();
  /** The description's file name in `sources/` (`blender.build` of the scene). */
  readonly build = input.required<string>();
  /** The length of the scene when it has its own (a silent scene); otherwise the person says it. */
  readonly sceneSeconds = input<number | undefined>(undefined);

  private readonly api = inject(ApiService);
  private readonly store = inject(EditorStore);

  protected readonly schema = computed<DfFormSchema>(() => schemaFor({ es: formsEs, en: formsEn }));
  protected readonly model = signal<Record<string, unknown>>({ idea: '', seconds: DEFAULT_SECONDS });
  protected readonly stored = signal<BlenderDescription | null>(null);
  /** The text of the editor: what was stored, or what the person is typing. */
  protected readonly text = signal('');
  /** The text before the last write or change, to put back. */
  protected readonly previous = signal<string | null>(null);
  protected readonly written = signal<{ model: string; attempts: number } | null>(null);
  protected readonly busy = signal<'' | 'loading' | 'writing' | 'saving' | 'previewing'>('');
  protected readonly problems = signal<Record<BlenderCall, string>>({ write: '', save: '', preview: '' });
  protected readonly t = signal(0);
  protected readonly frame = signal('');

  protected readonly seconds = computed(() => {
    const n = Number(this.model()['seconds']);
    return Number.isFinite(n) ? n : NaN;
  });
  protected readonly secondsOk = computed(() => this.seconds() >= MIN_SECONDS && this.seconds() <= MAX_SECONDS);
  protected readonly idea = computed(() => String(this.model()['idea'] ?? '').trim());
  protected readonly ideaOk = computed(() => this.idea() !== '' && this.idea().length <= MAX_IDEA);
  protected readonly exists = computed(() => this.stored() !== null);
  protected readonly textDirty = computed(() => {
    const s = this.stored();
    return s !== null && this.text() !== pretty(s.description);
  });
  protected readonly canAsk = computed(() => this.busy() === '' && this.ideaOk() && this.secondsOk());
  protected readonly canSave = computed(() => this.busy() === '' && this.secondsOk() && this.text().trim() !== '');

  constructor() {
    effect(() => {
      const id = this.sceneId();
      const build = this.build();
      const own = this.sceneSeconds();
      untracked(() => void this.open(id, build, own));
    });
    inject(DestroyRef).onDestroy(() => this.dropFrame());
  }

  /** A scene opens with what its file holds (nothing yet when it was never written). */
  private async open(id: string, build: string, own: number | undefined): Promise<void> {
    this.dropFrame();
    this.stored.set(null);
    this.text.set('');
    this.previous.set(null);
    this.written.set(null);
    this.t.set(0);
    this.problems.set({ write: '', save: '', preview: '' });
    this.model.set({ idea: '', seconds: own ?? DEFAULT_SECONDS });
    this.busy.set('loading');
    try {
      const found = await firstValueFrom(this.api.getBlenderDescription(this.store.projectId(), build));
      if (id !== this.sceneId() || build !== this.build()) return;
      this.stored.set(found);
      this.text.set(pretty(found.description));
      await this.refreshFrame();
    } catch {
      // A scene whose file was never written has nothing to read: the section starts empty.
    } finally {
      this.busy.set('');
    }
  }

  protected setProblem(call: BlenderCall, text: string): void {
    this.problems.update((p) => ({ ...p, [call]: text }));
  }

  /** Writes the description from the idea, or changes the stored one with it (`revise`). */
  protected async ask(revise: boolean): Promise<void> {
    if (!this.canAsk()) return;
    this.busy.set('writing');
    this.setProblem('write', '');
    try {
      const answer = await firstValueFrom(this.api.writeBlenderDescription(this.store.projectId(), this.build(), this.idea(), this.seconds(), revise));
      const before = this.stored();
      this.previous.set(before ? pretty(before.description) : null);
      this.stored.set(answer);
      this.text.set(pretty(answer.description));
      this.written.set({ model: answer.model, attempts: answer.attempts });
      this.setProblem('save', '');
      this.model.update((m) => ({ ...m, idea: '' }));
      await this.refreshFrame();
    } catch (e) {
      this.setProblem('write', blenderProblem(await readableError(e), 'write'));
    } finally {
      this.busy.set('');
    }
  }

  /** Saves the text of the editor; text that is not JSON is not sent. */
  protected async save(): Promise<void> {
    const slip = jsonProblem(this.text());
    if (slip) {
      this.setProblem('save', slip);
      return;
    }
    await this.put(JSON.parse(this.text()) as Record<string, unknown>);
  }

  /** Puts back the text from before the last write or change. */
  protected async undo(): Promise<void> {
    const back = this.previous();
    if (back === null) return;
    await this.put(JSON.parse(back) as Record<string, unknown>);
    if (this.problems().save === '') this.previous.set(null);
  }

  /** Stores a description by hand (the editor's text, or the one put back). */
  private async put(description: Record<string, unknown>): Promise<void> {
    this.busy.set('saving');
    this.setProblem('save', '');
    try {
      const saved = await firstValueFrom(this.api.saveBlenderDescription(this.store.projectId(), this.build(), description, this.seconds()));
      this.stored.set(saved);
      this.text.set(pretty(saved.description));
      await this.refreshFrame();
    } catch (e) {
      this.setProblem('save', blenderProblem(await readableError(e), 'save'));
    } finally {
      this.busy.set('');
    }
  }

  /** Draws the frame at the chosen second. */
  protected async refreshFrame(): Promise<void> {
    if (!this.exists() || !this.secondsOk()) return;
    const previous = this.busy();
    if (previous === '') this.busy.set('previewing');
    this.setProblem('preview', '');
    try {
      const png = await firstValueFrom(this.api.previewBlenderDescription(this.store.projectId(), this.build(), Math.min(this.t(), this.seconds()), this.seconds()));
      this.dropFrame();
      this.frame.set(URL.createObjectURL(png));
    } catch (e) {
      this.dropFrame();
      this.setProblem('preview', blenderProblem(await readableError(e), 'preview'));
    } finally {
      if (previous === '') this.busy.set('');
    }
  }

  protected setTime(t: number): void {
    this.t.set(t);
  }

  protected setText(value: string): void {
    this.text.set(value);
  }

  private dropFrame(): void {
    const url = this.frame();
    if (url) URL.revokeObjectURL(url);
    this.frame.set('');
  }
}
