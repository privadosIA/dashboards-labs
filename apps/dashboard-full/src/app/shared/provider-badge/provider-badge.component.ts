import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { RoutingTask } from '../../core/api.models';
import { RoutingStore } from '../../core/routing.store';

/**
 * "☁ external · name" next to a control whose task runs on a remote provider, so the
 * user always sees when pictures, clips or texts leave this computer. Nothing is shown
 * for the built-in Ollama or any provider on this machine. A control that covers several
 * tasks (describing a picture or a clip) passes all of them and names each remote one once.
 */
@Component({
  selector: 'app-provider-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './provider-badge.component.html',
  styleUrl: './provider-badge.component.scss',
})
export class ProviderBadgeComponent {
  readonly tasks = input.required<RoutingTask | RoutingTask[]>();
  private readonly routing = inject(RoutingStore);

  protected readonly names = computed(() => {
    const t = this.tasks();
    const list = Array.isArray(t) ? t : [t];
    const out: string[] = [];
    for (const task of list) {
      const n = this.routing.remoteName(task);
      if (n && !out.includes(n)) out.push(n);
    }
    return out;
  });

  protected title(): string {
    return $localize`:@@badge.title:This task uses a provider that is not this computer: what it sends leaves this machine.`;
  }
}
