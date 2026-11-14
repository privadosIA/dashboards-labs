import { FEATURE_SVG, type Catalog } from './model';

/** Whether the server can write an SVG from a description: it says so in the catalog, so nothing calls a route a server does not have. */
export const hasSvgFeature = (catalog: Pick<Catalog, 'features'> | null | undefined): boolean => !!catalog?.features?.includes(FEATURE_SVG);
