import { LibraryFailed } from '../port';
import type { Texts } from './texts';

/** What to say about a refusal: the server's own words when it gave any, otherwise its status. */
export const reasonOf = (error: unknown, t: Texts): string => (error instanceof LibraryFailed ? error.said || t.failed(error.status) : error instanceof Error ? error.message : String(error));
