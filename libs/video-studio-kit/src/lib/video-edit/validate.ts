import type { EditToolInfo, SettingSpec, VideoEditRequest } from './model';

export type EditProblemCode =
  | 'tool' // unknown or unavailable
  | 'video-required'
  | 'video-and-motion'
  | 'motion-not-accepted'
  | 'image-required'
  | 'image-surplus'
  | 'setting'
  | 'server'; // the server refused it and said why

export interface EditProblem {
  code: EditProblemCode;
  /** The setting at fault, for `setting`. */
  setting?: string;
  message: string;
}

function badSetting(spec: SettingSpec, value: unknown): string | null {
  switch (spec.kind) {
    case 'choice':
      return spec.values?.includes(value as string | number) ? null : `${spec.name} must be one of ${spec.values?.join(', ')}`;
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${spec.name} must be a number`;
      if (spec.kind === 'integer' && !Number.isInteger(value)) return `${spec.name} must be a whole number`;
      if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) return `${spec.name} must be from ${spec.min} to ${spec.max}`;
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : `${spec.name} must be true or false`;
    case 'color':
      return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? null : `${spec.name} must be a colour like #00ff00`;
    case 'string':
      return typeof value === 'string' ? null : `${spec.name} must be text`;
  }
}

/**
 * The problems of a request against the tools the port lists, empty when it is valid. Both adapters use this, so the rule
 * is the same on both sides and a refused request produces nothing. The limits come from the tools' own settings.
 */
export function validateEdit(request: VideoEditRequest, tools: readonly EditToolInfo[]): EditProblem[] {
  const tool = tools.find((t) => t.id === request.tool);
  if (!tool) return [{ code: 'tool', message: `the tool ${request.tool} is not one of the available ones` }];
  const problems: EditProblem[] = [];
  if (!tool.available) problems.push({ code: 'tool', message: `${tool.name} cannot run now${tool.reason ? `: ${tool.reason}` : ''}` });
  const hasMotion = request.motion !== undefined && request.motion !== '';
  if (hasMotion && !tool.acceptsMotion) problems.push({ code: 'motion-not-accepted', message: `${tool.name} does not take a motion` });
  if (hasMotion && request.video) problems.push({ code: 'video-and-motion', message: 'use a video or a motion, not both' });
  if (!hasMotion && !request.video) problems.push({ code: 'video-required', message: 'a video is needed' });
  if (tool.needsImage && !request.image) problems.push({ code: 'image-required', message: `${tool.name} needs a reference image` });
  if (!tool.needsImage && request.image) problems.push({ code: 'image-surplus', message: `${tool.name} does not take an image` });
  for (const [name, value] of Object.entries(request.settings)) {
    const spec = tool.settings.find((s) => s.name === name);
    const message = spec ? badSetting(spec, value) : `${name} is not a setting of ${tool.name}`;
    if (message) problems.push({ code: 'setting', setting: name, message });
  }
  for (const spec of tool.settings) {
    const value = request.settings[spec.name];
    if (spec.required && (value === undefined || (typeof value === 'string' && value.trim() === ''))) {
      problems.push({ code: 'setting', setting: spec.name, message: `${spec.name} is required` });
    }
  }
  return problems;
}

/** Thrown (through the Observable) when a request is refused, here or by the server; nothing was produced. */
export class VideoEditRefused extends Error {
  constructor(readonly problems: readonly EditProblem[]) {
    super(problems.map((p) => p.message).join('; '));
    this.name = 'VideoEditRefused';
  }
}

/** Thrown when the list of tools could not be read, so the studio can say so instead of listing none. */
export class ToolsUnreadable extends Error {
  constructor(readonly reason: string) {
    super(`the video tools could not be read: ${reason}`);
    this.name = 'ToolsUnreadable';
  }
}
