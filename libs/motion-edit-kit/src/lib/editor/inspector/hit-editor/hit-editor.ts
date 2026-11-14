import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { hitWordsIn, setHit, type ScriptPiece, type SongMap } from '@lab/animation-core';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { onScript, type EditRequest } from '../edit';

/** The word that fills the screen for a moment: which word of the piece's lines, when, and for how long. */
@Component({
  selector: 'app-hit-editor',
  templateUrl: './hit-editor.html',
  styleUrl: './hit-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HitEditor {
  readonly piece = input.required<ScriptPiece>();
  readonly index = input.required<number>();
  readonly songMap = input.required<Pick<SongMap, 'words'>>();
  readonly locked = input(false);
  readonly edit = output<EditRequest>();

  protected readonly t = textsFor(inject(LanguageService).lang).editing;
  protected readonly words = computed(() => hitWordsIn(this.piece(), this.songMap()));

  protected setWord(word: string): void {
    const p = this.piece();
    if (word === '') {
      this.edit.emit(onScript((s) => setHit(s, this.index(), null)));
      return;
    }
    const base = p.hit ?? { word, at: p.start, length: 1 };
    this.edit.emit(onScript((s) => setHit(s, this.index(), { ...base, word })));
  }

  protected setTimes(at: string, length: string): void {
    const p = this.piece();
    if (!p.hit) return;
    this.edit.emit(onScript((s) => setHit(s, this.index(), { word: p.hit!.word, at: Number(at), length: Number(length) }), `hit-${p.id}`));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
