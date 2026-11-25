import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ModelCard, Thumbnails, modelLibraryTexts } from '@lab/model-library-kit';

import { activeLang } from '../../core/language';
import { styleLabel } from '../../editor/quality-tiers';
import { PhaseStripComponent } from '../../runs/phase-strip/phase-strip.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { EntryFormComponent } from '../entry-form/entry-form.component';
import { Models3dProjectStore, type ModelsManifestLine } from '../models3d-project.store';
import type { ModelEntry } from '../../core/api.models';

/** A line of what was made, with the model of the library it became (its picture and what it is). */
export interface MadeModel {
  line: ModelsManifestLine;
  model: ReturnType<Models3dProjectStore['models']>[number] | undefined;
}

/**
 * The page of a project of 3D models: its entries (a text or a picture of one object each), the engine and the detail they use by default, the run that makes the models (followed as it goes) and what it made: each model with its picture,
 * what it was made with and a download. A project that is not of this mode is sent to the scene editor, which is where its scenes live.
 */
@Component({
  selector: 'app-models3d-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelComponent, EmptyStateComponent, PhaseStripComponent, EntryFormComponent, ModelCard, MatButtonModule, MatIconModule, RouterLink],
  providers: [Models3dProjectStore, Thumbnails],
  templateUrl: './models3d-page.component.html',
  styleUrl: './models3d-page.component.scss',
})
export class Models3dPageComponent implements OnInit {
  readonly id = input.required<string>();
  protected readonly store = inject(Models3dProjectStore);
  protected readonly styleLabel = styleLabel;
  /** The names the engines go by (product names, the same in both languages). */
  protected readonly engineNames = { triposr: 'TripoSR (MIT)', sf3d: 'Stable Fast 3D' };
  private readonly kit = modelLibraryTexts(activeLang());

  /** What a finished run made, each line with its model of the library. */
  protected readonly made = computed<MadeModel[]>(() => {
    const models = this.store.models();
    return this.store.manifest().map((line) => ({ line, model: models.find((m) => m.entry === line.name) }));
  });

  /** Why the run did not start or failed, in words when the server said which engine lacked what. */
  protected readonly runIssue = computed(() => {
    const message = this.store.runProblem();
    if (!message) return null;
    // the server says `the 3D engine sf3d cannot be used (not_built): …`
    const reason = /cannot be used\s*\((\w+)\)|cannot be used:\s*(\w+)/.exec(message)?.slice(1).find(Boolean);
    const known = reason ? this.kit.making.engines.reasons[reason] : undefined;
    return { message, words: known ?? '', engine: reason !== undefined || /3D service|engine/i.test(message) };
  });

  protected readonly state = computed(() => this.store.stream()?.state()?.state ?? (this.store.running() ? 'queued' : ''));

  ngOnInit(): void {
    void this.store.load(this.id());
  }

  protected refusal(index: number): string {
    return this.store.serverEntry() === index ? this.store.serverError() : '';
  }

  protected general(): string {
    return this.store.serverEntry() < 0 ? this.store.serverError() : '';
  }

  protected add(): void {
    this.store.addEntry();
  }

  protected change(index: number, entry: ModelEntry): void {
    this.store.setEntry(index, entry);
  }

  protected async upload(index: number, file: File): Promise<void> {
    const name = await this.store.uploadPicture(file);
    if (name) this.store.updateEntry(index, { image: name, prompt: undefined, variants: undefined });
  }

  protected setLook(value: string): void {
    if (value) this.store.setStyle(value as never);
  }

  protected setDefault(key: 'engine' | 'detail', value: string): void {
    this.store.setDefaults({ [key]: value || undefined });
  }

  protected save(): void {
    void this.store.save();
  }

  protected run(only?: string): void {
    void this.store.launch(only);
  }

  protected cancel(): void {
    void this.store.cancel();
  }

  /** `triposr (triposr@3f1c9a2)`: the engine and, when the server said it, its version. */
  protected engineOf(line: ModelsManifestLine): string {
    return line.engine_version ? `${line.engine} (${line.engine_version})` : line.engine;
  }

  /** Seconds a model took, to a tenth. */
  protected secondsText(seconds: number): number {
    return Math.round(seconds * 10) / 10;
  }

  protected download(file: string): string {
    return this.store.downloadUrl(file);
  }
}
