import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

import { MusicTagCategory } from '../../core/api.models';

/** The labels of the categories of the vocabulary; the ids are the server's. */
const CATEGORY_LABELS: Record<string, string> = {
  genre: $localize`:@@tags.genre:Genre`,
  mood: $localize`:@@tags.mood:Mood`,
  instrument: $localize`:@@tags.instrument:Instruments`,
  tempo: $localize`:@@tags.tempo:Tempo`,
  vocal: $localize`:@@tags.vocal:Vocals`,
  era: $localize`:@@tags.era:Era`,
  production: $localize`:@@tags.production:Production`,
};

/**
 * The style tags of a HeartMuLa song as chips: the ones in use can be removed with a tap and more are added
 * from the vocabulary, by category, so nobody has to type English words on a phone. The value is the text
 * the track stores ("techno,rap,fast").
 */
@Component({
  selector: 'app-tag-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, MatExpansionModule, MatIconModule],
  templateUrl: './tag-picker.component.html',
  styleUrl: './tag-picker.component.scss',
})
export class TagPickerComponent {
  readonly value = input('');
  readonly categories = input<MusicTagCategory[]>([]);
  readonly valueChange = output<string>();

  protected readonly selected = computed(() =>
    this.value()
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== ''),
  );

  protected label(id: string): string {
    return CATEGORY_LABELS[id] ?? id;
  }

  protected has(tag: string): boolean {
    return this.selected().includes(tag);
  }

  protected toggle(tag: string): void {
    const list = this.selected();
    this.valueChange.emit((list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]).join(','));
  }
}
