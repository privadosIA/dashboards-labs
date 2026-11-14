/** The translation between what the studio holds and what the server says: pure functions, so the adapter has none inline. */
import type { components } from '@lab/api-client';

import { STUDIO_CLIENT } from '../core/client';
import { TOOL_IDS, type EditToolInfo, type SettingSpec, type ToolId, type VideoEdit, type VideoEditRequest, type VideoEditResult } from './model';

export type ServerEdit = components['schemas']['VideoEdit'];
export type ServerVideoEditTool = components['schemas']['VideoEditTool'];
export type ServerVideoEditRequest = components['schemas']['VideoEditRequest'];
type ServerSetting = components['schemas']['VideoEditSetting'];
type ServerResult = components['schemas']['VideoEditResult'];

const toSetting = (s: ServerSetting): SettingSpec => ({
  name: s.name,
  kind: s.kind,
  ...(s.values ? { values: s.values as (string | number)[] } : {}),
  ...(s.min !== undefined ? { min: s.min } : {}),
  ...(s.max !== undefined ? { max: s.max } : {}),
  ...(s.default !== undefined ? { default: s.default as string | number | boolean } : {}),
  ...(s.description ? { description: s.description } : {}),
  ...(s.required ? { required: true } : {}),
});

export const toTool = (t: ServerVideoEditTool): EditToolInfo => ({
  id: t.id,
  name: t.name,
  description: t.description,
  available: t.available,
  ...(t.reason ? { reason: t.reason } : {}),
  needsImage: t.needs_image,
  acceptsMotion: !!t.accepts_motion,
  notes: t.notes ?? [],
  settings: t.settings.map(toSetting),
});

const toResult = (r: ServerResult, urlOf: (address: string) => string): VideoEditResult => ({
  video: urlOf(r.video),
  format: r.format,
  hasAudio: r.has_audio,
  ...(r.width !== undefined ? { width: r.width } : {}),
  ...(r.height !== undefined ? { height: r.height } : {}),
  ...(r.fps !== undefined ? { fps: r.fps } : {}),
  ...(r.duration !== undefined ? { duration: r.duration } : {}),
  ...(r.engine ? { engine: r.engine } : {}),
  notes: r.notes ?? [],
  ...(r.extended_times !== undefined ? { extendedTimes: r.extended_times } : {}),
});

/** An edit of the server as the studio holds it. `urlOf` turns the video address into one a `<video>` can open. */
export function toEdit(e: ServerEdit, urlOf: (address: string) => string): VideoEdit {
  const tool = (TOOL_IDS as readonly string[]).includes(e.tool) ? (e.tool as ToolId) : e.request.tool;
  return {
    id: e.id,
    tool,
    settings: (e.request.settings ?? {}) as VideoEdit['settings'],
    ...(e.request.motion ? { motion: e.request.motion } : {}),
    state: e.state,
    progress: e.progress,
    createdAt: e.created_at,
    ...(e.result ? { result: toResult(e.result, urlOf) } : {}),
    ...(e.error ? { error: e.error } : {}),
  };
}

/** The `request` part of the form: the tool, the settings that were given, the motion if any, and who asks. */
export function toServerRequest(request: VideoEditRequest, client = STUDIO_CLIENT): ServerVideoEditRequest {
  return {
    tool: request.tool,
    ...(Object.keys(request.settings).length ? { settings: request.settings } : {}),
    ...(request.motion ? { motion: request.motion } : {}),
    client,
  };
}
