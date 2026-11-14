import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { AssistModel } from '../../core/api.models';
import { RoutingStore } from '../../core/routing.store';
import { AssistModelStore } from './assist-model.store';

/**
 * Chooses the model the prompt assistant writes with, among those installed in
 * Ollama, with their size; those that do not fit the free memory or are too
 * slow on the CPU carry a warning. A refusal comes from the model, so this is
 * how to get past it: pick another one.
 */
@Component({
  selector: 'app-assist-model',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './assist-model.component.html',
  styleUrl: './assist-model.component.scss',
})
export class AssistModelComponent {
  protected readonly store = inject(AssistModelStore);
  /** Which provider the assistant is routed to: a provider that is not the built-in Ollama brings its own model. */
  protected readonly routing = inject(RoutingStore);

  protected readonly selectedModel = computed(() => this.store.models().find((m) => m.name === this.store.selected()) ?? null);
  protected readonly warning = computed(() => {
    const m = this.selectedModel();
    return m ? AssistModelStore.warning(m) : '';
  });

  /** The list is read when the user first opens the selector, not when the editor opens. */
  protected opened(open: boolean): void {
    if (open) void this.store.load();
  }

  /** The chosen model may not be in the list yet (it is read on first open). */
  protected readonly extraChoice = computed(() => {
    const c = this.store.selected();
    return c && !this.store.models().some((m) => m.name === c) ? c : '';
  });

  protected size(m: AssistModel): string {
    return `${(m.size_bytes / 1e9).toFixed(1)} GB`;
  }

  protected warn(m: AssistModel): '' | 'memory' | 'slow' {
    return AssistModelStore.warning(m);
  }
}
