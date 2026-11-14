import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { CharCount } from '../shared/char-count/char-count';
import { SongDraftStore } from '../song/draft.store';
import type { VocalGender } from '../song/model';
import type { StructureTag } from '../song/sections';
import { voiceTagsOf } from '../song/style';
import { SONGS } from '../song/tokens';
import { TITLE_MAX } from '../song/validate';
import { AiDialog } from './ai-dialog/ai-dialog';
import { LyricsTools } from './lyrics-tools/lyrics-tools';
import { StyleTagsDialog } from './style-tags-dialog/style-tags-dialog';
import en from './dynamic/custom.en.json';
import es from './dynamic/custom.es.json';

type FormModel = Record<string, unknown>;

/**
 * The Custom form: title, lyrics with their tools, style with its tags and the vocal gender. The text lives in the draft
 * store (so Easy shares it); the form library draws the fields and the slots hold what it cannot: the title counter, the
 * structure tags and AI Generator under the lyrics, and the tag chips under the style.
 */
@Component({
  selector: 'app-custom-form',
  templateUrl: './custom-form.html',
  styleUrl: './custom-form.scss',
  imports: [DynamicFormComponent, DfSlotDirective, CharCount, LyricsTools],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomForm {
  protected readonly store = inject(SongDraftStore);
  private readonly dialog = inject(MatDialog);
  private readonly port = inject(SONGS);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly base = pickSchema('custom', { en, es }, this.lang);

  protected readonly titleMax = TITLE_MAX;
  protected readonly titleLength = computed(() => [...this.store.title()].length);
  protected readonly vocabulary = toSignal(this.port.vocabulary());
  protected readonly schema = this.base;
  /** The tags are offered for every generator: ACE-Step reads them as the words of its sentence. */
  protected readonly showChips = computed(() => !!this.vocabulary());
  protected readonly model = signal<FormModel>(this.fromStore());

  constructor() {
    effect(() => {
      const voice = this.vocabulary();
      if (voice) untracked(() => this.store.setVoiceTags(voiceTagsOf(voice)));
    });
    // the store changes under the form (a tag, an inserted section, what the assistant wrote): the form shows it
    effect(() => {
      const next = this.fromStore();
      untracked(() => {
        if (!this.same(next, this.model())) this.model.set(next);
      });
    });
    // the user types in the form: the store takes it
    effect(() => {
      const m = this.model();
      untracked(() => this.toStore(m));
    });
  }

  protected insert(tag: StructureTag): void {
    const area = this.host.querySelector<HTMLTextAreaElement>('[data-testid=lyrics]');
    const start = area?.selectionStart ?? this.store.lyrics().length;
    const end = area?.selectionEnd ?? start;
    const cursor = this.store.insertSection(start, end, tag);
    afterNextRender(
      () => {
        area?.focus();
        area?.setSelectionRange(cursor, cursor);
      },
      { injector: this.injector },
    );
  }

  /** AI Generator: the dialog where the lyrics are described; what it writes goes into the draft. */
  protected openAi(): void {
    this.dialog.open(AiDialog, { width: 'min(34rem, 92vw)', maxWidth: '92vw', autoFocus: 'first-tabbable', panelClass: 'studio-kit' });
  }

  /** The tags of the style, in a dialog of their own. */
  protected openTags(): void {
    this.dialog.open(StyleTagsDialog, { width: 'min(36rem, 92vw)', maxWidth: '92vw', autoFocus: 'first-tabbable', panelClass: 'studio-kit', data: { vocabulary: this.vocabulary()! } });
  }

  private fromStore(): FormModel {
    return { title: this.store.title(), lyrics: this.store.lyrics(), style: this.store.style(), gender: this.store.gender() };
  }

  private same(a: FormModel, b: FormModel): boolean {
    return a['title'] === b['title'] && a['lyrics'] === b['lyrics'] && a['style'] === b['style'] && a['gender'] === b['gender'];
  }

  private toStore(m: FormModel): void {
    this.store.setTitle(String(m['title'] ?? ''));
    this.store.setLyrics(String(m['lyrics'] ?? ''));
    const style = String(m['style'] ?? '');
    const gender = (m['gender'] as VocalGender | undefined) ?? 'random';
    // a gender picked in the select rewrites the style; a style typed by hand sets the gender: whichever changed wins
    if (gender !== this.store.gender() && style === this.store.style()) this.store.setGender(gender);
    else if (style !== this.store.style()) this.store.setStyle(style);
  }
}
