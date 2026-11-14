import { FEATURE_REVIEW, FEATURE_SCENE, FEATURE_THEME, type Catalog } from '@lab/animation-core';

type Listed = Pick<Catalog, 'features'> | null | undefined;

/** Whether the server writes scenes (a Scene button, the batch and the scene badge are drawn only then). */
export const hasSceneFeature = (catalog: Listed): boolean => !!catalog?.features?.includes(FEATURE_SCENE);
/** Whether the server reviews drafts and pieces (the review settings, the marks and Review piece). */
export const hasReviewFeature = (catalog: Listed): boolean => !!catalog?.features?.includes(FEATURE_REVIEW);
/** Whether the design carries a theme and a crossfade. */
export const hasThemeFeature = (catalog: Listed): boolean => !!catalog?.features?.includes(FEATURE_THEME);
