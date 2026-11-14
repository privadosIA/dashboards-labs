import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type Assistant, AssistantPicker } from '@lab/assist-kit';
import { defer } from 'rxjs';

import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/**
 * The choice of the assistant that writes what a text box asks for: the provider (the server's routing, the built-in Ollama, another Ollama or an external one, which asks for consent and can be added
 * here) and its model. The models of the routing are read from the port; a port that cannot list them leaves that list empty and the model is then typed. `value` is what goes with the call:
 * `provider` empty is the server's own routing, and `model` empty its own model.
 */
@Component({
  selector: 'app-assistant-field',
  imports: [AssistantPicker],
  templateUrl: './assistant-field.html',
  styleUrl: './assistant-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantField implements OnInit {
  readonly value = model<Assistant>({ provider: '', model: '' });
  readonly disabled = input(false);

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  protected readonly t = textsFor(inject(LanguageService).lang).propose;
  protected readonly routingModels = signal<readonly string[]>([]);

  ngOnInit(): void {
    // Read inside `defer`: a port that cannot list models (no assistant, or a stub) leaves the list empty instead of breaking the screen.
    defer(() => this.port.assistModels())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (m) => this.routingModels.set(m.models.map((x) => x.name)), error: () => this.routingModels.set([]) });
  }
}
