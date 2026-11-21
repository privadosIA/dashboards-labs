import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

import { MotionModelSettings } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AvailabilityStore } from '../../core/availability.store';
import { PanelComponent } from '../../shared/panel/panel.component';

/**
 * The model that writes the pages of motion graphics and overlays. Writing HTML needs a bigger model than
 * a prompt does, so it can be chosen on its own; empty uses the assistant's. The installed models of the
 * Ollama in use are offered as suggestions, read only when the field is first used.
 */
@Component({
  selector: 'app-motion-model-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './motion-model-card.component.html',
  styleUrl: './motion-model-card.component.scss',
})
export class MotionModelCardComponent {
  private readonly api = inject(ApiService);
  private readonly availability = inject(AvailabilityStore);

  /** The settings as the page that holds the card read them. */
  readonly model = input<MotionModelSettings | null>(null);
  /** The settings changed: the model after a save. */
  readonly changed = output<MotionModelSettings | null>();

  protected readonly input = signal('');
  protected readonly installed = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private suggested = false;

  constructor() {
    effect(() => this.input.set(this.model()?.saved ?? ''));
  }

  /** Reads the installed models the first time the field is used. */
  protected async suggest(): Promise<void> {
    if (this.suggested) return;
    this.suggested = true;
    try {
      this.installed.set((await firstValueFrom(this.api.assistModels())).models.map((m) => m.name));
    } catch {
      // no Ollama to ask: the name can still be typed (another provider's model)
    }
  }

  protected async save(value: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.putMotionModel(value));
      this.changed.emit(res.motion_model ?? null);
      void this.availability.refresh();
    } catch (e) {
      const err = e as HttpErrorResponse;
      this.error.set(err?.error?.error?.message ?? $localize`:@@motionModel.saveFailed:The model could not be saved.`);
    } finally {
      this.saving.set(false);
    }
  }
}
