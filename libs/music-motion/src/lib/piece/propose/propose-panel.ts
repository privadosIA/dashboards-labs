import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Assistant } from '@lab/assist-kit';
import { MatDialog } from '@angular/material/dialog';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { MAX_PROMPT, isBusy, isProposing, type PieceDetail, type Proposal, type ProposalWhat } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { AssistantField } from '../../shared/assistant-field/assistant-field';
import { ConfirmDialog, type ConfirmData } from '../../shared/confirm-dialog/confirm.dialog';
import { failureText } from '../../shared/failure-text';
import en from './dynamic/propose.en.json';
import es from './dynamic/propose.es.json';

/**
 * The buttons that ask the assistant for a design, a script, or both, with the direction the person gives (the piece's prompt) and the model to use.
 * A design or a script is answered at once, with its source, its model and, for the fixed rule, why; both are written in the background and handed over
 * as the piece, whose proposal the page follows.
 */
@Component({
  selector: 'app-propose-panel',
  imports: [AssistantField, DynamicFormComponent],
  templateUrl: './propose-panel.html',
  styleUrl: './propose-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposePanel {
  readonly piece = input.required<PieceDetail>();
  /** The piece as it is after the proposal replaced part of it, or as it is when one for both has started. */
  readonly proposed = output<PieceDetail>();

  private readonly port = inject(ANIMATION);
  private readonly dialog = inject(MatDialog);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.propose;
  protected readonly schema = pickSchema('propose-prompt', { en, es }, this.lang);
  protected readonly max = MAX_PROMPT;

  protected readonly proposing = computed(() => isProposing(this.piece()));
  protected readonly locked = computed(() => isBusy(this.piece()) || this.proposing());
  protected readonly working = signal<ProposalWhat | null>(null);
  protected readonly result = signal<Proposal | null>(null);
  protected readonly refused = signal('');
  /** The assistant chosen (provider and model); empty is the server's own. */
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly form = signal<Record<string, unknown>>({ prompt: '' });
  protected readonly length = computed(() => String(this.form()['prompt'] ?? '').length);
  protected readonly busy = computed(() => this.locked() || this.working() !== null || this.length() > MAX_PROMPT);
  protected readonly replacements = computed(() => (this.result()?.replacements ?? []).map((r) => this.t.replacedItem.replace('{piece}', r.piece).replace('{from}', r.from).replace('{to}', r.to)));
  protected readonly doneText = computed(() => {
    const what = this.result()?.what;
    return what === 'design' || what === 'script' ? this.t.done[what] : '';
  });

  constructor() {
    // The field shows the prompt the piece keeps, and follows it when a proposal or another page changes it.
    effect(() => {
      const kept = this.piece().prompt ?? '';
      untracked(() => this.form.set({ prompt: kept }));
    });
  }

  protected changed(value: Record<string, unknown>): void {
    this.form.set(value);
  }

  /** Asks first: what is there is replaced, and a design the person edited is the one most worth warning about. */
  protected ask(what: ProposalWhat): void {
    if (this.busy()) return;
    const message = what === 'all' ? this.t.confirmBoth : what === 'script' ? this.t.confirmScript : this.piece().design.edited ? this.t.confirmDesignEdited : this.t.confirmDesign;
    const data: ConfirmData = { title: this.t.confirmTitle, message, action: this.t.action };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => go && this.run(what));
  }

  /** What is sent besides the part: the text when it is not the one the piece keeps (an emptied one clears it), and the model when one was chosen. */
  private input(): { prompt?: string; model?: string; provider?: string } {
    const text = String(this.form()['prompt'] ?? '').trim();
    const kept = this.piece().prompt ?? '';
    return { ...(text !== kept ? { prompt: text } : {}), ...(this.assistant().provider ? { provider: this.assistant().provider } : {}), ...(this.assistant().model ? { model: this.assistant().model } : {}) };
  }

  private run(what: ProposalWhat): void {
    this.working.set(what);
    this.refused.set('');
    this.result.set(null);
    const id = this.piece().id;
    const input = this.input();
    const failed = (e: unknown): void => {
      this.working.set(null);
      this.refused.set(failureText(e, this.texts));
    };
    if (what === 'all') {
      this.port
        .proposeAll(id, input)
        .pipe(takeUntilDestroyed(this.destroyed))
        .subscribe({
          next: (piece) => {
            this.working.set(null);
            this.proposed.emit(piece);
          },
          error: failed,
        });
      return;
    }
    this.port
      .propose(id, { what, ...input })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (proposal) => {
          this.working.set(null);
          this.result.set(proposal);
          this.proposed.emit(proposal.piece);
        },
        error: failed,
      });
  }
}
