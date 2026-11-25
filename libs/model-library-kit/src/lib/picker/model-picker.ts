import { ChangeDetectionStrategy, Component, Injectable, type Injector, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { ModelCatalog } from '../catalog/model-catalog/model-catalog';
import { LanguageService } from '../core/language';
import { reasonOf } from '../core/reason';
import { textsFor } from '../core/texts';
import { type LibraryModel, MODEL_PLACE_PORT, type ModelCopy } from '../port';

/** The dialog over the catalog that copies the chosen model into the place: it stays open to add more, says what each pick did (added, already there, refused and why) and answers what was added. */
@Component({
  selector: 'lab-model-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModelCatalog, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './model-picker.html',
  styleUrl: './model-picker.scss',
})
export class ModelPickerDialog {
  private readonly place = inject(MODEL_PLACE_PORT);
  private readonly ref = inject<MatDialogRef<ModelPickerDialog, ModelCopy[]>>(MatDialogRef);
  protected readonly data = inject<{ place: string }>(MAT_DIALOG_DATA);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.picker;
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly said = signal<{ ok: boolean; text: string } | null>(null);
  private readonly added: ModelCopy[] = [];

  protected async pick(model: LibraryModel): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.said.set(null);
    try {
      const copy = await firstValueFrom(this.place.add(model.id, this.name().trim() || undefined));
      if (copy.added) this.added.push(copy);
      this.said.set({ ok: true, text: copy.added ? this.t.added(copy.name, copy.pictures.length) : this.t.already(copy.name) });
    } catch (e) {
      this.said.set({ ok: false, text: reasonOf(e, this.texts) });
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.ref.close(this.added);
  }
}

/**
 * Opens the picker for a place (`place` is how it is called in the title: «the project», «the piece»). Answers what was added. `injector` is the caller's: the place a host provides (a piece's, a project's) and the library of
 * a lazy route are found from where the caller is, not from the application's root where a dialog is made.
 */
@Injectable({ providedIn: 'root' })
export class ModelPicker {
  private readonly dialog = inject(MatDialog);

  open(place: string, injector?: Injector): Promise<ModelCopy[]> {
    return firstValueFrom(this.dialog.open<ModelPickerDialog, { place: string }, ModelCopy[]>(ModelPickerDialog, { data: { place }, ...(injector ? { injector } : {}), width: 'min(60rem, 96vw)', maxWidth: '96vw' }).afterClosed()).then((added) => added ?? []);
  }
}
