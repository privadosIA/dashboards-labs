import { DEFAULT_RESOLUTION, FRAME_RATES, LEVELS, MAX_PICTURE_BYTES, MAX_REQUEST, MAX_RHYTHM, MIN_RHYTHM, PICTURE_TYPES, SCENE_BRIEF_MAX, STYLES, type Choices, type DraftInput, type ReferenceInput, type Style } from '@lab/animation-core';

const RESOLUTION = /^\d{3,4}x\d{3,4}$/;

/** The frame rate a style starts with: the illustrated one is drawn at 24. */
export const defaultFps = (style: Style): number => (style === 'illustrated' ? 24 : 30);

export const defaultChoices = (): Choices => ({ style: 'typographic', level: 'simple', fps: defaultFps('typographic'), resolution: DEFAULT_RESOLUTION });

/** What is wrong with the choices, as field names (`style`, `level`, `fps`, `resolution`); empty when they are fine. */
export function validateChoices(c: Choices): string[] {
  const problems: string[] = [];
  if (!STYLES.includes(c.style)) problems.push('style');
  if (!LEVELS.includes(c.level)) problems.push('level');
  if (!(FRAME_RATES as readonly number[]).includes(c.fps)) problems.push('fps');
  if (!RESOLUTION.test(c.resolution)) problems.push('resolution');
  return problems;
}

const ADDRESS = /^https?:\/\/\S+$/i;

/** What is wrong with a reference to add, as field names (`source`, `title`, `notes`, `tags`); empty when it is fine. The server decides the rest. */
export function validateReferenceInput(i: ReferenceInput): string[] {
  const problems: string[] = [];
  const url = i.url?.trim() ?? '';
  if (!i.file && !url) problems.push('source');
  else if (i.file && url) problems.push('source');
  else if (url && !ADDRESS.test(url)) problems.push('source');
  if ((i.title?.length ?? 0) > 120) problems.push('title');
  if ((i.notes?.length ?? 0) > 2000) problems.push('notes');
  if ((i.tags?.length ?? 0) > 10 || (i.tags ?? []).some((t) => t.length > 40)) problems.push('tags');
  return problems;
}

/** Tags as a person writes them (separated by commas) to the list the server takes: trimmed, no empty ones, none twice. */
export const parseTags = (text: string): string[] => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];

/** Whether a rhythm is one the server accepts. */
export const rhythmOk = (n: number): boolean => Number.isFinite(n) && n >= MIN_RHYTHM && n <= MAX_RHYTHM;

/** What is wrong with a part to ask for, as field names (`request`, `picture`); empty when it is fine. The server decides the rest. */
export function validateDraftInput(i: DraftInput): string[] {
  const problems: string[] = [];
  const request = i.request.trim();
  // A scene is asked for with its piece and an idea: the request is optional, but a picture, a reference or a base text do not go with it.
  if (i.scene) {
    if (!i.scene.piece || !i.scene.scriptPiece || (i.scene.brief?.length ?? 0) > SCENE_BRIEF_MAX || request.length > MAX_REQUEST) problems.push('scene');
    if (i.file || i.referenceId || i.frame || i.base) problems.push('picture');
    return problems;
  }
  if (!request || request.length > MAX_REQUEST) problems.push('request');
  const frame = !!(i.referenceId || i.frame);
  if (frame && i.file) problems.push('picture');
  else if (frame && !(i.referenceId && i.frame)) problems.push('picture');
  else if (i.base && (i.file || frame)) problems.push('picture');
  else if (i.file && (!(PICTURE_TYPES as readonly string[]).includes(i.file.type) || i.file.size > MAX_PICTURE_BYTES)) problems.push('picture');
  return problems;
}
