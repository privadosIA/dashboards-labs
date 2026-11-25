import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { type DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { ModelPack } from '../../port';
import type { PacksStore } from '../packs.store';
import en from './dynamic/import-pack.en.json';
import es from './dynamic/import-pack.es.json';

/** The dialog that imports a zip as a pack. The licence is required (the form says so and nothing is sent without it); the server's refusals stay under the form with what was typed. */
@Component({
  selector: 'lab-import-pack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './import-pack.html',
  styleUrl: './import-pack.scss',
})
export class ImportPack {
  private readonly store = inject<PacksStore>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ImportPack, ModelPack | undefined>>(MatDialogRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).importer;
  protected readonly schema = pickSchema('import-pack', { en, es }, this.lang) as DfFormSchema;

  protected readonly model = signal<Record<string, unknown>>({ id: '', name: '', author: '', licence: '', sourceUrl: '' });
  protected readonly valid = signal(false);
  protected readonly zip = signal<File | null>(null);
  protected readonly sending = signal(false);
  protected readonly problem = this.store.importProblem;
  protected readonly canSend = computed(() => this.valid() && this.zip() !== null && !this.sending());

  protected pick(event: Event): void {
    this.zip.set((event.target as HTMLInputElement).files?.item(0) ?? null);
    this.store.importProblem.set('');
  }

  protected async send(): Promise<void> {
    const file = this.zip();
    if (!file || !this.canSend()) return;
    const m = this.model();
    const text = (key: string): string | undefined => String(m[key] ?? '').trim() || undefined;
    this.sending.set(true);
    this.store.importProblem.set('');
    const pack = await this.store.importPack({ id: String(m['id']).trim(), licence: String(m['licence']).trim(), name: text('name'), author: text('author'), sourceUrl: text('sourceUrl'), file });
    this.sending.set(false);
    if (pack) this.ref.close(pack);
  }
}
