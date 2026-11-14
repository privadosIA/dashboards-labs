import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { MotionDesign } from '../../core/api.models';
import { MotionCatalogStore } from '../../core/motion-catalog.store';
import { EditorStore } from '../editor.store';
import { MAX_MOTION_BPM, MIN_MOTION_BPM } from '../scene-form/dynamic/validations';

/** The styles of a verse and of a word hit the server knows (the empty choice is the plain one: nothing is written). */
export const VERSE_STYLES = ['plain', 'highlight', 'karaoke', 'glow'] as const;
export const HIT_STYLES = ['plain', 'metal', 'glow'] as const;

type Colour = 'dark' | 'light' | 'accent';

/**
 * What the scenes drawn by a part of the catalog share: the tempo they follow when they name none, the design they are drawn
 * with and a song of the project's sources that they follow and that is their soundtrack. Everything is optional, and what is
 * left empty is not written.
 */
@Component({
  selector: 'app-motion-defaults-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule, MatExpansionModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './motion-defaults-panel.component.html',
  styleUrl: './motion-defaults-panel.component.scss',
})
export class MotionDefaultsPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly catalog = inject(MotionCatalogStore);

  protected readonly minBpm = MIN_MOTION_BPM;
  protected readonly maxBpm = MAX_MOTION_BPM;
  protected readonly verseStyles = VERSE_STYLES;
  protected readonly hitStyles = HIT_STYLES;

  protected readonly motion = computed(() => this.store.config()?.defaults.motion);
  protected readonly design = computed<MotionDesign>(() => this.motion()?.design ?? {});
  /** Offered in a video project when the server has the catalog, or when the project already says something about it. */
  protected readonly shown = computed(() => {
    const c = this.store.config();
    return !!c && c.output.mode !== 'images' && (this.catalog.available() || !!c.defaults.motion);
  });
  /** The editor's own check of what is written here; the server judges the rest (the contrast of the accent). */
  protected readonly error = computed(() => this.store.validation()?.defaults.motion);
  /** The server's rejection about this block, shown here instead of only at the top. */
  protected readonly serverMessage = computed(() => {
    const m = this.store.serverError()?.message ?? '';
    return m.split('\n').filter((l) => l.includes('motion')).join('\n');
  });
  protected readonly songMissing = computed(() => {
    const song = this.motion()?.song;
    return !!song && !this.store.audioSources().some((s) => s.name === song);
  });
  protected readonly summary = computed(() => {
    const m = this.motion();
    if (!m) return $localize`:@@motionDefaults.summaryNone:no changes`;
    const parts = [
      m.bpm !== undefined ? `${m.bpm}` : '',
      m.design ? $localize`:@@motionDefaults.summaryDesign:design` : '',
      m.song ?? '',
    ].filter(Boolean);
    return parts.join(' · ');
  });

  protected setBpm(raw: string): void {
    const text = raw.trim();
    const n = text === '' ? undefined : Number(text);
    this.store.updateMotionDefaults({ bpm: n === undefined || Number.isNaN(n) ? undefined : n });
  }

  protected setSong(name: string): void {
    this.store.updateMotionDefaults({ song: name || undefined });
  }

  protected setColour(key: Colour, raw: string): void {
    this.store.updateMotionDesign({ [key]: raw.trim() });
  }

  protected setFont(key: 'display' | 'body', name: string): void {
    this.store.updateMotionDesign({ [key]: name });
  }

  protected setMode(mode: string): void {
    this.store.updateMotionDesign({ default_mode: mode === 'light' || mode === 'dark' ? mode : undefined });
  }

  protected setConcept(raw: string): void {
    this.store.updateMotionDesign({ concept: raw.trim() });
  }

  /** Plain is what the server does when the field is missing, so it is not written. */
  protected setVerse(style: string): void {
    this.store.updateMotionDesign({ verse_style: style === 'plain' ? undefined : style });
  }

  protected setHit(style: string): void {
    this.store.updateMotionDesign({ hit_style: style === 'plain' ? undefined : style });
  }

  protected styleLabel(style: string): string {
    switch (style) {
      case 'highlight':
        return $localize`:@@motionDefaults.styleHighlight:Highlight`;
      case 'karaoke':
        return $localize`:@@motionDefaults.styleKaraoke:Karaoke`;
      case 'glow':
        return $localize`:@@motionDefaults.styleGlow:Glow`;
      case 'metal':
        return $localize`:@@motionDefaults.styleMetal:Metal`;
      default:
        return $localize`:@@motionDefaults.stylePlain:Plain`;
    }
  }
}
