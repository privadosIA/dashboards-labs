import { GENERATORS } from './generators';
import type { Song, SongRequest } from './model';

/** How long a song is, in seconds: the form has no length, the generators work well around two minutes. */
export const DEFAULT_SECONDS = 120;

type Doc = Record<string, unknown>;

/** The shortest and longest song a caller may ask for, in seconds. The server refuses what a generator cannot make. */
export const MIN_SECONDS = 10;
export const MAX_SECONDS = 600;

/** The length a request asks for: a whole number of seconds within the bounds, else the default. */
export const secondsOf = (r: Pick<SongRequest, 'seconds'>): number => (Number.isInteger(r.seconds) && r.seconds! >= MIN_SECONDS && r.seconds! <= MAX_SECONDS ? r.seconds! : DEFAULT_SECONDS);

/** The one track of a song's project. HeartMuLa and DiffRhythm2 read the style as tags; ACE-Step reads it as the prompt. */
export function trackOf(r: SongRequest): Doc {
  const title = r.title.trim();
  const style = r.style.trim();
  const lyrics = r.lyrics.trim();
  const tags = GENERATORS[r.generator].style === 'tags';
  const track: Doc = { id: 'pista_1', title, prompt: tags ? title : style || title, duration_seconds: secondsOf(r), variants: 1 };
  if (r.instrumental) track['instrumental'] = true;
  else if (lyrics) track['lyrics'] = lyrics;
  if (tags && style) track['tags'] = style;
  return track;
}

/**
 * The configuration of the project of a song, from the one the server gave the new project (`starter`): music output,
 * the single track, the generator in the defaults and the client name this dashboard goes by. The video leftovers of the
 * defaults at their zero value mean nothing here and are left out.
 */
export function configOf(starter: Doc, r: SongRequest, client: string): Doc {
  const defaults: Doc = { ...(starter['defaults'] as Doc | undefined) };
  for (const key of Object.keys(defaults)) {
    if (key !== 'music' && (defaults[key] === 0 || defaults[key] === false || defaults[key] === '')) delete defaults[key];
  }
  defaults['music'] = { ...(defaults['music'] as Doc | undefined), generator: r.generator };
  const { scenes: _scenes, ...rest } = starter;
  return { ...rest, client, output: { mode: 'music' }, defaults, tracks: [trackOf(r)] };
}

/** The most characters the assistant accepts as the text to write from. */
export const ASSIST_MAX = 2000;

/** What the assistant is asked to write from in Custom: the title, then the style and the lyrics written so far. Empty with nothing to go on. */
export function assistText(d: { title: string; lyrics: string; style: string }): string {
  const parts = [d.title.trim(), d.style.trim() ? `Style: ${d.style.trim()}` : '', d.lyrics.trim() ? `Lyrics so far:\n${d.lyrics.trim()}` : ''];
  return parts.filter(Boolean).join('\n').slice(0, ASSIST_MAX);
}

/** A title for a song the assistant gave none: the first words of the prompt, capitalised, within the limit of a title. */
export function titleFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  if (!words) return 'Song';
  return [...words.charAt(0).toUpperCase() + words.slice(1)].slice(0, 80).join('');
}

/** The request a song was made from, to ask for it again. */
export const requestOf = (song: Song): SongRequest => ({ title: song.title, lyrics: song.lyrics, style: song.style, generator: song.generator, instrumental: song.instrumental });
