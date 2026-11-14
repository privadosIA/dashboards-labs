import { buildAnimationExport } from '@lab/animation-dataset';
import type { LocalStyles } from '../animation/local-styles';
import type { AnimationPort } from '@lab/animation-core';
import { saveText } from './save-text';

/** The file name of the dataset of an animation: its title in plain letters, so two animations do not overwrite each other. */
export function animationFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'animation'}.motion.json`;
}

/**
 * Reads the animation through the port, saves its dataset as a file named after its title and returns the file's name. A failure is
 * thrown as it came, for the screen to say. The card, the page of a piece and the Datasets screen all export through this.
 */
export async function exportAnimation(port: AnimationPort, local: LocalStyles, piece: { readonly id: string; readonly title: string }): Promise<string> {
  const lookup = (id: string) => {
    const name = local.startedFrom(id);
    return name ? local.styles().find((s) => s.name === name) : undefined;
  };
  const file = await buildAnimationExport(port, piece.id, lookup);
  const name = animationFileName(piece.title);
  saveText(name, JSON.stringify(file, null, 2));
  return name;
}
