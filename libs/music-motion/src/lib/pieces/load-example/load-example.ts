import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { type Dataset, validateDataset } from '../../animation/dataset';
import { BUILT_IN_PART_NAMES } from '../../animation/fixtures';
import { IN_MEMORY_ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** The largest dataset file the import reads. */
const MAX_FILE_BYTES = 1024 * 1024;
const SHOWN = 10;

/**
 * The actions that fill the in-memory adapter with a dataset: the built-in one (songs, pieces in their states, references, styles
 * and parts, with one real video) or a JSON file the person chooses. It draws nothing when the screens talk to a server, so a real
 * server is never offered them nor sent anything; a file is read in the browser and goes nowhere.
 */
@Component({
  selector: 'app-load-example',
  templateUrl: './load-example.html',
  styleUrl: './load-example.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadExample {
  private readonly memory = inject(IN_MEMORY_ANIMATION, { optional: true });
  protected readonly available = !!this.memory;
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).pieces;
  /** What was done last: the built-in dataset was loaded, or a file was imported. */
  protected readonly done = signal<'' | 'example' | 'import'>('');
  /** Why the last file was refused: the first problems, and how many more there were. */
  protected readonly problems = signal<readonly string[]>([]);
  protected readonly more = signal(0);

  protected load(): void {
    this.problems.set([]);
    this.memory?.loadSample().subscribe(() => this.done.set('example'));
  }

  protected async import(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.memory) return;
    this.done.set('');
    const refuse = (list: readonly string[], more = 0): void => {
      this.problems.set(list);
      this.more.set(more);
    };
    if (file.size > MAX_FILE_BYTES) return refuse([this.t.importTooBig]);
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return refuse([this.t.importUnreadable]);
    }
    const found = validateDataset(json, BUILT_IN_PART_NAMES, this.lang);
    if (found.length) return refuse(found.slice(0, SHOWN), Math.max(0, found.length - SHOWN));
    refuse([]);
    this.memory.loadDataset(json as Dataset).subscribe(() => this.done.set('import'));
  }
}
