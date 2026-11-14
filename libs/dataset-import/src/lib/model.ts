/** What a dataset is imported as: the tracks of a music project, the scenes of a video project or the animated graphics of a motion project. */
export type DatasetMode = 'music' | 'video' | 'motion';

export type DatasetLang = 'es' | 'en';

/** What an import may ask besides the dataset: a scenes dataset can make an images project (`output.mode: images`) instead of a video one. */
export interface DatasetOptions {
  readonly outputMode?: 'video' | 'images';
}

/** What the server made of a dataset file, before anything is created. */
export interface DatasetPreview {
  /** The project file the server wrote from the dataset; confirming sends it back as it is. */
  readonly yaml: string;
  /** The server's own words about what it did with the file (what it took, what it left out and why). */
  readonly report: string;
  /** How many entries the file had. */
  readonly entries: number;
  readonly imported: number;
  /** Entries with no sound or no text of their own: silent scenes in a video, instrumental tracks in music. */
  readonly quiet: number;
  readonly rejected: number;
}

/** A project whose id is valid: letters, numbers and «._-», starting with a letter or a number, at most 64 (the server's pattern). */
export const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** A name for the project made from the file's name: what the pattern takes, nothing else. */
export function projectIdFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '');
  const cleaned = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/-+$/, '')
    .slice(0, 64);
  return cleaned;
}

/** One entry of an imported dataset, as a form takes it: what the song is about (its style), its lyrics, and a name. */
export interface ImportedEntry {
  readonly title: string;
  /** The description the dataset gave: what the server writes as the prompt of the track. */
  readonly style: string;
  /** The style tags the dataset gave (the server writes them as `tags`), separated by commas; empty when it gave none. */
  readonly tags: string;
  readonly lyrics: string;
}

export { readFirstEntry as firstEntry } from './first-entry';
