import { Run } from '../core/api.models';

/** Where a finished run's result lives (spec run-monitor, "links to its result"). */
export type ResultLink =
  | { kind: 'video'; artifact: string }
  | { kind: 'gallery'; project: string }
  | { kind: 'music'; project: string };

/**
 * Maps a run to its result link, only for succeeded runs. The final
 * artifact is the MP4 in video mode and the export manifest in images
 * and music mode (the run record does not keep the effective mode when it
 * was not overridden), so the artifact name is the reliable signal. Both
 * manifests share a name, so `projectMode` — the mode of the run's project,
 * when known — tells the studio from the gallery. Both views (history and
 * monitor) use this so they always agree.
 */
export function resultLink(
  run: Pick<Run, 'state' | 'project' | 'result_available'>,
  artifact: string | undefined,
  state: string = run.state,
  projectMode?: string,
): ResultLink | null {
  if (state !== 'succeeded' || !artifact) return null;
  // The run is still in the history but its project or files are gone: there is nothing to link.
  if (run.state === 'succeeded' && run.result_available === false) return null;
  if (/\.mp4$/i.test(artifact)) return { kind: 'video', artifact };
  if (/(^|\/)manifest\.json$/i.test(artifact)) {
    return projectMode === 'music'
      ? { kind: 'music', project: run.project }
      : { kind: 'gallery', project: run.project };
  }
  return null;
}
