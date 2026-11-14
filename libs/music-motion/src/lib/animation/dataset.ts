import sampleData from '../../../sample/sample.json';
import { FRAME_RATES, LEVELS, STYLES } from '@lab/animation-core';

type Lang = 'es' | 'en';

/** A song of a dataset: what the library lists and what the piece's song map is made from. */
export interface DatasetSong {
  project: string;
  trackId: string;
  variant: number;
  title: string;
  seconds: number;
  bpm: number;
  instrumental: boolean;
  lyrics: string;
}

export interface DatasetPiece {
  id: string;
  song: { project: string; trackId: string; variant: number };
  level: (typeof LEVELS)[number];
  style: (typeof STYLES)[number];
  fps: number;
  resolution: string;
  state: 'done' | 'draft' | 'failed';
  /** Why a failed piece failed. */
  error?: string;
}

export interface DatasetReference {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  source: string;
}

export interface DatasetPreset {
  id: string;
  name: string;
  referenceId: string;
}

export interface DatasetPart {
  name: string;
  description: string;
  /** What `manifest.json` says and what `part.html` holds, for a part that can be drawn in the browser. Both or none. */
  manifest?: Record<string, unknown>;
  fragment?: string;
}

/** The video every finished piece of a dataset plays, and its facts. The built-in dataset has it; an imported one need not. */
export interface DatasetVideo {
  file: string;
  address: string;
  seconds: number;
  bytes: number;
  width: number;
  height: number;
}

/** What the animation screens can be filled with, in the file format of `libs/music-motion/sample/README.md`. Every list may be missing. */
export interface Dataset {
  songs?: DatasetSong[];
  pieces?: DatasetPiece[];
  references?: DatasetReference[];
  presets?: DatasetPreset[];
  parts?: DatasetPart[];
  video?: DatasetVideo;
}

/** The built-in dataset: `libs/music-motion/sample/sample.json`. */
export const BUILT_IN_DATASET = sampleData as unknown as Required<Dataset>;

export const MAX_ITEMS = 200;
export const MAX_TEXT = 2000;
const RESOLUTION = /^\d{3,4}x\d{3,4}$/;
const ADDRESS = /^https?:\/\/\S+$/i;
const PART_NAME = /^[a-z][a-z0-9-]{0,39}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const isNumber = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const songKey = (s: { project: string; trackId: string; variant: number }): string => `${s.project}/${s.trackId}/${s.variant}`;

/** The sentences of the problems, in each language: the names of the lists and fields stay as they are in the file. */
const SAY = {
  en: {
    notObject: () => 'the file is not a dataset: it must be a JSON object with lists',
    notList: (l: string) => `${l}: must be a list`,
    tooLong: (l: string, n: number) => `${l}: has ${n} items and at most ${MAX_ITEMS} are accepted`,
    notItem: (at: string) => `${at}: must be an object`,
    song: (at: string) => `${at}: needs a project and a trackId`,
    variant: (at: string) => `${at}: variant must be a whole number from 0 to 99`,
    title: (at: string) => `${at}: needs a title of up to 120 characters`,
    seconds: (at: string) => `${at}: seconds must be from 1 to 3600`,
    bpm: (at: string) => `${at}: bpm must be from 20 to 400`,
    instrumental: (at: string) => `${at}: instrumental must be true or false`,
    lyrics: (at: string) => `${at}: lyrics must be text`,
    songTwice: (at: string, k: string) => `${at}: the song ${k} is listed more than once`,
    id: (at: string) => `${at}: needs an id`,
    notes: (at: string) => `${at}: notes must be text`,
    tags: (at: string) => `${at}: tags must be a list of up to 10 short texts`,
    source: (at: string) => `${at}: source must be an http or https address`,
    pieceSong: (at: string) => `${at}: song must name a project, a trackId and a variant`,
    songMissing: (at: string, k: string) => `${at}: the song ${k} is not in songs`,
    oneOf: (at: string, f: string, list: readonly unknown[]) => `${at}: ${f} must be one of ${list.join(', ')}`,
    resolution: (at: string) => `${at}: resolution must look like 1280x720`,
    state: (at: string) => `${at}: state must be done, draft or failed`,
    reason: (at: string) => `${at}: a failed piece needs the reason in error`,
    name: (at: string) => `${at}: needs a name of up to 120 characters`,
    referenceMissing: (at: string, r: string) => `${at}: the reference ${r} is not in references`,
    partName: (at: string) => `${at}: name must be lowercase words joined by hyphens`,
    partKnown: (at: string, n: string) => `${at}: the catalog already has a part named ${n}`,
    partText: (at: string) => `${at}: give both a manifest (an object) and a fragment (text), or neither`,
    description: (at: string) => `${at}: needs a description of up to 300 characters`,
    idTwice: (l: string, id: string) => `${l}: the id "${id}" is used more than once`,
    video: () => 'video: needs an address, seconds and bytes',
  },
  es: {
    notObject: () => 'el fichero no es un dataset: debe ser un objeto JSON con listas',
    notList: (l: string) => `${l}: debe ser una lista`,
    tooLong: (l: string, n: number) => `${l}: tiene ${n} elementos y se aceptan como mucho ${MAX_ITEMS}`,
    notItem: (at: string) => `${at}: debe ser un objeto`,
    song: (at: string) => `${at}: necesita project y trackId`,
    variant: (at: string) => `${at}: variant debe ser un número entero de 0 a 99`,
    title: (at: string) => `${at}: necesita un título de hasta 120 caracteres`,
    seconds: (at: string) => `${at}: seconds debe estar entre 1 y 3600`,
    bpm: (at: string) => `${at}: bpm debe estar entre 20 y 400`,
    instrumental: (at: string) => `${at}: instrumental debe ser true o false`,
    lyrics: (at: string) => `${at}: lyrics debe ser texto`,
    songTwice: (at: string, k: string) => `${at}: la canción ${k} está más de una vez`,
    id: (at: string) => `${at}: necesita un id`,
    notes: (at: string) => `${at}: notes debe ser texto`,
    tags: (at: string) => `${at}: tags debe ser una lista de hasta 10 textos cortos`,
    source: (at: string) => `${at}: source debe ser una dirección http o https`,
    pieceSong: (at: string) => `${at}: song debe nombrar project, trackId y variant`,
    songMissing: (at: string, k: string) => `${at}: la canción ${k} no está en songs`,
    oneOf: (at: string, f: string, list: readonly unknown[]) => `${at}: ${f} debe ser uno de ${list.join(', ')}`,
    resolution: (at: string) => `${at}: resolution debe ser como 1280x720`,
    state: (at: string) => `${at}: state debe ser done, draft o failed`,
    reason: (at: string) => `${at}: una pieza fallida necesita el motivo en error`,
    name: (at: string) => `${at}: necesita un nombre de hasta 120 caracteres`,
    referenceMissing: (at: string, r: string) => `${at}: la referencia ${r} no está en references`,
    partName: (at: string) => `${at}: name debe ser palabras en minúsculas unidas por guiones`,
    partKnown: (at: string, n: string) => `${at}: el catálogo ya tiene una parte llamada ${n}`,
    partText: (at: string) => `${at}: da el manifiesto (un objeto) y el fragmento (texto), o ninguno`,
    description: (at: string) => `${at}: necesita una descripción de hasta 300 caracteres`,
    idTwice: (l: string, id: string) => `${l}: el id "${id}" se repite`,
    video: () => 'video: necesita address, seconds y bytes',
  },
} as const;

/**
 * What is wrong with a dataset, as sentences in `lang` that name the item (`pieces[3]: the song a/b/0 is not in songs`); empty when
 * it is fine. It looks at the lists, the names between them and the sizes, so a wrong file is refused before anything is loaded.
 * `known` are the names of the parts the catalog already has: a dataset cannot bring one of them again.
 */
export function validateDataset(json: unknown, known: readonly string[] = [], lang: Lang = 'en'): string[] {
  const say = SAY[lang];
  if (!isObject(json)) return [say.notObject()];
  const problems: string[] = [];
  const list = (name: string): unknown[] => {
    const v = json[name];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      problems.push(say.notList(name));
      return [];
    }
    if (v.length > MAX_ITEMS) {
      problems.push(say.tooLong(name, v.length));
      return [];
    }
    return v;
  };
  const unique = (name: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(say.idTwice(name, id));
      seen.add(id);
    }
  };

  const songs = list('songs');
  const songKeys = new Set<string>();
  songs.forEach((s, i) => {
    const at = `songs[${i}]`;
    if (!isObject(s)) return void problems.push(say.notItem(at));
    if (!isText(s['project'], 80) || !s['project'] || !isText(s['trackId'], 80) || !s['trackId']) problems.push(say.song(at));
    if (!isNumber(s['variant'], 0, 99) || !Number.isInteger(s['variant'])) problems.push(say.variant(at));
    if (!isText(s['title'], 120) || !s['title']) problems.push(say.title(at));
    if (!isNumber(s['seconds'], 1, 3600)) problems.push(say.seconds(at));
    if (!isNumber(s['bpm'], 20, 400)) problems.push(say.bpm(at));
    if (typeof s['instrumental'] !== 'boolean') problems.push(say.instrumental(at));
    if (!isText(s['lyrics'], 10_000)) problems.push(say.lyrics(at));
    if (typeof s['project'] === 'string' && typeof s['trackId'] === 'string') {
      const key = songKey(s as unknown as DatasetSong);
      if (songKeys.has(key)) problems.push(say.songTwice(at, key));
      songKeys.add(key);
    }
  });

  const references = list('references');
  const referenceIds: string[] = [];
  references.forEach((r, i) => {
    const at = `references[${i}]`;
    if (!isObject(r)) return void problems.push(say.notItem(at));
    if (!isText(r['id'], 80) || !r['id']) problems.push(say.id(at));
    else referenceIds.push(r['id']);
    if (!isText(r['title'], 120) || !r['title']) problems.push(say.title(at));
    if (!isText(r['notes'])) problems.push(say.notes(at));
    if (!Array.isArray(r['tags']) || r['tags'].length > 10 || r['tags'].some((t) => !isText(t, 40))) problems.push(say.tags(at));
    if (typeof r['source'] !== 'string' || !ADDRESS.test(r['source'])) problems.push(say.source(at));
  });
  unique('references', referenceIds);

  const pieceIds: string[] = [];
  list('pieces').forEach((p, i) => {
    const at = `pieces[${i}]`;
    if (!isObject(p)) return void problems.push(say.notItem(at));
    if (!isText(p['id'], 80) || !p['id']) problems.push(say.id(at));
    else pieceIds.push(p['id']);
    const song = p['song'];
    if (!isObject(song) || typeof song['project'] !== 'string' || typeof song['trackId'] !== 'string' || typeof song['variant'] !== 'number') problems.push(say.pieceSong(at));
    else if (!songKeys.has(songKey(song as unknown as DatasetPiece['song']))) problems.push(say.songMissing(at, songKey(song as unknown as DatasetPiece['song'])));
    if (!(LEVELS as readonly unknown[]).includes(p['level'])) problems.push(say.oneOf(at, 'level', LEVELS));
    if (!(STYLES as readonly unknown[]).includes(p['style'])) problems.push(say.oneOf(at, 'style', STYLES));
    if (!(FRAME_RATES as readonly unknown[]).includes(p['fps'])) problems.push(say.oneOf(at, 'fps', FRAME_RATES));
    if (typeof p['resolution'] !== 'string' || !RESOLUTION.test(p['resolution'])) problems.push(say.resolution(at));
    if (p['state'] !== 'done' && p['state'] !== 'draft' && p['state'] !== 'failed') problems.push(say.state(at));
    else if (p['state'] === 'failed' && (!isText(p['error'], 500) || !p['error'])) problems.push(say.reason(at));
  });
  unique('pieces', pieceIds);

  const presetIds: string[] = [];
  list('presets').forEach((p, i) => {
    const at = `presets[${i}]`;
    if (!isObject(p)) return void problems.push(say.notItem(at));
    if (!isText(p['id'], 80) || !p['id']) problems.push(say.id(at));
    else presetIds.push(p['id']);
    if (!isText(p['name'], 120) || !p['name']) problems.push(say.name(at));
    if (typeof p['referenceId'] !== 'string' || !referenceIds.includes(p['referenceId'])) problems.push(say.referenceMissing(at, String(p['referenceId'])));
  });
  unique('presets', presetIds);

  const partNames: string[] = [];
  list('parts').forEach((p, i) => {
    const at = `parts[${i}]`;
    if (!isObject(p)) return void problems.push(say.notItem(at));
    if (typeof p['name'] !== 'string' || !PART_NAME.test(p['name'])) problems.push(say.partName(at));
    else if (known.includes(p['name'])) problems.push(say.partKnown(at, p['name']));
    else partNames.push(p['name']);
    if (!isText(p['description'], 300) || !p['description']) problems.push(say.description(at));
    const hasManifest = p['manifest'] !== undefined;
    const hasFragment = p['fragment'] !== undefined;
    if (hasManifest !== hasFragment || (hasManifest && (!isObject(p['manifest']) || typeof p['fragment'] !== 'string' || !p['fragment']))) problems.push(say.partText(at));
  });
  unique('parts', partNames);

  if (json['video'] !== undefined) {
    const v = json['video'];
    if (!isObject(v) || typeof v['address'] !== 'string' || !v['address'] || !isNumber(v['seconds'], 1, 3600) || !isNumber(v['bytes'], 1, 1e10)) problems.push(say.video());
  }
  return problems;
}
