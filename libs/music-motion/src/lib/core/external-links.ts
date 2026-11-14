import { InjectionToken } from '@angular/core';

/** A part of the user's, as the host needs to see it to say where it is opened. */
export interface LinkedPart {
  readonly name: string;
  readonly manifest: string;
  readonly fragment: string;
}

/** An address the host gives: the path, and the query it takes. */
export interface HostPlace {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

/**
 * The places where the work the screens show continues, which only the host knows (its editors are not the library's): where a piece is edited, where the catalog of vector parts is, and where a part of the
 * user's is opened as a vector part (`null` when it is not one). A host gives what it has; a screen draws a link only for what it was given, so a host that gives nothing sees the screens as they always were.
 */
export interface MusicMotionLinks {
  /** The address where a piece is edited. */
  readonly pieceEditor?: (pieceId: string) => string;
  /** The address of the catalog of vector parts. */
  readonly vectorCatalog?: string;
  /** Where a part of the user's is opened as a vector part, or `null` if it is not one. */
  readonly partInVector?: (part: LinkedPart) => HostPlace | null;
}

export const MUSIC_MOTION_LINKS = new InjectionToken<MusicMotionLinks>('MUSIC_MOTION_LINKS', { providedIn: 'root', factory: () => ({}) });
