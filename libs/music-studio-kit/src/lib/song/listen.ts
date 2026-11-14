/**
 * How the server recognises a song: by the words (Whisper, always there), also by the sound (LAION-CLAP, when its service
 * runs), or by comparing the sound with the style (MuQ-MuLan, which the server runs on the CPU when its executable and weights are there).
 */
export type ListenMethod = 'whisper' | 'clap' | 'muq';

/** What the user chose for an import. */
export interface ListenOptions {
  method: ListenMethod;
  /** ISO 639-1 code of the lyrics; empty lets the server detect it. */
  language: string;
  /** What the user knows about the song (genre, instruments, mood): its tags join the style too. */
  hint: string;
}

/** A way to recognise a song and whether the server can use it now (`reason` says what is missing when it cannot). */
export interface Recognizer {
  id: 'whisper' | 'clap' | 'muq';
  available: boolean;
  reason?: string;
  detail?: string;
}

export const DEFAULT_LISTEN: ListenOptions = { method: 'whisper', language: '', hint: '' };

/** The most characters of the hint. */
export const HINT_MAX = 500;

/** The method an import starts with: the one that tells a style best that the server can run (MuQ-MuLan, then LAION-CLAP), else the words. */
export function defaultMethod(recognizers: readonly Recognizer[]): ListenMethod {
  if (recognizers.some((r) => r.id === 'muq' && r.available)) return 'muq';
  return recognizers.some((r) => r.id === 'clap' && r.available) ? 'clap' : 'whisper';
}
