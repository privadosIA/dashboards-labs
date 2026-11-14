import { of, type Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { touches, type Catalog, type Design, type PartText, type PieceDetail, type PiecePreview, type Script } from '@lab/animation-core';

import type { FragmentSource } from './fragment-source';
import { buildScenePage, PageBuildError } from './page-builder';
import { fadeInto } from './scene-model';
import { wrapForPreview } from './preview-wrapper';
import { scenesOf, type Fidelity, type Gap } from './scene-model';
import { sliceSongMap } from './song-slice';

/** What the frame host shows for one script piece. */
export interface ScenePage {
  readonly id: string;
  /** Where the scene sits in the song, in seconds. */
  readonly start: number;
  readonly end: number;
  readonly width: number;
  readonly height: number;
  /** The whole document for the sandboxed frame, wrapper included. */
  readonly html: string;
  readonly fidelity: Fidelity;
  readonly gaps: readonly Gap[];
  /** The crossfade into this page from the one before, in seconds (0 or absent: a cut). */
  readonly fade?: number;
  /** Why the page could not be built, when it could not: `html` then says so on the page itself. */
  readonly error?: string;
}

export interface PageInput {
  readonly piece: Pick<PieceDetail, 'width' | 'height' | 'songMap'>;
  readonly design: Design;
  readonly script: Script;
  readonly catalog: Catalog;
  /** Parts left out of every page. */
  readonly hidden?: ReadonlySet<string>;
}

/**
 * The ids of the scenes (pieces of the script) whose page draws a part: the piece's own part, an extra, or an item of a layer that shows in it.
 * After a part is replaced these are the pages to build again, and no others.
 */
export function scenesUsing(script: Script, partName: string): string[] {
  return script.pieces
    .filter((p) => p.part === partName || (p.with ?? []).some((w) => w.part === partName) || (script.layers ?? []).some((l) => l.items.some((it) => it.part === partName && touches(it, p))))
    .map((p) => p.id);
}

/** Where the pages come from: built here today; a source that asks the server for them can take its place without anything else changing. */
export interface PageSource {
  /** The pages of every script piece, or only of the named ones (the editor rebuilds one page when one piece changes). */
  pages(input: PageInput, only?: readonly string[]): Observable<readonly ScenePage[]>;
}

const errorPage = (message: string): string => `<!doctype html><html><body style="margin:0;background:#300;color:#fff;font:16px sans-serif;padding:24px"><pre style="white-space:pre-wrap">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></body></html>`;

/**
 * Asks the server for the pages (`POST /pieces/{id}/preview`): what it answers is what the render draws, so the pages are `exact`. When the server
 * cannot answer (it refuses the edit, is down, or does not have the route) the pages come from `fallback` instead and `lastProblem` says why, so
 * that an edit the server refuses is still seen and the reason is shown.
 */
export class ServerPageSource implements PageSource {
  /** Why the server's pages were not used the last time, or null when they were. */
  lastProblem: string | null = null;

  constructor(
    private readonly ask: (input: { design: Design; script: Script; scenes?: readonly string[] }) => Observable<PiecePreview>,
    private readonly fallback: PageSource,
  ) {}

  pages(input: PageInput, only?: readonly string[]): Observable<readonly ScenePage[]> {
    return this.ask({ design: input.design, script: input.script, ...(only && only.length > 0 ? { scenes: only } : {}) }).pipe(
      map((answer): readonly ScenePage[] => {
        this.lastProblem = null;
        const hidden = input.hidden;
        return answer.scenes
          .filter((s) => !hidden || !hidden.has(s.id))
          .map((s) => {
            const i = input.script.pieces.findIndex((p) => p.id === s.id);
            const fade = fadeInto(input.design, input.script, i);
            // The server's page is exact; only the dissolve between two of them is the host's, so it is said.
            return { id: s.id, start: s.start, end: s.end, width: answer.width, height: answer.height, html: s.html, fidelity: fade > 0 ? ('approximate' as const) : ('exact' as const), gaps: fade > 0 ? [{ kind: 'crossfade' as const }] : [], ...(fade > 0 ? { fade } : {}) };
          });
      }),
      catchError((e: unknown) => {
        this.lastProblem = e instanceof Error ? e.message : String(e);
        return this.fallback.pages(input, only);
      }),
    );
  }
}

/** Builds the pages in the browser with the library's own builder, reading the text of the parts through a `FragmentSource`. */
export class LocalPageSource implements PageSource {
  /** The pages built so far, by piece id, with the key of what they were built from: a piece whose key did not change keeps its page as it is. */
  private readonly built = new Map<string, { readonly key: string; readonly page: ScenePage }>();
  private builtFor: unknown;

  constructor(private readonly fragments: FragmentSource) {}

  pages(input: PageInput, only?: readonly string[]): Observable<readonly ScenePage[]> {
    const wanted = (id: string): boolean => !only || only.length === 0 || only.includes(id);
    // A new song map (another piece) invalidates every page: the slice of it that each page carries comes from it.
    if (this.builtFor !== input.piece.songMap) {
      this.built.clear();
      this.builtFor = input.piece.songMap;
    }
    const names = [...input.script.pieces.filter((p) => wanted(p.id)).flatMap((p) => [p.part, ...(p.with ?? []).map((w) => w.part)]), ...(input.script.layers ?? []).flatMap((l) => l.items.map((it) => it.part))];
    const loaded: Observable<ReadonlyMap<string, PartText | null>> = names.length > 0 ? this.fragments.load(names) : of(new Map<string, PartText | null>());
    return loaded.pipe(
      map((fragments) =>
        scenesOf({ ...input, fragments })
          .filter((s) => wanted(s.id))
          .map((s): ScenePage => {
            // The scene holds everything the page is made of (the part's text included), so what it says is the key.
            const key = JSON.stringify(s);
            const kept = this.built.get(s.id);
            if (kept?.key === key) return kept.page;
            const base = { id: s.id, start: s.start, end: s.end, width: s.width, height: s.height, fidelity: s.fidelity, gaps: s.gaps, ...(s.fade ? { fade: s.fade } : {}) };
            let page: ScenePage;
            try {
              const html = wrapForPreview(buildScenePage(s), s.duration, sliceSongMap(input.piece.songMap, s.start, s.end));
              page = { ...base, html };
            } catch (e) {
              if (!(e instanceof PageBuildError)) throw e;
              page = { ...base, html: errorPage(e.message), error: e.message };
            }
            this.built.set(s.id, { key, page });
            return page;
          }),
      ),
    );
  }
}
