import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { TagVocabulary } from '../../song/model';
import { parseTags } from '../../song/style';

const POPULAR = 'popular';
const lower = (tag: string): string => tag.toLowerCase();

/**
 * The tags of the server's vocabulary as chips, in the dialog the style box opens: the categories (they wrap, they do not scroll) and the tags of
 * the one that is open (the popular combinations at first). It owns no text of the style: it says which tag was picked and the form changes the style.
 */
@Component({
  selector: 'app-style-tags',
  templateUrl: './style-tags.html',
  styleUrl: './style-tags.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleTags {
  readonly vocabulary = input.required<TagVocabulary>();
  /** The style as written: the chips of the tags it holds show as picked. */
  readonly style = input.required<string>();
  readonly toggle = output<string>();
  readonly combo = output<readonly string[]>();

  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly popular = POPULAR;
  /** The category the person chose; until then the popular combinations, or the first category when there are none. */
  private readonly chosen = signal('');
  protected readonly open = computed(() => this.chosen() || (this.vocabulary().combos.length ? POPULAR : (this.vocabulary().categories[0]?.id ?? '')));
  private readonly picked = computed(() => new Set(parseTags(this.style()).map(lower)));
  protected readonly tags = computed(() => this.vocabulary().categories.find((c) => c.id === this.open())?.tags ?? []);

  protected label(id: string): string {
    return this.t.style.categories[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
  }

  protected isPicked(tag: string): boolean {
    return this.picked().has(lower(tag));
  }

  /** A combination is on when every tag of it is in the style. */
  protected comboOn(tags: readonly string[]): boolean {
    return tags.every((tag) => this.isPicked(tag));
  }

  protected show(id: string): void {
    this.chosen.set(id);
  }
}
