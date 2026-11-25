import { SceneFailed } from './port';
import type { Texts } from './core/texts';

/** The most the server takes in an idea, and the range of a scene's length in seconds. */
export const MAX_IDEA = 2000;
export const MIN_SECONDS = 0.5;
export const MAX_SECONDS = 600;

export type BlenderCall = 'write' | 'save' | 'preview';

/**
 * What the section says when one of the operations fails, told apart by status. `400`, `409` and `503` keep the words of the server (for
 * a save they are the faults by their place in the JSON; for a missing Blender they carry how to install it), `404` says to write the
 * scene first and `422` carries the last problem with a hint to try again.
 */
export function blenderProblem(e: unknown, call: BlenderCall, t: Texts['problem']): string {
  const failed = e instanceof SceneFailed ? e : null;
  const said = failed?.said ?? '';
  switch (failed?.status) {
    case 404:
      return t.noScene;
    case 422:
      return `${said || t.noValid} ${t.tryAgain}`;
    case 503:
      return said || (call === 'preview' ? t.noBlender : t.noModel);
    default:
      return said || (e instanceof Error && !failed ? e.message : '') || t.failed;
  }
}

/** What is wrong with a text that should be JSON (where it breaks, when the browser says), or '' when it parses to an object. */
export function jsonProblem(text: string, t: Texts['problem']): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    const at = /position (\d+)/.exec(message);
    if (at) {
      const before = text.slice(0, Number(at[1]));
      const line = before.split('\n').length;
      const column = Number(at[1]) - before.lastIndexOf('\n');
      return t.badJsonAt(line, column);
    }
    return t.badJson;
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? '' : t.notObject;
}
