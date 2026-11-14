import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { ApiErrorBody, ProviderInfo, ProviderInput, ProviderTestResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { AvailabilityStore } from '../../core/availability.store';

interface Form {
  /** The id of the provider being edited; null when adding. */
  editing: string | null;
  name: string;
  type: 'ollama' | 'openai';
  base_url: string;
  text_model: string;
  vision_model: string;
  /** Write-only: empty while editing means "leave the saved key". */
  key: string;
  /** Whether the provider being edited has a key saved. */
  keySaved: boolean;
  /** The user pressed "remove the key". */
  removeKey: boolean;
}

const EMPTY: Form = { editing: null, name: '', type: 'openai', base_url: '', text_model: '', vision_model: '', key: '', keySaved: false, removeKey: false };

/**
 * The model providers: the built-in Ollama (read only, set in the card above), and
 * the ones the user adds. A key is a write-only field: it is never shown, an empty
 * field while editing leaves the saved one, and a button removes it. The server owns
 * the rules (valid address, https for keys), so its reason is shown as it wrote it.
 */
@Component({
  selector: 'app-providers-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './providers-card.component.html',
  styleUrl: './providers-card.component.scss',
})
export class ProvidersCardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly availability = inject(AvailabilityStore);

  /** Emits when a provider was added, edited or deleted, so other cards re-read the list. */
  readonly changed = output<void>();

  protected readonly providers = signal<ProviderInfo[]>([]);
  protected readonly form = signal<Form | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly testing = signal<string | null>(null);
  protected readonly results = signal<Record<string, ProviderTestResult>>({});

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.providers.set((await firstValueFrom(this.api.getProviders())).providers);
    } catch {
      this.providers.set([]);
    }
  }

  protected startAdd(): void {
    this.error.set(null);
    this.form.set({ ...EMPTY });
  }

  protected startEdit(p: ProviderInfo): void {
    this.error.set(null);
    this.form.set({
      editing: p.id, name: p.name, type: p.type, base_url: p.base_url,
      text_model: p.text_model, vision_model: p.vision_model, key: '', keySaved: p.key_set, removeKey: false,
    });
  }

  protected cancel(): void {
    this.form.set(null);
    this.error.set(null);
  }

  protected set<K extends keyof Form>(field: K, value: Form[K]): void {
    this.form.update((f) => (f ? { ...f, [field]: value } : f));
    this.error.set(null);
  }

  protected removeSavedKey(): void {
    this.form.update((f) => (f ? { ...f, removeKey: true, keySaved: false, key: '' } : f));
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f) return;
    const body: ProviderInput = {
      name: f.name, type: f.type, base_url: f.base_url, text_model: f.text_model, vision_model: f.vision_model,
    };
    // A typed key sets it; the remove button removes it; otherwise the saved key stays (field absent).
    if (f.key) body.key = f.key;
    else if (f.removeKey) body.key = '';
    this.saving.set(true);
    this.error.set(null);
    try {
      if (f.editing) await firstValueFrom(this.api.updateProvider(f.editing, body));
      else await firstValueFrom(this.api.createProvider(body));
      this.form.set(null);
      await this.reload();
      this.changed.emit();
      void this.availability.refresh();
    } catch (err) {
      this.error.set(reason(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected modelName(m: { name: string }): string {
    return m.name;
  }

  protected async test(p: ProviderInfo): Promise<void> {
    this.testing.set(p.id);
    try {
      const res = await firstValueFrom(this.api.testProvider(p.id));
      this.results.update((r) => ({ ...r, [p.id]: res }));
    } catch (err) {
      this.results.update((r) => ({ ...r, [p.id]: { ok: false, host: p.base_url, remote: p.remote, error: reason(err) } }));
    } finally {
      this.testing.set(null);
    }
  }

  protected async remove(p: ProviderInfo): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@providers.deleteTitle:Delete provider`,
        message: $localize`:@@providers.deleteMessage:The provider ${p.name}:name: and its saved key, if any, are deleted. Nothing is deleted on the other side.`,
        confirmLabel: $localize`:@@providers.deleteConfirm:Delete provider`,
        destructive: true,
      }),
    );
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteProvider(p.id));
      this.results.update((r) => {
        const { [p.id]: _gone, ...rest } = r;
        return rest;
      });
      await this.reload();
      this.changed.emit();
      void this.availability.refresh();
    } catch (err) {
      this.error.set(reason(err));
    }
  }
}

/** The server's reason, as it wrote it. */
function reason(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
  }
  return $localize`:@@providers.errorGeneric:The operation could not be completed.`;
}
