import { ProjectPatch, ProjectSummary } from '../../core/api.models';

/** What the form edits: all text, because a select holds a string (`''` not reviewed, `'false'` fine for everyone, `'true'` for adults). */
export interface DetailsModel {
  name: string;
  client: string;
  adult: string;
}

/** The clients the server makes up when a project says none: they are not names a person typed. */
const MADE_UP = new Set(['embedded', 'unknown']);

/** The three fields as text, whatever else the form left in its model (the form's model is an open record). */
export function asDetails(model: Record<string, unknown>): DetailsModel {
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return { name: text(model['name']), client: text(model['client']), adult: text(model['adult']) };
}

/** The form as a project is now. */
export function detailsOf(p: ProjectSummary): DetailsModel {
  return {
    name: p.name,
    client: p.client && !MADE_UP.has(p.client) ? p.client : '',
    adult: p.adult === undefined ? '' : p.adult ? 'true' : 'false',
  };
}

/**
 * What `PATCH /api/projects/{id}` is sent: only the fields that differ from the project. An emptied client is `null` and «not reviewed»
 * is `adult: null`, which the contract says remove them. `{}` when nothing changed.
 */
export function patchOf(from: DetailsModel, now: DetailsModel): ProjectPatch {
  const patch: ProjectPatch = {};
  const name = now.name.trim();
  if (name !== from.name.trim()) patch.name = name;
  const client = now.client.trim();
  if (client !== from.client.trim()) patch.client = client === '' ? null : client;
  if (now.adult !== from.adult) patch.adult = now.adult === '' ? null : now.adult === 'true';
  return patch;
}
