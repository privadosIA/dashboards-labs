import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { PagedList } from '@lab/paged-list';

import { injectLink } from '../core/links';
import { LocalStyles, type LocalStyle } from '../animation/local-styles';
import type { Preset } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ConfirmDialog, type ConfirmData } from '../shared/confirm-dialog/confirm.dialog';
import { failureText } from '../shared/failure-text';

/** The styles a piece can start from, newest first, to edit or delete. They are made from a ready reference. */
@Component({
  selector: 'app-presets-page',
  imports: [RouterLink, PagedList],
  templateUrl: './presets.page.html',
  styleUrl: './presets.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresetsPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  private readonly dialog = inject(MatDialog);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.presets;
  protected readonly common = this.texts;
  protected readonly lang = inject(LanguageService).lang;

  private readonly local = inject(LocalStyles);
  /** The styles kept in this browser, which the server does not have. */
  protected readonly own = this.local.styles;
  protected readonly presets = signal<readonly Preset[] | null>(null);
  protected readonly references = signal<ReadonlySet<string>>(new Set());
  /** Why the list could not be read, or a deletion did not happen, in the server's words. */
  protected readonly refused = signal('');

  ngOnInit(): void {
    this.port
      .presets()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (list) => this.presets.set(list), error: (e) => this.refused.set(failureText(e, this.texts)) });
    // Which references still exist, to say of a style whether its own is gone. Not being able to read them only leaves that unsaid.
    this.port
      .references()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (list) => this.references.set(new Set(list.map((r) => r.id))), error: () => undefined });
  }

  protected gone(preset: Preset): boolean {
    return !!preset.referenceId && this.references().size > 0 && !this.references().has(preset.referenceId);
  }

  protected summary(preset: Pick<Preset, 'rhythm' | 'parts'>): string {
    return `${this.t.rhythm}: ${preset.rhythm} s · ${this.t.parts}: ${preset.parts.length ? preset.parts.join(', ') : this.t.allParts}`;
  }

  protected openOwn(style: LocalStyle): void {
    void this.router.navigate([this.link('presets', 'local', style.id)]);
  }

  protected removeOwn(style: LocalStyle): void {
    const data: ConfirmData = { title: this.t.removeTitle, message: `${style.name}: ${this.t.removeMessage}`, action: this.t.removeAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (go) this.local.remove(style.id);
      });
  }

  protected open(preset: Preset): void {
    void this.router.navigate([this.link('presets', preset.id)]);
  }

  protected remove(preset: Preset): void {
    const data: ConfirmData = { title: this.t.removeTitle, message: `${preset.name}: ${this.t.removeMessage}`, action: this.t.removeAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.refused.set('');
        this.port
          .removePreset(preset.id)
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({
            next: () => this.presets.update((l) => (l ?? []).filter((p) => p.id !== preset.id)),
            error: (e) => this.refused.set(failureText(e, this.texts)),
          });
      });
  }
}
