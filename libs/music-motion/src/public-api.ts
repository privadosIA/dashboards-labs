export { ANIMATION, IN_MEMORY_ANIMATION } from './lib/animation/tokens';
export { InMemoryAnimation } from './lib/animation/in-memory.adapter';
export { ServerAnimation } from './lib/animation/server.adapter';
export type { AnimationPort } from '@lab/animation-core';
export { LanguageService } from './lib/core/language';
export { MUSIC_MOTION_LINKS, type HostPlace, type LinkedPart, type MusicMotionLinks } from './lib/core/external-links';
export { MUSIC_MOTION_BASE, injectLink, linkUnder } from './lib/core/links';
export { MUSIC_MOTION_OPTIONS, type MusicMotionOptions } from './lib/core/options';
export { MUSIC_MOTION_SECTIONS, type MusicMotionSection } from './lib/core/sections';
export { textsFor, type Texts } from './lib/core/texts';
export { provideMusicMotion } from './lib/provide-music-motion';
export { musicMotionRoutes, type MusicMotionRoutesOptions } from './lib/routes';
export * from '@lab/animation-core';
export * from '@lab/animation-dataset';

// What an editor outside this library needs to edit a piece's design and stage with the same forms (none of them touches the port).
export { PieceDesignBlock as PieceDesignForm } from './lib/piece/script-editor/piece-design/piece-design';
export { StageEditor } from './lib/piece/stage-editor/stage-editor';
export { ConceptBox, CONCEPT_MAX } from './lib/piece/design-form/concept-box/concept-box';
export { designFormSchema } from './lib/piece/design-form/schema';
export { fieldOf as designFieldOf, fromModel as fromDesignModel, sectionTags, toModel as toDesignModel, type DesignField } from './lib/piece/design-form/design-model';
export { withDesignCatalog } from './lib/piece/design-form/with-design-catalog';
export { LOCK_KEY } from './lib/shared/lock';
