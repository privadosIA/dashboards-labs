import { AssetEntry, CatalogEntry, MusicSettings, ProjectConfig, Track } from '../core/api.models';
import { AutoMachine, durationText, pictureSeconds } from '../editor/auto-plan';
import { catalogName } from '../core/catalog-text';
import { MUSIC_TIERS, MusicTier, MusicTierId, languageModels, synthesisModels, tierSettings } from './music-options';

/**
 * The music planner: for the songs of a project and the time the user is willing to wait, it chooses the
 * quality level (the synthesis model and its steps), the language model that writes what the songs lack,
 * and how many versions of each song to make, so that the best that fits in the time is made.
 *
 * Times are measured on the reference machine (an RTX 5060 Ti) for a two-minute song and scaled by length and
 * by the card; a song is cheap (seconds), so what takes long is many songs times many versions.
 */

/** Video memory the music engines need (the catalog's estimate; the measured peak is 8.4 GB). */
export const MUSIC_MIN_VRAM_MB = 9216;

const REF_SECONDS = 120;
/** Seconds the synthesis of a two-minute song takes, per level (measured 2026-10-13). */
const SYNTH_120: Record<MusicTierId, number> = { fast: 7.4, normal: 8.6, max: 12.1 };
/** Seconds the language model takes to compose a two-minute song, per size (measured). */
const LM_120: Record<'0.6B' | '1.7B' | '4B', number> = { '0.6B': 5.7, '1.7B': 8.0, '4B': 13.2 };
/** Time that does not depend on the songs. */
const FIXED_SECONDS = 5;
const PER_TRACK_SECONDS = 1;
const DEFAULT_SONG_SECONDS = 120;

/** How long the synthesis takes grows with the length: about 2.6 s plus 0.052 s per second of song. */
const synthFactor = (seconds: number): number => (2.6 + 0.052 * seconds) / (2.6 + 0.052 * REF_SECONDS);
const lmFactor = (seconds: number): number => 0.45 + 0.0046 * seconds;

export type LmSize = '0.6B' | '1.7B' | '4B';
export const lmSizeOf = (file: string): LmSize => (/0\.6B/i.test(file) ? '0.6B' : /4B/i.test(file) ? '4B' : '1.7B');

/** Whether the language model runs for a track: it composes what the track does not bring (lyrics) unless told otherwise. */
export function usesLanguageModel(t: Track): boolean {
  if (t.task) return false; // the source gives the structure
  if (t.use_lm !== undefined) return t.use_lm;
  const hasLyrics = !t.instrumental && !!t.lyrics && t.lyrics.trim() !== '';
  return !hasLyrics;
}

export function songSeconds(t: Track): number {
  return t.duration_seconds && t.duration_seconds > 0 ? t.duration_seconds : DEFAULT_SONG_SECONDS;
}

/** The resolution of a generated cover (square album art; the server's DefaultCoverResolution). */
export const COVER_RESOLUTION = '768x768';

/** How long making the project's songs takes with a level, a language model and a number of versions; a cover adds its time once per song. */
export function estimateMusicSeconds(tracks: Track[], tier: MusicTierId, lm: LmSize, variants: number, speed: number, coverSeconds = 0, cards = 1): number {
  let seconds = FIXED_SECONDS;
  for (const t of tracks) {
    const d = songSeconds(t);
    const one = SYNTH_120[tier] * synthFactor(d) + (usesLanguageModel(t) ? LM_120[lm] * lmFactor(d) : 0);
    seconds += variants * one + PER_TRACK_SECONDS;
  }
  seconds += coverSeconds * tracks.filter((t) => t.cover !== 'off').length;
  // With several cards the songs are made at the same time, one per card: n songs take ceil(n / cards) turns.
  const k = Math.min(Math.max(cards, 1), Math.max(tracks.length, 1));
  const parallel = tracks.length > 1 ? Math.ceil(tracks.length / k) / tracks.length : 1;
  return Math.round((FIXED_SECONDS + (seconds - FIXED_SECONDS) * parallel) * speed);
}

export interface MusicAutoPlan {
  tier: MusicTier;
  /** The language model file to write, or '' to leave the project's choice (no song needs one). */
  lmFile: string;
  variants: number;
  seconds: number;
  budget: number | null;
  fits: boolean;
  fastest?: number;
  notes: string[];
  machine: AutoMachine;
  songs: number;
  /** The image model that makes the covers, when the plan includes them. */
  coverEntry: CatalogEntry | null;
}

/** The ways the version count can go, most first: two at most by default, four songs per request is too many. */
const VARIANTS = [2, 1];

const LM_ORDER: LmSize[] = ['4B', '1.7B', '0.6B'];

export function planMusicAuto(
  cfg: ProjectConfig,
  installed: readonly AssetEntry[],
  machine: AutoMachine,
  budget: number | null,
  coverEntry: CatalogEntry | null = null,
  level: 'auto' | 'draft' | 'normal' | 'high' = 'auto',
): MusicAutoPlan | null {
  if (cfg.output.mode !== 'music') return null;
  const tracks = cfg.tracks ?? [];
  const notes: string[] = [];
  const synth = synthesisModels(installed);
  const tiers = [...MUSIC_TIERS].reverse().filter((t) => synth.includes(t.model));
  const lms = languageModels(installed);
  const needsLm = tracks.some(usesLanguageModel);
  const lm = LM_ORDER.map((s) => lms.find((f) => lmSizeOf(f) === s)).find((f): f is string => !!f) ?? '';
  if (tiers.length === 0) notes.push($localize`:@@musicAuto.noSynth:No synthesis model is installed: install one in Models, Music tab`);
  if (needsLm && !lm) notes.push($localize`:@@musicAuto.noLm:Some songs have no lyrics and no language model is installed to write them`);
  if (machine.vramMb > 0 && machine.vramMb < MUSIC_MIN_VRAM_MB) {
    const have = Math.round(machine.vramMb / 1024);
    notes.push($localize`:@@musicAuto.lowVram:Your card has ${have}:gb: GB and music asks for about 9: it may fail for lack of memory`);
  }
  if (tiers.length === 0) return null;
  const lmSize = lm ? lmSizeOf(lm) : '1.7B';
  // A cover is one picture per song, however many versions it has.
  const coverSeconds = coverEntry ? pictureSeconds(coverEntry, COVER_RESOLUTION, coverEntry.preset?.steps ?? 20) : 0;
  const combos = tiers.flatMap((tier) =>
    VARIANTS.map((v) => ({ tier, variants: v, seconds: estimateMusicSeconds(tracks, tier.id, lmSize, v, machine.speed, coverSeconds, machine.musicCards ?? 1) })),
  );
  // A level picks the tier (the best, the middle one or the lowest) with one version of each song; "auto" is the best that fits the budget.
  const byLevel = level === 'auto' ? null : tiers[level === 'high' ? 0 : level === 'draft' ? tiers.length - 1 : Math.floor(tiers.length / 2)];
  const chosen = byLevel ? (combos.find((c) => c.tier === byLevel && c.variants === 1) ?? null) : budget === null ? combos[0] : (combos.find((c) => c.seconds <= budget) ?? null);
  const fastest = [...combos].sort((a, b) => a.seconds - b.seconds)[0];
  const pick = chosen ?? fastest;
  return {
    tier: pick.tier,
    lmFile: needsLm ? lm : '',
    variants: pick.variants,
    seconds: pick.seconds,
    budget,
    fits: budget === null || chosen !== null,
    fastest: chosen === null ? fastest.seconds : undefined,
    notes,
    machine,
    songs: tracks.length,
    coverEntry,
  };
}

/** The level Easy mode evens the songs to: what the music platforms play at. */
export const EASY_LOUDNESS_LUFS = -14;

/** What the plan writes in `defaults.music`: the level's keys (each cleared when the level does not set it) and the language model. */
export function planSettings(plan: MusicAutoPlan): Partial<MusicSettings> {
  const patch: Partial<MusicSettings> = { ...tierSettings(plan.tier.id) };
  if (plan.lmFile) patch.lm_model = plan.lmFile;
  patch.loudness_lufs = EASY_LOUDNESS_LUFS;
  return patch;
}

/** One line per thing the plan chose. */
export function describeMusicPlan(plan: MusicAutoPlan): string[] {
  const lines = [$localize`:@@musicAuto.lineQuality:Quality: ${plan.tier.label}:tier:`];
  if (plan.lmFile) lines.push($localize`:@@musicAuto.lineLm:Language model: ${lmSizeOf(plan.lmFile)}:size:`);
  lines.push($localize`:@@musicAuto.lineVariants:Versions of each song: ${plan.variants}:n:`);
  const cards = Math.min(plan.machine.musicCards ?? 1, plan.songs);
  if (cards >= 2) lines.push($localize`:@@musicAuto.lineParallel:${cards}:n: songs are made at the same time, one on each card`);
  lines.push($localize`:@@musicAuto.lineLoudness:Loudness of the songs evened to ${EASY_LOUDNESS_LUFS}:lufs: LUFS`);
  if (plan.coverEntry) lines.push($localize`:@@musicAuto.lineCover:Cover of each song, made with ${catalogName(plan.coverEntry)}:model:`);
  return lines;
}

export { durationText };
