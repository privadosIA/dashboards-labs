import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { addLine, availableLines, lineEnd, lineStart, lineText, removeLine, setLineKeyword, setLineText, setLineTimes, wordsOfText, type ScriptPiece, type SongMap } from '@lab/animation-core';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { onScript, type EditRequest } from '../edit';

interface LineRow {
  readonly n: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly keyword: string;
  readonly words: readonly string[];
}

/** The lyrics a piece shows: each line's text, when it is on screen and its keyword; add a line of the song or a text of your own, or remove one. */
@Component({
  selector: 'app-lines-editor',
  templateUrl: './lines-editor.html',
  styleUrl: './lines-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinesEditor {
  readonly piece = input.required<ScriptPiece>();
  /** Where the piece is in the script. */
  readonly index = input.required<number>();
  readonly script = input.required<{ readonly version: 1; readonly pieces: readonly ScriptPiece[] }>();
  readonly songMap = input.required<Pick<SongMap, 'words'>>();
  readonly locked = input(false);
  readonly edit = output<EditRequest>();

  protected readonly t = textsFor(inject(LanguageService).lang).editing;
  protected readonly rows = computed<readonly LineRow[]>(() =>
    (this.piece().lines ?? []).map((l, n) => {
      const text = lineText(l, this.songMap());
      return { n, text, start: lineStart(l, this.songMap()) ?? this.piece().start, end: lineEnd(l, this.songMap()) ?? this.piece().end, keyword: l.keyword ?? '', words: [...new Set(wordsOfText(text))] };
    }),
  );
  protected readonly available = computed(() => availableLines(this.script(), this.index(), this.songMap()));
  protected readonly freeOpen = signal(false);

  protected setText(n: number, value: string): void {
    if (value.trim()) this.edit.emit(onScript((s) => setLineText(s, this.index(), n, value, this.songMap()), `line-text-${this.piece().id}-${n}`));
  }

  protected setTimes(n: number, start: string, end: string): void {
    this.edit.emit(onScript((s) => setLineTimes(s, this.index(), n, Number(start), Number(end), this.songMap()), `line-times-${this.piece().id}-${n}`));
  }

  protected setKeyword(n: number, value: string): void {
    this.edit.emit(onScript((s) => setLineKeyword(s, this.index(), n, value, this.songMap())));
  }

  protected remove(n: number): void {
    this.edit.emit(onScript((s) => removeLine(s, this.index(), n, this.songMap())));
  }

  protected addFromSong(value: string): void {
    if (value === '') return;
    this.edit.emit(onScript((s) => addLine(s, this.index(), { line: Number(value) }, this.songMap())));
  }

  protected addFree(text: string): void {
    const p = this.piece();
    if (!text.trim()) return;
    const start = Math.round(p.start * 100) / 100;
    const end = Math.round(Math.min(p.end, p.start + Math.max(1, Math.min(4, (p.end - p.start) / 2))) * 100) / 100;
    this.edit.emit(onScript((s) => addLine(s, this.index(), { text: text.trim(), start, end }, this.songMap())));
    this.freeOpen.set(false);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
