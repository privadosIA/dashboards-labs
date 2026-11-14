import { toPart } from '@lab/vector-editor';
import { sampleDocument } from '@lab/vector-editor/testing';

import { ANIMATION_LINKS } from './animation-links';

describe('where the Animation section continues', () => {
  it('edits a piece in Motion Edit and has the vector catalog under the section', () => {
    expect(ANIMATION_LINKS.pieceEditor!('api-mm-1')).toBe('/animation/motion-edit/pieces/api-mm-1');
    expect(ANIMATION_LINKS.vectorCatalog).toBe('/animation/vector/catalog');
  });

  it('opens a part that carries a vector model in the Vector editor, by name', () => {
    const made = toPart(sampleDocument(), { name: 'logo', description: 'A logo' });
    if ('problems' in made) throw new Error(made.problems.join());
    expect(ANIMATION_LINKS.partInVector!({ name: 'logo', manifest: made.manifest, fragment: made.fragment })).toEqual({ path: '/animation/vector/editor', query: { part: 'logo' } });
  });

  it('does not offer it on a part written as code, nor on one whose model is broken', () => {
    expect(ANIMATION_LINKS.partInVector!({ name: 'bars', manifest: '{}', fragment: '<div>bars</div>' })).toBeNull();
    expect(ANIMATION_LINKS.partInVector!({ name: 'bad', manifest: '{}', fragment: '<script data-vector-model>{not json</script>' })).toBeNull();
  });
});
