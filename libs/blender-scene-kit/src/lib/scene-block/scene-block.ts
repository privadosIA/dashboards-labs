import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { type DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { MODEL_PLACE_PORT } from '@lab/model-library-kit';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { firstValueFrom } from 'rxjs';

import { BLENDER_AVAILABLE } from '../availability';
import { LanguageService } from '../core/language';
import { type PlaceModel, SceneModels } from './models-panel/models-panel';
import { textsFor } from '../core/texts';
import { BLENDER_SCENE_PORT, type SceneContext, type SceneDescription } from '../port';
import { type BlenderCall, MAX_IDEA, MAX_SECONDS, MIN_SECONDS, blenderProblem, jsonProblem } from '../problem';
import en from './dynamic/forms.en.json';
import es from './dynamic/forms.es.json';

/** The length a scene gets when nothing says how long it is. */
const DEFAULT_SECONDS = 5;

/** An id for an object made from a file name (`hero.glb` is `hero`), that no object of the scene has yet (`hero-2`). */
function freeId(file: string, objects: readonly Record<string, unknown>[]): string {
  const base = file.replace(/\.glb$/i, '') || 'model';
  const taken = new Set(objects.map((o) => o['id']));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** The description as the editor shows it. */
const pretty = (description: Record<string, unknown>): string => JSON.stringify(description, null, 2);

/**
 * The section of a 3D scene: a model writes (or changes) the description of what Blender builds from an idea, the description is edited and saved by hand as JSON, and a cheap frame of it is drawn to look at before
 * rendering. What a description is stored in, and how it is checked, is the host's: it gives the `BLENDER_SCENE_PORT`. The length of the scene is the one the descriptions are checked against: the person types it, or
 * the host fixes it (`fixedSeconds`) because the scene's length is something else's to say.
 */
@Component({
  selector: 'lab-blender-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatIconModule, MatSliderModule, AutoAnimateDirective, SceneModels],
  templateUrl: './scene-block.html',
  styleUrl: './scene-block.scss',
})
export class BlenderScene {
  /** What the scene is called to the host: the description's file name in a project, empty for a request that has none. The block starts over whenever it changes. */
  readonly scope = input('');
  /** Where the description lives: `project` (a file of it, which must exist before the project is saved) or `request` (it is sent with the one request). */
  readonly kind = input<'project' | 'request'>('project');
  /** The length of the scene when the scene has its own (a silent scene); otherwise the person says it. */
  readonly sceneSeconds = input<number | undefined>(undefined);
  /** The length the host decides (the request's duration): the field is not shown and this is what every call uses. */
  readonly fixedSeconds = input<number | undefined>(undefined);
  /** The shape of the frame (`16:9` by default), as the server names them. */
  readonly aspectRatio = input('16:9');
  /** A description to start from when the port has none for the scope (a request being repeated). */
  readonly initial = input<Record<string, unknown> | null>(null);
  /** The description the block holds, each time it changes: `null` until there is one. */
  readonly descriptionChange = output<Record<string, unknown> | null>();
  /** What the models' place is called (the panel's picker says it): a project's sources, or a piece. */
  readonly modelsPlace = input<'project' | 'piece'>('project');

  /** Nothing is drawn on a machine without Blender: the hosts do not mount the block there, and this is the last guard. */
  protected readonly ready = inject(BLENDER_AVAILABLE);
  private readonly port = inject(BLENDER_SCENE_PORT);
  /** Where the models live, when the host has a place for them (a project or a piece); a request with no project has none and the panel is not shown. */
  private readonly places = inject(MODEL_PLACE_PORT, { optional: true });
  protected readonly hasModels = computed(() => this.places !== null && (this.places.available?.() ?? true));
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly baseSchema = pickSchema('blender-idea', { en, es }, this.lang) as DfFormSchema;

  protected readonly schema = computed<DfFormSchema>(() => (this.fixedSeconds() === undefined ? this.baseSchema : ({ ...this.baseSchema, fields: this.baseSchema.fields.filter((f) => !('key' in f) || f.key !== 'seconds') } as DfFormSchema)));
  protected readonly model = signal<Record<string, unknown>>({ idea: '', seconds: DEFAULT_SECONDS });
  protected readonly stored = signal<SceneDescription | null>(null);
  /** The text of the editor: what was stored, or what the person is typing. */
  protected readonly text = signal('');
  /** The text before the last write or change, to put back. */
  protected readonly previous = signal<string | null>(null);
  protected readonly written = signal<{ model: string; attempts: number } | null>(null);
  protected readonly busy = signal<'' | 'loading' | 'writing' | 'saving' | 'previewing'>('');
  protected readonly problems = signal<Record<BlenderCall, string>>({ write: '', save: '', preview: '' });
  protected readonly time = signal(0);
  protected readonly frame = signal('');
  /** The object a model was last placed as. */
  protected readonly placed = signal('');

  protected readonly seconds = computed(() => {
    const fixed = this.fixedSeconds();
    const n = fixed !== undefined ? fixed : Number(this.model()['seconds']);
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
  private readonly context = computed<SceneContext>(() => ({ scope: this.scope(), seconds: this.seconds(), aspectRatio: this.aspectRatio() }));

  constructor() {
    effect(() => {
      const scope = this.scope();
      const own = this.sceneSeconds();
      const initial = this.initial();
      untracked(() => void this.open(scope, own, initial));
    });
    effect(() => {
      const held = this.stored()?.description ?? null;
      untracked(() => this.descriptionChange.emit(held));
    });
    inject(DestroyRef).onDestroy(() => this.dropFrame());
  }

  /** A scene opens with what the host has for it (nothing yet when it was never written). */
  private async open(scope: string, own: number | undefined, initial: Record<string, unknown> | null): Promise<void> {
    this.dropFrame();
    this.stored.set(null);
    this.text.set('');
    this.previous.set(null);
    this.written.set(null);
    this.placed.set('');
    this.time.set(0);
    this.problems.set({ write: '', save: '', preview: '' });
    this.model.set({ idea: '', seconds: own ?? DEFAULT_SECONDS });
    this.busy.set('loading');
    try {
      const found = (await firstValueFrom(this.port.load(scope))) ?? (initial ? { description: initial } : null);
      if (scope !== this.scope()) return;
      if (found) {
        this.stored.set(found);
        this.text.set(pretty(found.description));
        await this.refreshFrame();
      }
    } catch {
      // A scene whose description was never written has nothing to read: the section starts empty.
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
      const before = this.stored();
      const answer = await firstValueFrom(this.port.write(this.context(), this.idea(), revise && before ? before.description : null));
      this.previous.set(before ? pretty(before.description) : null);
      this.stored.set(answer);
      this.text.set(pretty(answer.description));
      this.written.set({ model: answer.model, attempts: answer.attempts });
      this.setProblem('save', '');
      this.model.update((m) => ({ ...m, idea: '' }));
      await this.refreshFrame();
    } catch (e) {
      this.setProblem('write', blenderProblem(e, 'write', this.t.problem));
    } finally {
      this.busy.set('');
    }
  }

  /** Saves the text of the editor; text that is not JSON is not sent. */
  protected async save(): Promise<void> {
    const slip = jsonProblem(this.text(), this.t.problem);
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
      const saved = await firstValueFrom(this.port.save(this.context(), description));
      this.stored.set(saved);
      this.text.set(pretty(saved.description));
      await this.refreshFrame();
    } catch (e) {
      this.setProblem('save', blenderProblem(e, 'save', this.t.problem));
    } finally {
      this.busy.set('');
    }
  }

  /** Draws the frame at the chosen second. */
  protected async refreshFrame(): Promise<void> {
    const held = this.stored();
    if (!held || !this.secondsOk()) return;
    const previous = this.busy();
    if (previous === '') this.busy.set('previewing');
    this.setProblem('preview', '');
    try {
      const png = await firstValueFrom(this.port.preview(this.context(), held.description, Math.min(this.time(), this.seconds())));
      this.dropFrame();
      this.frame.set(URL.createObjectURL(png));
    } catch (e) {
      this.dropFrame();
      this.setProblem('preview', blenderProblem(e, 'preview', this.t.problem));
    } finally {
      if (previous === '') this.busy.set('');
    }
  }

  /**
   * Places a model in the description: an object with its file, a size of 1 (the height in metres, which the person sets), the first animation it has and a key at the origin. It goes through the same save as a hand edit, so
   * the server checks it (a clip, a picture, a missing file are refused by their place) and the one before can be put back.
   */
  protected async placeModel({ model, fit }: PlaceModel): Promise<void> {
    const slip = jsonProblem(this.text(), this.t.problem);
    if (slip) {
      this.setProblem('save', slip);
      return;
    }
    const before = JSON.parse(this.text()) as Record<string, unknown>;
    const objects = Array.isArray(before['objects']) ? [...(before['objects'] as Record<string, unknown>[])] : [];
    const id = freeId(model.name, objects);
    const clip = model.clips?.[0];
    objects.push({ id, type: 'model', file: model.name, size: 1, ...(fit === 'largest' ? { fit: 'largest' } : {}), ...(clip ? { animation: { clip } } : {}), keys: [{ t: 0, location: [0, 0, 0] }] });
    this.previous.set(pretty(before));
    this.text.set(pretty({ ...before, objects }));
    await this.save();
    this.placed.set(this.problems().save === '' ? id : '');
  }

  protected setTime(value: number): void {
    this.time.set(value);
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
