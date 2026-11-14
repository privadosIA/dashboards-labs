/** The three generators the server can use for a song. */
export type GeneratorName = 'heartmula' | 'ace-step' | 'diffrhythm2';

export type VocalGender = 'random' | 'female' | 'male';

/** The form the user is on. */
export type Mode = 'easy' | 'custom';

/** One group of the style vocabulary (genre, mood, instrument...). */
export interface TagCategory {
  id: string;
  tags: readonly string[];
}

/** A popular set of tags that makes a first choice easy. */
export interface TagCombo {
  id: string;
  name: string;
  tags: readonly string[];
}

/** The vocabulary of style tags the server offers, as it came. */
export interface TagVocabulary {
  categories: readonly TagCategory[];
  combos: readonly TagCombo[];
}

/** Whether a generator can be used now and, when it cannot, why (the server's reason code and its detail). */
export interface EngineStatus {
  generator: GeneratorName;
  available: boolean;
  reason?: string;
  detail?: string;
}

/** The state of the container of an engine. */
export type ContainerState = 'stopped' | 'starting' | 'running';

/** What the server can start and stop for music: the two generators with a container, and LAION-CLAP, which only listens. */
export type EngineId = 'heartmula' | 'diffrhythm2' | 'clap';

/** An engine with a container: whether it can be used now, why not, and what its container is doing (when the server says). */
export interface ContainerStatus {
  engine: EngineId;
  available: boolean;
  reason?: string;
  detail?: string;
  container?: ContainerState;
}

/** What a song is made from, once everything is written. */
export interface SongRequest {
  title: string;
  lyrics: string;
  /** The style: tags separated by commas (HeartMuLa, DiffRhythm2) or a sentence (ACE-Step). */
  style: string;
  generator: GeneratorName;
  instrumental: boolean;
  /** How long the song is, in seconds, when the caller knows (a plan from a sentence names one); without it the two minutes the studio always used. */
  seconds?: number;
}

/** What the assistant is asked to write from, and what it answers. */
export interface WriteRequest {
  /** The title (Custom) or the prompt (Easy). */
  text: string;
  generator: GeneratorName;
  instrumental: boolean;
  /** A saved provider that replaces the assistant's routing for this call only (the routing is not written). */
  provider?: string;
  /** An assistant model of the server (or of that provider); absent = the server's. */
  model?: string;
}

export interface Written {
  /** Easy has no title of its own: the assistant proposes one; empty when it did not. */
  title: string;
  lyrics: string;
  style: string;
}

/** Where a song is. Each state carries only what it has. */
export type SongState =
  | { phase: 'queued'; position?: number }
  | { phase: 'running' }
  | { phase: 'done'; url: string; seconds: number }
  | { phase: 'failed'; reason: string }
  | { phase: 'cancelled' };

export interface Song {
  id: string;
  title: string;
  /** The style it was made with, as written. */
  style: string;
  /** What was sung, as written; empty for an instrumental song. */
  lyrics: string;
  instrumental: boolean;
  generator: GeneratorName;
  /** When it was asked for, in milliseconds since the epoch. */
  createdAt: number;
  state: SongState;
}

export const isFinished = (song: Song): boolean => song.state.phase === 'done' || song.state.phase === 'failed' || song.state.phase === 'cancelled';

/** What the server heard in a song or a video: how it sounds in words, and what it measured. */
export interface Heard {
  /** Genre, mood, instruments and voice, in English words. */
  style: string;
  /** Tags the server already normalised (it gives them for a YouTube video), to join those found in `style`. */
  tags?: readonly string[];
  bpm?: number;
  keyscale?: string;
  /** What the words of the lyrics are about, in their language; empty with no words. */
  theme: string;
  /** How it sounds, in plain words (timbre, bass, texture, dynamics). */
  sound: readonly string[];
  /** The assistant could not name a genre: the style describes only the sound. */
  genreUnknown: boolean;
  /** Fewer than four words recognised: it may be instrumental. */
  noWords: boolean;
}
