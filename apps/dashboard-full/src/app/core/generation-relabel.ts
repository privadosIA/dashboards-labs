import { Provider, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { GENERATION_RELABEL, type Generation, type GenerationRelabel } from '@lab/model-library-kit';
import { firstValueFrom } from 'rxjs';

import { ClientLabelData, ClientLabelDialogComponent } from '../shared/client-label-dialog/client-label-dialog.component';
import { ClientLabelsStore } from './client-labels.store';

/**
 * Gives the list of 3D generations of the library what only this dashboard has: the colour of each client label and a form to change one. The form
 * answers whether the label changed, and the list then reads that generation again.
 */
export function provideGenerationRelabel(): Provider {
  return {
    provide: GENERATION_RELABEL,
    useFactory: (): GenerationRelabel => {
      const dialog = inject(MatDialog);
      const labels = inject(ClientLabelsStore);
      if (!labels.loaded()) void labels.load();
      return {
        colorOf: (client) => labels.colorOf(client),
        relabel: async (generation: Generation) =>
          (await firstValueFrom(dialog.open<ClientLabelDialogComponent, ClientLabelData, boolean>(ClientLabelDialogComponent, { data: { id: generation.id, name: generation.name, client: generation.client }, width: '28rem', maxWidth: '95vw' }).afterClosed())) === true,
      };
    },
  };
}
