import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * What a list, table or gallery shows when it has nothing: an icon, a sentence
 * saying why it is empty and, projected inside, the action that fills it.
 */
@Component({
  selector: 'mo-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly message = input.required<string>();
  readonly hint = input<string>();
}
