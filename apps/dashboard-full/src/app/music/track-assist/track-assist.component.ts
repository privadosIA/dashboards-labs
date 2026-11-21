import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProviderBadgeComponent } from '../../shared/provider-badge/provider-badge.component';
import { AssistModelComponent } from '../../editor/assist-model/assist-model.component';
import { ASSIST_MAX_CHARS } from '../../editor/assistant.store';
import { MusicAssistStore, MusicProposal } from '../music-assist.store';
import { AvailabilityStore } from '../../core/availability.store';
import { MusicGeneratorName } from '../../core/api.models';
import { ModelNoticeComponent } from '../../shared/model-notice/model-notice.component';

/**
 * "Write it with AI" on a track: the user describes the song in any language,
 * the assistant proposes a style (English) and lyrics, and the track changes
 * only when the user applies the proposal. While waiting it shows the seconds
 * elapsed and a cancel button; failures are explained here.
 */
@Component({
  selector: 'app-track-assist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, AssistModelComponent, ModelNoticeComponent, ProviderBadgeComponent],
  templateUrl: './track-assist.component.html',
  styleUrl: './track-assist.component.scss',
})
export class TrackAssistComponent {
  readonly trackId = input.required<string>();
  readonly instrumental = input<boolean>(false);
  /** The track's generator: HeartMuLa and DiffRhythm2 get tags and the section tags they read. */
  readonly generator = input<MusicGeneratorName>('ace-step');
  /** Emits the proposal when the user applies it. */
  readonly applied = output<MusicProposal>();

  protected readonly assist = inject(MusicAssistStore);
  private readonly availability = inject(AvailabilityStore);
  /** The assistant can run now; otherwise the button is hidden (a notice says so when only a model is missing). */
  protected readonly available = computed(() => this.availability.available('assistant'));
  protected readonly maxChars = ASSIST_MAX_CHARS;

  protected readonly open = signal(false);
  protected readonly description = signal('');

  protected readonly reason = computed(() => MusicAssistStore.unavailableReason(this.description()));
  protected readonly busyHere = computed(() => this.assist.busy() === this.trackId());
  protected readonly proposal = computed(() => {
    const p = this.assist.proposal();
    return p && p.trackId === this.trackId() ? p : null;
  });
  protected readonly failure = computed(() => {
    const f = this.assist.failure();
    return f && f.trackId === this.trackId() ? f : null;
  });

  protected ask(): void {
    this.assist.ask(this.trackId(), this.description(), this.instrumental(), this.generator());
  }

  protected apply(): void {
    const p = this.assist.use();
    if (p) this.applied.emit(p);
  }
}
