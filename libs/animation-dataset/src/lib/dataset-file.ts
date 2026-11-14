import { EASES, type Design, FRAME_RATES, type Level, LEVELS, MAX_EXTRA_PARTS, MAX_LAYERS, MAX_LAYER_ITEMS, MAX_RHYTHM, MIN_RHYTHM, MODES, THEME_ASSET_BYTES, THEME_ASSET_NAME, THEME_ASSETS_MAX, THEME_CSS_MAX, THEME_HUD_MAX, TRANSITION_MAX, type Script, type Style, STYLES } from '@lab/animation-core';

type Lang = 'es' | 'en';

/** The `format` every animation dataset says it has: the file is refused without it. */
export const DATASET_FORMAT = 'music-motion-dataset';
export const DATASET_VERSION = 2;

/** The largest file the import reads, in bytes. */
export const MAX_DATASET_BYTES = 5 * 1024 * 1024;
export const MAX_PARTS = 50;
export const MAX_PARTS_PER_STYLE = 8;
const MAX_NAME = 120;
const MAX_NOTES = 2000;
const MAX_TEXT = 100_000;
const MAX_REQUEST = 500;
const MAX_SCRIPT_PIECES = 400;
/** The most keyframes one parameter of a piece may have in a file. */
export const MAX_KEYFRAMES = 200;

/** A style: the design, rhythm and parts of the server's, with the address of the reference it came from so it can be linked again. */
export interface FileStyle {
  name: string;
  /** The YouTube address of the reference the style came from; missing when it had none. */
  reference?: string;
  design: Design;
  rhythm: number;
  parts: string[];
}

/** What a part is asked with and what the draft of it says: only a ready draft has it. */
export interface FilePartText {
  request: string;
  manifest: string;
  fragment: string;
}

/** A part of the user's: a ready draft carries its text; an approved one cannot be read back, so `text` is `null`. */
export interface FilePart {
  name: string;
  description: string;
  levels?: Level[];
  params?: { name: string; type: string; default: string }[];
  text: FilePartText | null;
}

export interface FileReference {
  title: string;
  notes: string;
  tags: string[];
  /** The YouTube address; missing for a video that was uploaded, which cannot be made again. */
  source?: string;
}

/** The song an animation follows, as the library names it, with its length so a script can be fitted to another song. */
export interface FileSong {
  project: string;
  trackId: string;
  variant: number;
  title: string;
  seconds: number;
}

/** The look an animation came from: the style it started from and the reference of that style. Both are optional. */
export interface FileLook {
  style?: FileStyle;
  reference?: FileReference;
}

/** One animation, without its video: what makes it reproducible on another server. */
export interface FileAnimation {
  title: string;
  song: FileSong;
  options: { style: Style; level: Level; fps: number; resolution: string };
  design: Design;
  script: Script;
  look?: FileLook;
  /** The own parts the script uses. */
  parts?: FilePart[];
}

/** The dataset of one animation: what the animation screens can take from one server and give to another. */
export interface AnimationDataset {
  format: typeof DATASET_FORMAT;
  version: typeof DATASET_VERSION;
  exportedAt?: string;
  animation: FileAnimation;
}

const PART_NAME = /^[a-z][a-z0-9-]{0,39}$/;
const COLOUR = /^#[0-9a-f]{6}$/i;
const RESOLUTION = /^\d{3,4}x\d{3,4}$/;
const ADDRESS = /^https?:\/\/\S+$/i;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isNumber = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isOneOf = <T extends string | number>(v: unknown, list: readonly T[]): v is T => (list as readonly unknown[]).includes(v);

/** The sentences of the problems, in each language: the names of the lists and fields stay as they are in the file. */
const SAY = {
  en: {
    notJson: () => 'the file is not a JSON object',
    project: () => 'the file is a project dataset of the dashboard, not an animation dataset',
    demonstration: () => 'the file is the descriptor file of the demonstration data, not an animation dataset',
    notDataset: () => `the file is not an animation dataset: it has no "format": "${DATASET_FORMAT}"`,
    lists: () => 'the file is a dataset of lists (version 1), which this dashboard no longer reads: an animation dataset has one "animation"',
    version: (v: unknown) => `version ${String(v)} is not one this dashboard reads: it reads version ${DATASET_VERSION}`,
    noAnimation: () => 'the file has no "animation": an animation dataset is the dataset of one animation',
    notList: (l: string) => `${l}: must be a list`,
    tooLong: (l: string, n: number) => `${l}: has ${n} items and at most ${MAX_PARTS} are accepted`,
    notItem: (at: string) => `${at}: must be an object`,
    seconds: (at: string) => `${at}: needs seconds, the length of the song, from 1 to 7200`,
    name: (at: string) => `${at}: needs a name of up to ${MAX_NAME} characters`,
    title: (at: string) => `${at}: needs a title of up to ${MAX_NAME} characters`,
    nameTwice: (l: string, n: string) => `${l}: "${n}" is used more than once`,
    address: (at: string, f: string) => `${at}: ${f} must be an http or https address`,
    colour: (at: string, f: string) => `${at}: ${f} must be a colour like #1d1425`,
    designText: (at: string, f: string) => `${at}: ${f} must be text`,
    mode: (at: string, f: string) => `${at}: ${f} must be one of ${MODES.join(', ')}`,
    design: (at: string) => `${at}: needs a design (an object with colours, typefaces and modes)`,
    rhythm: (at: string) => `${at}: rhythm must be from ${MIN_RHYTHM} to ${MAX_RHYTHM} seconds`,
    partsList: (at: string) => `${at}: parts must be a list of part names`,
    partsMany: (at: string, n: number) => `${at}: has ${n} parts and a style has at most ${MAX_PARTS_PER_STYLE}`,
    partName: (at: string) => `${at}: a part name must be lowercase words joined by hyphens`,
    partTwice: (at: string, n: string) => `${at}: the part "${n}" is listed more than once`,
    song: (at: string) => `${at}: needs a project, a trackId, a variant (a whole number from 0 to 99) and a title`,
    oneOf: (at: string, f: string, list: readonly unknown[]) => `${at}: ${f} must be one of ${list.join(', ')}`,
    resolution: (at: string) => `${at}: resolution must look like 1280x720`,
    script: (at: string) => `${at}: the script must be { "version": 1, "pieces": [...] } with up to ${MAX_SCRIPT_PIECES} pieces`,
    scriptPiece: (at: string) => `${at}: needs an id, a part, and a start that comes before its end`,
    themeCss: (at: string) => `${at}: the theme's css must be text of up to ${THEME_CSS_MAX} characters`,
    themeAssets: (at: string) => `${at}: the theme's assets are at most ${THEME_ASSETS_MAX} SVG drawings, each named with lowercase letters, digits and _ and of up to ${THEME_ASSET_BYTES} characters`,
    themeHud: (at: string) => `${at}: the theme's hud has up to four texts (tl, tr, bl, br) of up to ${THEME_HUD_MAX} characters`,
    transition: (at: string) => `${at}: the crossfade must be a number of seconds from 0 to ${TRANSITION_MAX}`,
    scriptWith: (at: string) => `${at}: with can have at most ${MAX_EXTRA_PARTS} parts, each with a part name`,
    animate: (at: string) => `${at}: animate must be an object of parameter names, each with a list of 1 to ${MAX_KEYFRAMES} keyframes`,
    keyframeObject: (at: string) => `${at}: a keyframe must be an object { t, value, ease }`,
    keyframeTime: (at: string, length: number) => `${at}: t must be a number from 0 to ${length} (the length of the piece, in seconds) and after the keyframe before it`,
    keyframeValue: (at: string) => `${at}: needs a value (text, a number or true or false)`,
    keyframeEase: (at: string) => `${at}: ease must be one of ${EASES.join(', ')}`,
    layers: (at: string) => `${at}: layers must be a list of up to ${MAX_LAYERS} layers { id, items }`,
    layer: (at: string) => `${at}: a layer needs an id (lower case letters, digits and dashes, up to 24 characters, not used by another layer) and a list of up to ${MAX_LAYER_ITEMS} items`,
    layerItem: (at: string) => `${at}: an item needs a part, and a start and an end in song seconds with the start before the end`,
    layerRange: (at: string, end: number) => `${at}: an item must lie inside the song (0 to ${end} s) and start after the item before it in its layer ends`,
    description: (at: string) => `${at}: needs a description of up to 300 characters`,
    text: (at: string) => `${at}: text must be null or have request, manifest and fragment as text`,
    notes: (at: string) => `${at}: notes must be text of up to ${MAX_NOTES} characters`,
    tags: (at: string) => `${at}: tags must be a list of up to 10 short texts`,
    exportedAt: () => 'exportedAt must be text',
  },
  es: {
    notJson: () => 'el fichero no es un objeto JSON',
    project: () => 'el fichero es un dataset de proyecto del dashboard, no un dataset de animación',
    demonstration: () => 'el fichero es el de descriptores de los datos de demostración, no un dataset de animación',
    notDataset: () => `el fichero no es un dataset de animación: no tiene "format": "${DATASET_FORMAT}"`,
    lists: () => 'el fichero es un dataset de listas (versión 1), que este dashboard ya no lee: un dataset de animación tiene una sola "animation"',
    version: (v: unknown) => `la versión ${String(v)} no es una que este dashboard lea: lee la versión ${DATASET_VERSION}`,
    noAnimation: () => 'el fichero no tiene "animation": un dataset de animación es el de una sola animación',
    notList: (l: string) => `${l}: debe ser una lista`,
    tooLong: (l: string, n: number) => `${l}: tiene ${n} elementos y se aceptan como mucho ${MAX_PARTS}`,
    notItem: (at: string) => `${at}: debe ser un objeto`,
    seconds: (at: string) => `${at}: necesita seconds, la duración de la canción, de 1 a 7200`,
    name: (at: string) => `${at}: necesita un nombre de hasta ${MAX_NAME} caracteres`,
    title: (at: string) => `${at}: necesita un título de hasta ${MAX_NAME} caracteres`,
    nameTwice: (l: string, n: string) => `${l}: "${n}" está más de una vez`,
    address: (at: string, f: string) => `${at}: ${f} debe ser una dirección http o https`,
    colour: (at: string, f: string) => `${at}: ${f} debe ser un color como #1d1425`,
    designText: (at: string, f: string) => `${at}: ${f} debe ser texto`,
    mode: (at: string, f: string) => `${at}: ${f} debe ser uno de ${MODES.join(', ')}`,
    design: (at: string) => `${at}: necesita un diseño (un objeto con colores, tipografías y modos)`,
    rhythm: (at: string) => `${at}: rhythm debe estar entre ${MIN_RHYTHM} y ${MAX_RHYTHM} segundos`,
    partsList: (at: string) => `${at}: parts debe ser una lista de nombres de parte`,
    partsMany: (at: string, n: number) => `${at}: tiene ${n} partes y un estilo tiene como mucho ${MAX_PARTS_PER_STYLE}`,
    partName: (at: string) => `${at}: el nombre de una parte debe ser palabras en minúscula unidas por guiones`,
    partTwice: (at: string, n: string) => `${at}: la parte "${n}" está más de una vez`,
    song: (at: string) => `${at}: necesita project, trackId, variant (un número entero de 0 a 99) y title`,
    oneOf: (at: string, f: string, list: readonly unknown[]) => `${at}: ${f} debe ser uno de ${list.join(', ')}`,
    resolution: (at: string) => `${at}: resolution debe ser como 1280x720`,
    script: (at: string) => `${at}: el guion debe ser { "version": 1, "pieces": [...] } con hasta ${MAX_SCRIPT_PIECES} piezas`,
    scriptPiece: (at: string) => `${at}: necesita id, part, y un start anterior a su end`,
    themeCss: (at: string) => `${at}: el css del tema debe ser texto de hasta ${THEME_CSS_MAX} caracteres`,
    themeAssets: (at: string) => `${at}: los assets del tema son como mucho ${THEME_ASSETS_MAX} dibujos SVG, cada uno con un nombre de minúsculas, números y _ y de hasta ${THEME_ASSET_BYTES} caracteres`,
    themeHud: (at: string) => `${at}: el hud del tema tiene hasta cuatro textos (tl, tr, bl, br) de hasta ${THEME_HUD_MAX} caracteres`,
    transition: (at: string) => `${at}: el fundido debe ser un número de segundos de 0 a ${TRANSITION_MAX}`,
    scriptWith: (at: string) => `${at}: with puede tener como mucho ${MAX_EXTRA_PARTS} partes, cada una con el nombre de una parte`,
    animate: (at: string) => `${at}: animate debe ser un objeto de nombres de parámetro, cada uno con una lista de 1 a ${MAX_KEYFRAMES} fotogramas clave`,
    keyframeObject: (at: string) => `${at}: un fotograma clave debe ser un objeto { t, value, ease }`,
    keyframeTime: (at: string, length: number) => `${at}: t debe ser un número de 0 a ${length} (la duración de la pieza, en segundos) y posterior al fotograma clave anterior`,
    keyframeValue: (at: string) => `${at}: necesita un value (texto, un número o true o false)`,
    keyframeEase: (at: string) => `${at}: ease debe ser uno de ${EASES.join(', ')}`,
    layers: (at: string) => `${at}: layers debe ser una lista de hasta ${MAX_LAYERS} capas { id, items }`,
    layer: (at: string) => `${at}: una capa necesita un id (minúsculas, dígitos y guiones, hasta 24 caracteres, que no use otra capa) y una lista de hasta ${MAX_LAYER_ITEMS} elementos`,
    layerItem: (at: string) => `${at}: un elemento necesita una parte y un start y un end en segundos de la canción, con el start antes del end`,
    layerRange: (at: string, end: number) => `${at}: un elemento debe quedar dentro de la canción (0 a ${end} s) y empezar después de que acabe el anterior de su capa`,
    description: (at: string) => `${at}: necesita una descripción de hasta 300 caracteres`,
    text: (at: string) => `${at}: text debe ser null o tener request, manifest y fragment como texto`,
    notes: (at: string) => `${at}: notes debe ser texto de hasta ${MAX_NOTES} caracteres`,
    tags: (at: string) => `${at}: tags debe ser una lista de hasta 10 textos cortos`,
    exportedAt: () => 'exportedAt debe ser texto',
  },
} as const;

type Say = (typeof SAY)[Lang];

function checkDesign(d: unknown, at: string, say: Say, out: string[]): void {
  if (!isObject(d)) return void out.push(say.design(at));
  for (const f of ['dark', 'light', 'accent'] as const) if (typeof d[f] !== 'string' || !COLOUR.test(d[f])) out.push(say.colour(at, `design.${f}`));
  for (const f of ['display', 'body'] as const) if (!isText(d[f], 60) || d[f] === '') out.push(say.designText(at, `design.${f}`));
  if (!isOneOf(d['defaultMode'], MODES)) out.push(say.mode(at, 'design.defaultMode'));
  if (!isObject(d['modes'])) out.push(say.design(at));
  else for (const [k, v] of Object.entries(d['modes'])) if (!isOneOf(v, MODES)) out.push(say.mode(at, `design.modes.${k}`));
  if (!isText(d['concept'], 500)) out.push(say.designText(at, 'design.concept'));
  for (const f of ['verseStyle', 'hitStyle'] as const) if (d[f] !== undefined && !isText(d[f], 40)) out.push(say.designText(at, `design.${f}`));
  if (d['transitionSeconds'] !== undefined && !isNumber(d['transitionSeconds'], 0, TRANSITION_MAX)) out.push(say.transition(`${at}.design.transitionSeconds`));
  if (d['theme'] !== undefined) checkTheme(d['theme'], `${at}.design.theme`, say, out);
}

/** The theme of a design, within the limits the server holds it to (it says why when it refuses one; the file is mended here instead of at the import). */
function checkTheme(t: unknown, at: string, say: Say, out: string[]): void {
  if (!isObject(t)) return void out.push(say.design(at));
  if (t['css'] !== undefined && !isText(t['css'], THEME_CSS_MAX)) out.push(say.themeCss(`${at}.css`));
  const assets = t['assets'];
  if (assets !== undefined && (!isObject(assets) || Object.keys(assets).length > THEME_ASSETS_MAX || Object.entries(assets).some(([k, v]) => !THEME_ASSET_NAME.test(k) || !isText(v, THEME_ASSET_BYTES)))) out.push(say.themeAssets(`${at}.assets`));
  const hud = t['hud'];
  if (hud !== undefined && (!isObject(hud) || Object.entries(hud).some(([k, v]) => !['tl', 'tr', 'bl', 'br'].includes(k) || !isText(v, THEME_HUD_MAX)))) out.push(say.themeHud(`${at}.hud`));
}

/** The keyframes of the parameters that change over a piece `length` seconds long: where each problem is, so a file can be mended. */
function checkAnimate(a: unknown, length: number, at: string, say: Say, out: string[]): void {
  if (!isObject(a)) return void out.push(say.animate(at));
  const seconds = Math.round(length * 1000) / 1000;
  for (const [name, list] of Object.entries(a)) {
    const here = `${at}.${name}`;
    if (name === '' || !Array.isArray(list) || list.length < 1 || list.length > MAX_KEYFRAMES) {
      out.push(say.animate(here));
      continue;
    }
    let before = -Infinity;
    list.forEach((k: unknown, n: number) => {
      const place = `${here}[${n}]`;
      if (!isObject(k)) return void out.push(say.keyframeObject(place));
      const t = k['t'];
      if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > length + 0.01 || t <= before) out.push(say.keyframeTime(place, seconds));
      else before = t;
      const v = k['value'];
      if (typeof v !== 'string' && typeof v !== 'boolean' && !(typeof v === 'number' && Number.isFinite(v))) out.push(say.keyframeValue(place));
      if (k['ease'] !== undefined && !isOneOf(k['ease'], EASES)) out.push(say.keyframeEase(place));
    });
  }
}

/** The layers of a script: their shape and limits, and the keyframes of their items against each item's own length. The catalog is the server's business. */
function checkLayers(layers: unknown, end: number, at: string, say: Say, out: string[]): void {
  if (!Array.isArray(layers) || layers.length > MAX_LAYERS) return void out.push(say.layers(at));
  const ids = new Set<string>();
  layers.forEach((l: unknown, i: number) => {
    const here = `${at}[${i}]`;
    if (!isObject(l) || typeof l['id'] !== 'string' || !/^[a-z0-9-]{1,24}$/.test(l['id']) || ids.has(l['id']) || !Array.isArray(l['items']) || l['items'].length > MAX_LAYER_ITEMS) return void out.push(say.layer(here));
    ids.add(l['id']);
    let before = 0;
    l['items'].forEach((it: unknown, n: number) => {
      const place = `${here}.items[${n}]`;
      if (!isObject(it) || !isText(it['part'], 60) || it['part'] === '' || typeof it['start'] !== 'number' || typeof it['end'] !== 'number' || !(it['start'] < it['end'])) return void out.push(say.layerItem(place));
      if (it['start'] < -0.01 || it['end'] > end + 0.01 || it['start'] < before - 0.01) out.push(say.layerRange(place, Math.round(end * 1000) / 1000));
      before = it['end'];
      if (it['params'] !== undefined && !isObject(it['params'])) out.push(say.layerItem(place));
      if (it['animate'] !== undefined) checkAnimate(it['animate'], it['end'] - it['start'], `${place}.animate`, say, out);
    });
  });
}

function checkScript(s: unknown, at: string, say: Say, out: string[]): void {
  if (!isObject(s) || s['version'] !== 1 || !Array.isArray(s['pieces']) || s['pieces'].length > MAX_SCRIPT_PIECES) return void out.push(say.script(at));
  s['pieces'].forEach((p: unknown, i: number) => {
    const here = `${at}.pieces[${i}]`;
    if (!isObject(p) || !isText(p['id'], 80) || p['id'] === '' || !isText(p['part'], 60) || p['part'] === '' || typeof p['start'] !== 'number' || typeof p['end'] !== 'number' || !(p['start'] < p['end'])) return void out.push(say.scriptPiece(here));
    if (p['transition_seconds'] !== undefined && !isNumber(p['transition_seconds'], 0, TRANSITION_MAX)) out.push(say.transition(`${here}.transition_seconds`));
    const extra = p['with'];
    if (extra !== undefined && (!Array.isArray(extra) || extra.length > MAX_EXTRA_PARTS || extra.some((e: unknown) => !isObject(e) || !isText(e['part'], 60) || e['part'] === ''))) out.push(say.scriptWith(here));
    const length = (p['end'] as number) - (p['start'] as number);
    if (p['animate'] !== undefined) checkAnimate(p['animate'], length, `${here}.animate`, say, out);
    if (Array.isArray(extra)) extra.forEach((e: unknown, k: number) => { if (isObject(e) && e['animate'] !== undefined) checkAnimate(e['animate'], length, `${here}.with[${k}].animate`, say, out); });
  });
  if (s['layers'] !== undefined) {
    const last = s['pieces'][s['pieces'].length - 1];
    checkLayers(s['layers'], isObject(last) && typeof last['end'] === 'number' ? last['end'] : 0, `${at}.layers`, say, out);
  }
}

function checkPartNames(names: unknown, at: string, say: Say, out: string[], max = Infinity): void {
  if (!Array.isArray(names)) return void out.push(say.partsList(at));
  if (names.length > max) out.push(say.partsMany(at, names.length));
  const seen = new Set<string>();
  for (const n of names) {
    if (typeof n !== 'string' || !PART_NAME.test(n)) out.push(say.partName(at));
    else if (seen.has(n)) out.push(say.partTwice(at, n));
    else seen.add(n);
  }
}

/** What a file that is not an animation dataset looks like, so the refusal can say what it is. */
function whatIsIt(file: Record<string, unknown>): 'project' | 'demonstration' | 'unknown' {
  if ('scenes' in file || 'project' in file || 'yaml' in file) return 'project';
  if (Array.isArray(file['songs']) || Array.isArray(file['presets'])) return 'demonstration';
  return 'unknown';
}

export type DatasetCheck = { ok: true; dataset: AnimationDataset } | { ok: false; problems: string[] };

function checkStyle(s: Record<string, unknown>, at: string, say: Say, out: string[]): void {
  if (!isText(s['name'], MAX_NAME) || s['name'] === '') out.push(say.name(at));
  if (s['reference'] !== undefined && (!isText(s['reference'], 500) || !ADDRESS.test(s['reference']))) out.push(say.address(at, 'reference'));
  checkDesign(s['design'], at, say, out);
  if (!isNumber(s['rhythm'], MIN_RHYTHM, MAX_RHYTHM)) out.push(say.rhythm(at));
  checkPartNames(s['parts'], `${at}.parts`, say, out, MAX_PARTS_PER_STYLE);
}

function checkReference(r: Record<string, unknown>, at: string, say: Say, out: string[]): void {
  if (!isText(r['title'], MAX_NAME) || r['title'] === '') out.push(say.title(at));
  if (!isText(r['notes'], MAX_NOTES)) out.push(say.notes(at));
  if (!Array.isArray(r['tags']) || r['tags'].length > 10 || r['tags'].some((t: unknown) => !isText(t, 40))) out.push(say.tags(at));
  if (r['source'] !== undefined && (!isText(r['source'], 500) || !ADDRESS.test(r['source']))) out.push(say.address(at, 'source'));
}

/**
 * Checks what was read from a file as the dataset of one animation. Every problem is listed, with the place it is in, and nothing is
 * accepted if there is one. The names of the fields stay as they are in the file; the sentences are in `lang`. A file of lists (the
 * first version), a project dataset and the demonstration file are refused as not being an animation dataset.
 */
export function validateAnimationDataset(json: unknown, lang: Lang): DatasetCheck {
  const say = SAY[lang];
  if (!isObject(json)) return { ok: false, problems: [say.notJson()] };
  if (json['format'] !== DATASET_FORMAT) {
    const kind = whatIsIt(json);
    return { ok: false, problems: [kind === 'project' ? say.project() : kind === 'demonstration' ? say.demonstration() : say.notDataset()] };
  }
  if (json['version'] === 1 || (json['animation'] === undefined && ['styles', 'pieces', 'parts', 'references'].some((k) => k in json))) return { ok: false, problems: [say.lists()] };
  if (json['version'] !== DATASET_VERSION) return { ok: false, problems: [say.version(json['version'])] };
  const a = json['animation'];
  if (!isObject(a)) return { ok: false, problems: [say.noAnimation()] };

  const problems: string[] = [];
  if (json['exportedAt'] !== undefined && typeof json['exportedAt'] !== 'string') problems.push(say.exportedAt());

  const at = 'animation';
  if (!isText(a['title'], MAX_NAME) || a['title'] === '') problems.push(say.title(at));
  const song = a['song'];
  if (!isObject(song) || !isText(song['project'], 200) || !song['project'] || !isText(song['trackId'], 200) || !song['trackId'] || !isNumber(song['variant'], 0, 99) || !Number.isInteger(song['variant']) || !isText(song['title'], MAX_NAME)) problems.push(say.song(`${at}.song`));
  else if (!isNumber(song['seconds'], 1, 7200)) problems.push(say.seconds(`${at}.song`));
  const o = a['options'];
  if (!isObject(o)) problems.push(say.notItem(`${at}.options`));
  else {
    const here = `${at}.options`;
    if (!isOneOf(o['style'], STYLES)) problems.push(say.oneOf(here, 'style', STYLES));
    if (!isOneOf(o['level'], LEVELS)) problems.push(say.oneOf(here, 'level', LEVELS));
    if (!isOneOf(o['fps'], FRAME_RATES)) problems.push(say.oneOf(here, 'fps', FRAME_RATES));
    if (typeof o['resolution'] !== 'string' || !RESOLUTION.test(o['resolution'])) problems.push(say.resolution(here));
  }
  checkDesign(a['design'], at, say, problems);
  checkScript(a['script'], `${at}.script`, say, problems);

  const look = a['look'];
  if (look !== undefined) {
    if (!isObject(look)) problems.push(say.notItem(`${at}.look`));
    else {
      if (look['style'] !== undefined) {
        if (isObject(look['style'])) checkStyle(look['style'], `${at}.look.style`, say, problems);
        else problems.push(say.notItem(`${at}.look.style`));
      }
      if (look['reference'] !== undefined) {
        if (isObject(look['reference'])) checkReference(look['reference'], `${at}.look.reference`, say, problems);
        else problems.push(say.notItem(`${at}.look.reference`));
      }
    }
  }

  const parts = a['parts'];
  if (parts !== undefined) {
    if (!Array.isArray(parts)) problems.push(say.notList(`${at}.parts`));
    else {
      if (parts.length > MAX_PARTS) problems.push(say.tooLong(`${at}.parts`, parts.length));
      const seen = new Set<string>();
      parts.slice(0, MAX_PARTS).forEach((p: unknown, i) => {
        const here = `${at}.parts[${i}]`;
        if (!isObject(p)) return void problems.push(say.notItem(here));
        if (typeof p['name'] !== 'string' || !PART_NAME.test(p['name'])) problems.push(say.partName(here));
        else if (seen.has(p['name'])) problems.push(say.nameTwice(`${at}.parts`, p['name']));
        else seen.add(p['name']);
        if (!isText(p['description'], 300) || p['description'] === '') problems.push(say.description(here));
        const text = p['text'];
        if (text !== null && (!isObject(text) || !isText(text['request'], MAX_REQUEST) || !isText(text['manifest'], MAX_TEXT) || !isText(text['fragment'], MAX_TEXT))) problems.push(say.text(here));
      });
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, dataset: json as unknown as AnimationDataset };
}
