// Client-side mirror of the cheap, stable rules the Go loader enforces on a
// music project's tracks (internal/config, validateMusic). The server stays
// authoritative: its message wins on disagreement and is attached to the
// track and field it names (see serverTrackErrors).
import { Mix, MixClip, Track } from '../core/api.models';

/** Same pattern as the server's track ids: they become file names. */
export const TRACK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type TrackField = 'id' | 'prompt' | 'variants' | 'duration' | 'bpm' | 'adapter' | 'source' | 'strength' | 'region' | 'stem' | 'tags';

export type TrackErrors = Partial<Record<TrackField, string>>;

export interface MusicValidation {
  tracks: TrackErrors[];
  /** true when nothing blocks a save. */
  valid: boolean;
}

export function validateTracks(tracks: Track[]): MusicValidation {
  const out: MusicValidation = { tracks: [], valid: true };
  const seen = new Map<string, number>();
  tracks.forEach((t, i) => {
    const e: TrackErrors = {};
    if (!t.id || !TRACK_ID_PATTERN.test(t.id)) {
      e.id = $localize`:@@music.val.idInvalid:The id only allows letters, digits, “.”, “_” and “-”, and must start with a letter or digit`;
    } else if (seen.has(t.id)) {
      e.id = $localize`:@@music.val.idDup:Duplicate id: already used by track ${seen.get(t.id)! + 1}:index:`;
    } else {
      seen.set(t.id, i);
    }
    if (!t.prompt || t.prompt.trim() === '') {
      e.prompt = $localize`:@@music.val.promptEmpty:Describe the style: the prompt can't be empty`;
    }
    if (t.variants != null && (!Number.isInteger(t.variants) || t.variants < 1)) {
      e.variants = $localize`:@@music.val.variants:Variants must be an integer ≥ 1`;
    }
    if (t.duration_seconds != null && !(t.duration_seconds > 0)) {
      e.duration = $localize`:@@music.val.duration:Duration must be greater than 0`;
    }
    if (t.bpm != null && (!Number.isInteger(t.bpm) || t.bpm <= 0)) {
      e.bpm = $localize`:@@music.val.bpm:The bpm must be an integer greater than 0`;
    }
    if (t.adapter_scale != null && !(t.adapter_scale >= 0)) {
      e.adapter = $localize`:@@music.val.adapterScale:The adapter strength can't be negative`;
    }
    if (t.task) {
      if (!t.source) {
        e.source = $localize`:@@music.val.source:Choose the source song`;
      }
      if (t.cover_strength != null && !(t.cover_strength >= 0 && t.cover_strength <= 1)) {
        e.strength = $localize`:@@music.val.strength:Strength ranges from 0 to 1`;
      }
      if (t.repaint_start != null && t.repaint_end != null && !(t.repaint_end > t.repaint_start)) {
        e.region = $localize`:@@music.val.region:The end must be greater than the start`;
      }
      if (t.task === 'extract' && !t.stem) {
        e.stem = $localize`:@@music.val.stem:Choose what to extract`;
      }
    }
    if (Object.keys(e).length > 0) {
      out.valid = false;
    }
    out.tracks[i] = e;
  });
  return out;
}

/** One rejection from the server, tied to the track and field it names when it names them. */
export interface ServerTrackError {
  trackId: string | null;
  field: TrackField | null;
  text: string;
}

/**
 * Splits the server's validation message (one rejection per line) and ties
 * each line to the track it names (`track "id"`) and, when it can tell, the
 * field. Lines that name no track (a missing model, scenes in a music
 * project) come back with a null track id and are shown for the project.
 */
export function serverTrackErrors(message: string): ServerTrackError[] {
  return message
    .split('\n')
    .map((l) => l.trim().replace(/^config:\s*/, ''))
    .filter((l) => l !== '')
    .filter((text) => !/^mix "/.test(text)) // mix rejections are read by serverMixErrors
    .map((text) => {
      const track = /track(?: id)? "([^"]+)"/.exec(text);
      return { trackId: track ? track[1] : null, field: fieldOf(text), text };
    });
}

function fieldOf(text: string): TrackField | null {
  if (/duplicate track id|invalid id/.test(text)) return 'id';
  if (/empty prompt/.test(text)) return 'prompt';
  if (/variants/.test(text)) return 'variants';
  if (/duration_seconds/.test(text)) return 'duration';
  if (/\btags\b/.test(text)) return 'tags';
  if (/bpm/.test(text)) return 'bpm';
  if (/adapter_scale/.test(text)) return 'adapter';
  if (/cover_strength/.test(text)) return 'strength';
  if (/repaint_(start|end)/.test(text)) return 'region';
  if (/\bstem\b/.test(text)) return 'stem';
  if (/\bsource\b|turbo model/.test(text)) return 'source';
  return null;
}

// --- mixes ------------------------------------------------------------------

/** The largest volume factor of a clip (as in the server). */
export const MAX_CLIP_GAIN = 2;

const SOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type ClipField = 'source' | 'start' | 'gain' | 'fades' | 'trim';

export type ClipErrors = Partial<Record<ClipField, string>>;

export interface MixErrors {
  id?: string;
  /** The master volume is out of range. */
  gain?: string;
  /** The mix has no clips. */
  clips?: string;
  clipErrors: ClipErrors[];
}

export interface MixValidation {
  mixes: MixErrors[];
  /** true when nothing blocks a save. */
  valid: boolean;
}

/** Mirror of the server's rules for mixes (internal/config/mix.go). */
export function validateMixes(mixes: Mix[], tracks: Track[]): MixValidation {
  const out: MixValidation = { mixes: [], valid: true };
  const trackIds = new Map(tracks.map((t) => [t.id, t.variants ?? 1]));
  const seen = new Set<string>();
  for (const m of mixes) {
    const e: MixErrors = { clipErrors: [] };
    if (!m.id || !TRACK_ID_PATTERN.test(m.id)) {
      e.id = $localize`:@@mix.val.idInvalid:The id only allows letters, digits, “.”, “_” and “-”, and must start with a letter or digit`;
    } else if (seen.has(m.id)) {
      e.id = $localize`:@@mix.val.idDup:Duplicate id: already used by another mix`;
    } else if (trackIds.has(m.id)) {
      e.id = $localize`:@@mix.val.idTrack:That id already belongs to a track: choose another`;
    }
    seen.add(m.id);
    if (m.gain != null && !(m.gain >= 0 && m.gain <= MAX_CLIP_GAIN)) {
      e.gain = $localize`:@@mix.val.masterGain:Master volume ranges from 0 to ${MAX_CLIP_GAIN}:max:`;
    }
    if (m.clips.length === 0) {
      e.clips = $localize`:@@mix.val.noClips:Add at least one clip`;
    }
    e.clipErrors = m.clips.map((c) => validateClip(c, trackIds));
    if (e.id || e.gain || e.clips || e.clipErrors.some((c) => Object.keys(c).length > 0)) out.valid = false;
    out.mixes.push(e);
  }
  return out;
}

function validateClip(c: MixClip, trackIds: Map<string, number>): ClipErrors {
  const e: ClipErrors = {};
  if (c.track && c.file) {
    e.source = $localize`:@@mix.val.bothSources:A clip takes its audio from a track or from a file, not both`;
  } else if (!c.track && !c.file) {
    e.source = $localize`:@@mix.val.noSource:Choose the clip's audio`;
  } else if (c.track) {
    const variants = trackIds.get(c.track);
    if (variants === undefined) {
      e.source = $localize`:@@mix.val.unknownTrack:Track “${c.track}:track:” no longer exists`;
    } else if ((c.variant ?? 1) > variants) {
      e.source = $localize`:@@mix.val.unknownVariant:Track “${c.track}:track:” has no variant ${c.variant}:variant:`;
    }
  } else if (c.file && !(SOURCE_NAME_PATTERN.test(c.file) && /\.(mp3|wav)$/i.test(c.file))) {
    e.source = $localize`:@@mix.val.badFile:The file must be an .mp3 or .wav from the project's sources`;
  }
  if (c.start != null && !(c.start >= 0)) {
    e.start = $localize`:@@mix.val.start:The start can't be negative`;
  }
  if (c.gain != null && !(c.gain >= 0 && c.gain <= MAX_CLIP_GAIN)) {
    e.gain = $localize`:@@mix.val.gain:Volume ranges from 0 to ${MAX_CLIP_GAIN}:max:`;
  }
  if ((c.fade_in != null && !(c.fade_in >= 0)) || (c.fade_out != null && !(c.fade_out >= 0))) {
    e.fades = $localize`:@@mix.val.fades:Fades can't be negative`;
  }
  if (c.trim_start != null && !(c.trim_start >= 0)) {
    e.trim = $localize`:@@mix.val.trimStart:The trim start can't be negative`;
  } else if (c.trim_end != null && !(c.trim_end > (c.trim_start ?? 0))) {
    e.trim = $localize`:@@mix.val.trimEnd:The trim end must be greater than the start`;
  }
  return e;
}

/** One rejection about a mix from the server (`mix "id" clip N: ...`). */
export interface ServerMixError {
  mixId: string | null;
  clip: number | null;
  text: string;
}

/** Reads the server's validation message for the lines that name a mix. */
export function serverMixErrors(message: string): ServerMixError[] {
  return message
    .split('\n')
    .map((l) => l.trim().replace(/^config:\s*/, ''))
    .filter((t) => /^mix(es)?\b/.test(t) || /^mix "/.test(t))
    .map((text) => {
      const mix = /mix "([^"]+)"/.exec(text);
      const clip = /clip (\d+)/.exec(text);
      return { mixId: mix ? mix[1] : null, clip: clip ? Number(clip[1]) : null, text };
    });
}
