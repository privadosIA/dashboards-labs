import type { MusicMotionLinks } from '@lab/music-motion';
import { fromPart } from '@lab/vector-editor';

/**
 * Where the work of the Animation section continues, which only this dashboard knows: a piece is edited in Motion Edit and a part of the user's that carries a vector model is opened in the Vector
 * editor (`@lab/music-motion` imports neither editor, so the dashboard says where they are and how to tell a vector part).
 */
export const ANIMATION_LINKS: MusicMotionLinks = {
  pieceEditor: (id) => `/animation/motion-edit/pieces/${id}`,
  vectorCatalog: '/animation/vector/catalog',
  partInVector: ({ name, manifest, fragment }) => ('doc' in fromPart({ manifest, fragment }) ? { path: '/animation/vector/editor', query: { part: name } } : null),
};
