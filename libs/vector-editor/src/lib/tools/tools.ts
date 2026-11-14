import type { DrawnKind } from '../model/document';

/** What a click or a drag on the canvas does: select, or draw one kind of node. */
export type Tool = 'select' | DrawnKind;
export const TOOLS: readonly Tool[] = ['select', 'rect', 'ellipse', 'line', 'text', 'image'];

/** The keyboard shortcut of each tool (a letter, case does not matter). */
export const TOOL_KEYS: Readonly<Record<Tool, string>> = { select: 'v', rect: 'r', ellipse: 'e', line: 'l', text: 't', image: 'i' };

/** The tool a key chooses, if any. */
export function toolForKey(key: string): Tool | undefined {
  const k = key.toLowerCase();
  return TOOLS.find((tool) => TOOL_KEYS[tool] === k);
}

/** Whether the tool draws by dragging (the text and the image are placed by a click). */
export const drawsByDragging = (tool: Tool): tool is 'rect' | 'ellipse' | 'line' => tool === 'rect' || tool === 'ellipse' || tool === 'line';
