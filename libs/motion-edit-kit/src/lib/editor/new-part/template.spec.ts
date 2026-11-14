import { firstValueFrom } from 'rxjs';
import { InMemoryAnimation } from '@lab/music-motion';

import { PART_TEMPLATE } from './template';

describe('the part template', () => {
  it('is a manifest that is JSON with a name and a fragment that moves, and the checks of a draft accept it', async () => {
    const manifest = JSON.parse(PART_TEMPLATE.manifest) as { name: string; params: { name: string; animatable?: boolean }[] };
    expect(manifest.name).toBe('my-new-part');
    expect(manifest.params.map((p) => p.name)).toEqual(['bars', 'gain', 'label']);
    // the server refuses a draft that declares an animatable parameter
    expect(manifest.params.some((p) => p.animatable)).toBe(false);
    expect(PART_TEMPLATE.fragment).toContain('window.__partSeek');
    expect(PART_TEMPLATE.fragment).not.toMatch(/transition|@keyframes|animation:/i);

    const port = new InMemoryAnimation({ writeMs: 0 });
    const draft = await firstValueFrom(port.askDraft({ request: 'a row of bars' }));
    const saved = await firstValueFrom(port.saveDraft(draft.id, PART_TEMPLATE));
    expect(saved.state).toBe('ready');
  });
});
