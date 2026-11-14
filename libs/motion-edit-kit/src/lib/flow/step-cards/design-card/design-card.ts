import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProposalCardBase } from '../../shared/proposal-card-base';
import { ProposeAgain } from '../../shared/propose-again/propose-again';

/** The Design step: the design is proposed from the prompt; the review says who wrote it and offers Propose again, Edit in the editor and Continue. */
@Component({
  selector: 'app-design-card',
  imports: [ProposeAgain, RouterLink],
  templateUrl: './design-card.html',
  styleUrl: './design-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignCard extends ProposalCardBase {
  protected readonly what = 'design' as const;
  protected readonly auto = () => this.flow()?.autoContinue.design === true;

  protected setAuto(on: boolean): void {
    this.store.setAuto('design', on);
  }
}
