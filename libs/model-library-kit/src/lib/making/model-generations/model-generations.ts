import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AutoAnimateDirective } from '@lab/motion-ui';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { Generation } from '../../port';
import { ModelViewer } from '../../viewer/open-viewer';
import { MakingStore } from '../making.store';

/** The generations, newest first: state and step while one runs, what it was made from, the engine, the error in the server's words; cancel a queued or running one, take a finished one off the list (its model stays) and go to the model of a done one. */
@Component({
  selector: 'lab-model-generations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, AutoAnimateDirective],
  templateUrl: './model-generations.html',
  styleUrl: './model-generations.scss',
})
export class ModelGenerations {
  protected readonly store = inject(MakingStore);
  protected readonly t = textsFor(inject(LanguageService).lang).making.generations;
  /** The id (`<pack>/<name>`) of the model of a generation that is done: the host takes the person to it. */
  readonly showModel = output<string>();
  protected readonly removing = signal<string | null>(null);
  protected readonly v = textsFor(inject(LanguageService).lang).viewer;
  private readonly viewer = inject(ModelViewer);

  protected look(id: string): void {
    const [pack, ...rest] = id.split('/');
    this.viewer.open({ pack, name: rest.join('/') });
  }

  protected live(g: Generation): boolean {
    return g.state === 'queued' || g.state === 'running';
  }

  protected cancel(id: string): void {
    void this.store.cancelGeneration(id);
  }

  protected async remove(id: string): Promise<void> {
    await this.store.removeGeneration(id);
    this.removing.set(null);
  }
}
