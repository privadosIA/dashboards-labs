import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';

import { StyleTemplate, TEMPLATE_GROUPS, isChosen, toggleTemplate } from '../style-templates';

/**
 * A collapsed list of genre templates under a style box. Choosing one adds its
 * text to the style (choosing it again removes it); it only reports the new
 * text, the owner decides where it goes.
 */
@Component({
  selector: 'app-style-templates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatExpansionModule],
  templateUrl: './style-templates.component.html',
  styleUrl: './style-templates.component.scss',
})
export class StyleTemplatesComponent {
  /** The current style text. */
  readonly text = input('');
  readonly testId = input('style-templates');
  readonly changed = output<string>();

  protected readonly groups = TEMPLATE_GROUPS;

  protected chosen(t: StyleTemplate): boolean {
    return isChosen(this.text(), t);
  }

  protected toggle(t: StyleTemplate): void {
    this.changed.emit(toggleTemplate(this.text(), t));
  }
}
