import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

import { DiffRhythm2Settings, HeartMulaTestResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnginesStore } from '../../core/engines.store';
import { PanelComponent } from '../../shared/panel/panel.component';

/**
 * The DiffRhythm2 music service on another machine (the optional song generator for English lyrics). With no
 * address the generator runs in a local container when this machine has one; with an address, songs are
 * made there, which sends lyrics and style to it, so a machine that is not this one needs the user's consent.
 */
@Component({
  selector: 'app-diffrhythm2-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './diffrhythm2-card.component.html',
  styleUrl: './diffrhythm2-card.component.scss',
})
export class DiffRhythm2CardComponent {
  private readonly api = inject(ApiService);
  protected readonly engines = inject(EnginesStore);

  readonly diffrhythm2 = input<DiffRhythm2Settings | null>(null);
  readonly changed = output<DiffRhythm2Settings | null>();

  protected readonly host = signal('');
  protected readonly token = signal('');
  protected readonly accept = signal(false);
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly test = signal<HeartMulaTestResult | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.host.set(this.diffrhythm2()?.saved ?? '');
      this.token.set('');
      this.accept.set(false);
    });
    void this.engines.refresh();
  }

  /** The typed address is not this machine: the consent box is needed before saving. */
  protected needsConsent(): boolean {
    const h = this.host().trim();
    if (!h) return false;
    if (h === this.diffrhythm2()?.saved && this.diffrhythm2()?.consented) return false;
    return !/^(https?:\/\/)?(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:|\/|$)/i.test(h);
  }

  protected async runTest(): Promise<void> {
    this.testing.set(true);
    this.error.set(null);
    try {
      this.test.set(await firstValueFrom(this.api.testDiffRhythm2(this.host().trim() || undefined, this.token() || undefined)));
    } catch (e) {
      this.error.set(messageOf(e, $localize`:@@diffrhythm2.testFailed:The address could not be tested.`));
    } finally {
      this.testing.set(false);
    }
  }

  protected async save(host: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.api.putDiffRhythm2({ host, ...(this.token() ? { token: this.token() } : {}), ...(host && this.accept() ? { accept: true } : {}), ...(!host ? { token: '' } : {}) }),
      );
      this.changed.emit(res.diffrhythm2 ?? null);
      this.test.set(null);
      void this.engines.refresh();
    } catch (e) {
      this.error.set(messageOf(e, $localize`:@@diffrhythm2.saveFailed:The address could not be saved.`));
    } finally {
      this.saving.set(false);
    }
  }
}

function messageOf(e: unknown, fallback: string): string {
  const err = e as HttpErrorResponse;
  return err?.error?.error?.message ?? fallback;
}
