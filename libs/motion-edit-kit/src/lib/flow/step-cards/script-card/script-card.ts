import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProposalCardBase } from '../../shared/proposal-card-base';
import { ProposeAgain } from '../../shared/propose-again/propose-again';

/** The Script step: the script is proposed from the prompt; its review is the editor itself, opened with the Flow bar. There is no switch here: the script is the whole point, so the flow always stops. */
@Component({
  selector: 'app-script-card',
  imports: [ProposeAgain, RouterLink],
  templateUrl: './script-card.html',
  styleUrl: './script-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptCard extends ProposalCardBase {
  protected readonly what = 'script' as const;
}
