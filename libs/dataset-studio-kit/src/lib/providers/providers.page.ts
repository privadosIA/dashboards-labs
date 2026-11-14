import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AssistantPicker } from '@lab/assist-kit';
import { toSignal } from '@angular/core/rxjs-interop';
import { ANIMATION } from '@lab/animation-core';
import { catchError, map, of } from 'rxjs';

import { AssistantChoice } from '../core/assistant-choice';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';

/** The providers tab: the one place where the assistant of the whole studio is chosen and where an external provider is added. */
@Component({
  selector: 'lab-providers-page',
  imports: [AssistantPicker],
  templateUrl: './providers.page.html',
  styleUrl: './providers.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvidersPage {
  private readonly all = textsFor(inject(LanguageService).lang);
  protected readonly t = this.all.providersPage;
  protected readonly pt = this.all.page;
  protected readonly choice = inject(AssistantChoice).value;
  private readonly animation = inject(ANIMATION);
  protected readonly routingModels = toSignal(this.animation.assistModels().pipe(map((m) => m.models.map((x) => x.name)), catchError(() => of([] as string[]))), { initialValue: [] as string[] });
}
