import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../../core/api.service';

/** «Escuchar»: asks the server to read the scene's text with the voice in use, and plays it. */
@Component({
  selector: 'app-scene-listen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './scene-listen.component.html',
  styleUrl: './scene-listen.component.scss',
})
export class SceneListenComponent {
  /** The scene it belongs to: leaving it stops what is playing. */
  readonly sceneId = input.required<string>();
  readonly text = input.required<string>();
  /** The voice in use (the scene's own, else the project's); empty when there is none. */
  readonly voice = input.required<string>();
  readonly speaker = input.required<number>();
  readonly speed = input.required<number>();

  private readonly api = inject(ApiService);

  /** The narration being listened to: asked of the server, then played. */
  protected readonly listen = signal<{ state: 'idle' | 'loading' | 'playing'; error?: string }>({ state: 'idle' });
  private sub?: Subscription;
  private audio?: HTMLAudioElement;
  private objectUrl?: string;

  constructor() {
    effect(() => {
      this.sceneId();
      untracked(() => this.stop());
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected toggle(): void {
    if (this.listen().state !== 'idle') {
      this.stop();
      return;
    }
    const voice = this.voice();
    if (!voice) return;
    this.listen.set({ state: 'loading' });
    this.sub = this.api.speechPreview(this.text(), voice, this.speed() || 1, this.speaker()).subscribe({
      next: (wav) => {
        this.objectUrl = URL.createObjectURL(wav);
        const audio = new Audio(this.objectUrl);
        this.audio = audio;
        audio.onended = () => this.stop();
        audio.onerror = () => this.stop($localize`:@@scene.listenError:The browser could not play the audio.`);
        this.listen.set({ state: 'playing' });
        void audio.play().catch(() => this.stop($localize`:@@scene.listenError:The browser could not play the audio.`));
      },
      error: async (e: HttpErrorResponse) => {
        let msg = $localize`:@@scene.listenFailed:The text could not be read.`;
        try {
          const body = e.error instanceof Blob ? JSON.parse(await e.error.text()) : e.error;
          if (body?.error?.message ?? body?.message) msg = body.error?.message ?? body.message;
        } catch {
          /* the generic message stays */
        }
        this.stop(msg);
      },
    });
  }

  private stop(error?: string): void {
    this.sub?.unsubscribe();
    this.sub = undefined;
    this.audio?.pause();
    this.audio = undefined;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
    this.listen.set(error ? { state: 'idle', error } : { state: 'idle' });
  }
}
