import { of } from 'rxjs';

import { DEMO_IMAGE_MODELS } from '../lib/retouch/in-memory.adapter';
import type { EditRequest } from '../lib/retouch/model';
import type { StartImage } from '../lib/video/model';

/** What the stub port gives back: two results that differ from any original, so a test can tell which one was used. */
export const RETOUCHED: readonly StartImage[] = [
  { name: 'retouched-1.png', dataUrl: 'data:image/png;base64,RETOUCHED1' },
  { name: 'retouched-2.png', dataUrl: 'data:image/png;base64,RETOUCHED2' },
];

/** An image edit port that answers at once with `RETOUCHED` and remembers what it was asked. */
export function stubImageEdit() {
  const requests: EditRequest[] = [];
  return { requests, models: () => of(DEMO_IMAGE_MODELS), edit: (request: EditRequest) => (requests.push(request), of(RETOUCHED.map((image, i) => ({ seed: i + 1, image })))) };
}

/** Waits for the dialog to be gone: it closes with an animation, and its result only arrives after it. */
export async function dialogClosed(settle: () => Promise<void>): Promise<void> {
  await vi.waitFor(async () => {
    await settle();
    expect(document.querySelector('app-retouch-dialog')).toBeNull();
  });
}

/** Drives the retouch dialog that is open: chooses a model by its name when given, writes the prompt, retouches, picks a variant and uses it. */
export async function retouchAndUse(settle: () => Promise<void>, prompt = 'as a watercolor', variant = 0, negativePrompt = '', modelName?: string): Promise<void> {
  const dialog = document.querySelector('app-retouch-dialog') as HTMLElement;
  if (modelName) {
    dialog.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await settle();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
      .find((o) => o.textContent?.trim() === modelName)!
      .click();
    await settle();
  }
  const [promptBox, negativeBox] = Array.from(dialog.querySelectorAll<HTMLTextAreaElement>('textarea'));
  // A model that takes no negative prompt has no second box.
  for (const [box, value] of [[promptBox, prompt], [negativeBox, negativePrompt]] as const) {
    if (!box) continue;
    box.value = value;
    box.dispatchEvent(new Event('input'));
  }
  await settle();
  dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  await settle();
  dialog.querySelectorAll<HTMLButtonElement>('.variant')[variant].click();
  await settle();
  Array.from(dialog.querySelectorAll<HTMLButtonElement>('.actions button'))
    .find((b) => b.disabled === false && b.classList.contains('primary'))!
    .click();
  await dialogClosed(settle);
}
