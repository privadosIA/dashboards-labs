import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The file a theme spec reads from the dashboard (the workspace runs the tests from its root). */
export const readSource = (relative: string): string => readFileSync(join(process.cwd(), 'apps/dashboard-full', relative), 'utf8');

const declared = (block: string): Record<string, string> =>
  Object.fromEntries([...block.matchAll(/--(lab-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** The tokens of src/theme/_tokens.scss: the light values (`:root`) and the dark ones (`prefers-color-scheme: dark`). */
export function tokens(): { text: string; light: Record<string, string>; dark: Record<string, string> } {
  const text = readSource('src/theme/_tokens.scss');
  const at = text.indexOf('@media (prefers-color-scheme: dark)');
  const darkEnd = text.indexOf(":root[data-theme='dark']");
  return { text, light: declared(text.slice(0, at)), dark: declared(text.slice(at, darkEnd)) };
}
