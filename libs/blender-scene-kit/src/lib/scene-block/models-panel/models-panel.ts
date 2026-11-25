import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MODEL_PLACE_PORT, ModelPicker, type PlacedFile, libraryReason, modelLibraryTexts } from '@lab/model-library-kit';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** What `size` of a placed model means: its height (the default) or its largest dimension (`fit: "largest"`, for a flat or wide thing and for a model an engine made, which has no real size). */
export type Fit = 'height' | 'largest';

/** A model the person asked to place, and how its size is meant. */
export interface PlaceModel {
  readonly model: PlacedFile;
  readonly fit: Fit;
}

/**
 * The models the scene can place, kept in the place the host gives (a project's sources or a piece): what each one has (animations, triangles, the pictures it needs, and which of those are missing), upload a `.glb` or a
 * picture, add one from the library, remove one, and ask the block to place one in the description. The block shows it only where the host provides a `MODEL_PLACE_PORT`.
 */
@Component({
  selector: 'lab-scene-models',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, AutoAnimateDirective],
  templateUrl: './models-panel.html',
  styleUrl: './models-panel.scss',
})
export class SceneModels {
  /** The scene has a description to place the model in. */
  readonly canPlace = input(false);
  /** What the place is called in the picker's title. */
  readonly place = input<'project' | 'piece'>('project');
  /** The person asked for this model to be placed in the description. */
  readonly placeModel = output<PlaceModel>();

  private readonly port = inject(MODEL_PLACE_PORT);
  private readonly picker = inject(ModelPicker);
  private readonly injector = inject(Injector);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).models;
  private readonly libraryTexts = modelLibraryTexts(this.lang);

  protected readonly files = signal<readonly PlacedFile[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly confirming = signal<string | null>(null);
  /** What `size` means for the next model placed; the height unless the person says otherwise. */
  protected readonly fit = signal<Fit>('height');
  protected readonly models = computed(() => this.files().filter((f) => f.kind === 'model'));
  private readonly pictureNames = computed(() => new Set(this.files().filter((f) => f.kind === 'picture').map((f) => f.name)));

  constructor() {
    effect(() => {
      this.place();
      untracked(() => void this.reload());
    });
  }

  protected setFit(value: string): void {
    this.fit.set(value === 'largest' ? 'largest' : 'height');
  }

  protected place1(model: PlacedFile): void {
    this.placeModel.emit({ model, fit: this.fit() });
  }

  protected clipCount(model: PlacedFile): number {
    return model.clips?.length ?? 0;
  }

  protected needCount(model: PlacedFile): number {
    return model.needs?.length ?? 0;
  }

  /** The pictures a model names that are not among the place's files. */
  protected missing(model: PlacedFile): string[] {
    return (model.needs ?? []).filter((n) => !this.pictureNames().has(n));
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.files.set(await firstValueFrom(this.port.list()));
      this.problem.set('');
    } catch (e) {
      this.problem.set(libraryReason(e, this.libraryTexts));
    } finally {
      this.loading.set(false);
    }
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.problem.set('');
    try {
      await work();
    } catch (e) {
      this.problem.set(libraryReason(e, this.libraryTexts));
    } finally {
      this.busy.set(false);
    }
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (!file) return;
    await this.run(async () => {
      await firstValueFrom(this.port.upload(file.name, file));
      await this.reload();
    });
  }

  protected async remove(name: string): Promise<void> {
    this.confirming.set(null);
    await this.run(async () => {
      await firstValueFrom(this.port.remove(name));
      await this.reload();
    });
  }

  protected async add(): Promise<void> {
    const added = await this.picker.open(this.t.placeName[this.place()], this.injector);
    if (added.length > 0) await this.reload();
  }
}
