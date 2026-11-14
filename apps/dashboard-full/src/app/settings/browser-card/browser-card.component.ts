import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

import { BrowserSettings } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { PanelComponent } from '../../shared/panel/panel.component';

/**
 * The Chrome or Chromium that draws motion graphics and overlays. It is found by itself; this card says
 * which one is used and lets the user point to another. The server checks the path.
 */
@Component({
  selector: 'app-browser-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './browser-card.component.html',
  styleUrl: './browser-card.component.scss',
})
export class BrowserCardComponent {
  private readonly api = inject(ApiService);
  private readonly env = inject(EnvironmentStore);

  /** The browser as the settings report it (the page that holds the card reads them once). */
  readonly browser = input<BrowserSettings | null>(null);
  /** The settings changed: the browser in use after a save. */
  readonly changed = output<BrowserSettings | null>();

  protected readonly input = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => this.input.set(this.browser()?.saved ?? ''));
  }

  protected async save(path: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.putBrowser(path));
      this.changed.emit(res.browser ?? null);
      void this.env.refresh();
    } catch (e) {
      const err = e as HttpErrorResponse;
      this.error.set(err?.error?.error?.message ?? $localize`:@@browser.saveFailed:The path could not be saved.`);
    } finally {
      this.saving.set(false);
    }
  }
}
