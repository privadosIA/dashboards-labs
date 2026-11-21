import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

import { ApiErrorBody } from '../../core/api.models';
import { ApiService } from '../../core/api.service';

/**
 * "Paste the address of a YouTube video": the server takes its audio into the
 * project's sources and this emits the stored name, so the parent can refresh
 * its list and choose it. While it downloads the user can cancel (the request
 * is aborted and the server stops). Errors are explained here, next to the
 * field, with the server's own message.
 */
@Component({
  selector: 'app-source-url',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './source-url.component.html',
  styleUrl: './source-url.component.scss',
})
export class SourceUrlComponent {
  readonly projectId = input.required<string>();
  /** Emits the name the audio was stored under. */
  readonly added = output<string>();

  private readonly api = inject(ApiService);
  private sub: Subscription | null = null;

  protected readonly url = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onInput(value: string): void {
    this.url.set(value);
    this.error.set(null);
  }

  protected add(): void {
    const url = this.url().trim();
    if (!url || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.sub = this.api.addSourceFromUrl(this.projectId(), url).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.url.set('');
        this.added.emit(res.name);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(
          err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message) : String(err),
        );
      },
    });
  }

  protected cancel(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    this.busy.set(false);
  }
}
