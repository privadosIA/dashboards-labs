import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProviderBadgeComponent } from '../../shared/provider-badge/provider-badge.component';
import { AssistModelComponent } from '../assist-model/assist-model.component';
import { ASSIST_MAX_CHARS, AssistField, AssistantStore } from '../assistant.store';
import { AvailabilityStore } from '../../core/availability.store';
import { ModelNoticeComponent } from '../../shared/model-notice/model-notice.component';

/**
 * "Improve with AI" / "Suggest motion" under a scene field. It asks the
 * prompt assistant for a PROPOSAL and shows it with Use / Discard; the
 * field is only changed when the user accepts (the parent patches it from
 * `accepted`). While waiting it shows the seconds elapsed and a cancel
 * button; failures are explained here, not in a global notification.
 */
@Component({
  selector: 'app-assist-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, AssistModelComponent, ModelNoticeComponent, ProviderBadgeComponent],
  templateUrl: './assist-actions.component.html',
  styleUrl: './assist-actions.component.scss',
})
export class AssistActionsComponent {
  readonly field = input.required<AssistField>();
  readonly sceneId = input.required<string>();
  /** The description the assistant starts from. */
  readonly text = input<string>('');
  /** Emits the proposal's text when the user accepts it. */
  readonly accepted = output<string>();

  protected readonly assist = inject(AssistantStore);
  private readonly availability = inject(AvailabilityStore);
  /** The assistant can run now; otherwise its controls are hidden (a notice says so when only a model is missing). */
  protected readonly available = computed(() => this.availability.available('assistant'));
  protected readonly maxChars = ASSIST_MAX_CHARS;

  protected readonly reason = computed(() => AssistantStore.unavailableReason(this.text()));
  protected readonly busyHere = computed(() => {
    const b = this.assist.busy();
    return !!b && b.sceneId === this.sceneId() && b.field === this.field();
  });
  protected readonly proposal = computed(() => {
    const p = this.assist.proposal();
    return p && p.sceneId === this.sceneId() && p.field === this.field() ? p : null;
  });
  protected readonly failure = computed(() => {
    const f = this.assist.failure();
    return f && f.sceneId === this.sceneId() && f.field === this.field() ? f : null;
  });

  protected ask(): void {
    this.assist.ask(this.sceneId(), this.field(), this.text());
  }

  protected use(): void {
    const p = this.assist.use();
    if (p) this.accepted.emit(p.text);
  }
}
