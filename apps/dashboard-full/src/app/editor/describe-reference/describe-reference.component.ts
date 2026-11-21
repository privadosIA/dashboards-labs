import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DescribeAlternative } from '../../core/api.models';
import { AvailabilityStore } from '../../core/availability.store';
import { RoutingStore } from '../../core/routing.store';
import { ModelNoticeComponent } from '../../shared/model-notice/model-notice.component';
import { ProviderBadgeComponent } from '../../shared/provider-badge/provider-badge.component';

import { EditorStore } from '../editor.store';
import { DESCRIBE_ACCEPT, DescribeProposal, DescribeStore } from './describe.store';

/**
 * "Describe a reference" under the prompt of a scene: pick a picture or a clip,
 * a local vision model writes its prompt, and the text is shown as a proposal
 * with the model that wrote it. The scene is only changed when the user accepts
 * (the parent applies `accepted`). The file is only read to write the text.
 */
@Component({
  selector: 'app-describe-reference',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule, ModelNoticeComponent, ProviderBadgeComponent],
  templateUrl: './describe-reference.component.html',
  styleUrl: './describe-reference.component.scss',
})
export class DescribeReferenceComponent {
  readonly sceneId = input.required<string>();
  /** Whether the scene animates: a clip's movement prompt is only offered then. */
  readonly animates = input(false);
  /** Emits the proposal when the user accepts it. */
  readonly accepted = output<DescribeProposal>();

  protected readonly store = inject(DescribeStore);
  private readonly editor = inject(EditorStore);
  protected readonly accept = DESCRIBE_ACCEPT;

  protected readonly busyHere = computed(() => this.store.busy() === this.sceneId());
  protected readonly proposal = computed(() => {
    const p = this.store.proposal();
    return p && p.sceneId === this.sceneId() ? p : null;
  });
  protected readonly failure = computed(() => {
    const f = this.store.failure();
    return f && f.sceneId === this.sceneId() ? f : null;
  });
  protected readonly routing = inject(RoutingStore);
  private readonly availability = inject(AvailabilityStore);
  /** A picture or a clip can be described now; otherwise the controls are hidden (a notice says so when only a model is missing). */
  protected readonly available = computed(() => this.availability.anyAvailable(['describe_image', 'describe_video']));
  /** What to retry with after a refusal: models at providers, the user's choice every time. */
  protected readonly alternatives = computed(() => {
    const f = this.failure();
    return f?.kind === 'refused' ? this.store.choices(f) : [];
  });

  /** The remote provider that describing would use for the chosen mode, with the most calls it may make. */
  protected readonly remoteCalls = computed(() => {
    const clip = this.routing.remoteName('describe_video');
    const picture = this.routing.remoteName('describe_image');
    const name = clip ?? picture;
    if (!name) return null;
    // worst case of the mode: one scene per shot 12 shots x 3; a clip as one scene 8 frames x 2 + 1; a picture 2
    return { name, calls: this.store.split() ? 36 : clip ? 17 : 2 };
  });

  protected retry(alt: DescribeAlternative): void {
    this.store.retry(this.sceneId(), alt);
  }

  /** The installed models are read when the user first approaches the button, not when the editor opens. */
  protected warm(): void {
    void this.store.load();
  }

  protected async pick(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.store.run(this.sceneId(), file, this.editor);
  }

  protected keptShots(): number {
    return this.proposal()?.shots?.filter((sh) => sh.keep && sh.prompt.trim()).length ?? 0;
  }

  protected seconds(t: number): string {
    return t.toFixed(1);
  }

  protected use(): void {
    const p = this.store.use();
    if (p) this.accepted.emit(p);
  }
}
