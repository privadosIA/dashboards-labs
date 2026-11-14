/** One marker line of an entry's text: `Name: value`. For graphics a parameter is `Param <name>: value`; for songs `Instrumental` may stand alone. */
export interface Marker {
  readonly name: string;
  readonly value: string;
}

/** An entry's text read apart: the description (every line that is not a marker) and its markers, in order. */
export interface ParsedText {
  readonly prompt: string;
  readonly markers: readonly Marker[];
  /** Lines that look like markers the kit does not know are kept in the prompt, not lost. */
  readonly unread: readonly string[];
}

/** The markers the server's import reads, by mode: the video and music grammar and the graphics one. */
export const KNOWN_MARKERS = ['Dialogue', 'Negative', 'Motion', 'Seed', 'Variants', 'Silence', 'Speed', 'Graphic', 'Duration', 'Overlay', 'Part', 'Text', 'BPM', 'Design', 'Lyrics', 'Tags', 'Instrumental', 'Key'] as const;
/** A marker whose value goes on over the lines that follow, until the next marker (a song's lyrics). */
const MULTILINE = new Set(['Lyrics']);

const LINE = new RegExp(`^(${KNOWN_MARKERS.join('|')}|Param\\s+[^:\\n]+?)\\s*:\\s*(.*)$`, 'i');
const BARE = /^Instrumental\s*$/i;

const canonical = (name: string): string => {
  const param = /^param\s+(.+)$/i.exec(name);
  if (param) return `Param ${param[1].trim()}`;
  return KNOWN_MARKERS.find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
};

/** Reads the text of an entry: marker lines out, everything else is the description. */
export function parseText(text: string): ParsedText {
  const prompt: string[] = [];
  const markers: { name: string; value: string }[] = [];
  let open: { name: string; value: string } | null = null;
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trim());
    if (m) {
      open = { name: canonical(m[1]), value: m[2].trim() };
      markers.push(open);
      if (!MULTILINE.has(open.name)) open = null;
      continue;
    }
    if (BARE.test(line.trim())) {
      markers.push({ name: 'Instrumental', value: '' });
      open = null;
      continue;
    }
    if (open) {
      open.value = open.value ? `${open.value}\n${line}` : line;
      continue;
    }
    prompt.push(line);
  }
  const trimmed = prompt.join('\n').replace(/^\n+|\n+$/g, '');
  return { prompt: trimmed, markers: markers.map((m) => ({ name: m.name, value: m.value.replace(/\n+$/, '') })), unread: [] };
}

const line = (m: Marker): string => (m.name === 'Instrumental' && !m.value ? 'Instrumental' : `${m.name}: ${m.value}`);

/**
 * Writes an entry's text from its description and markers. Video and graphics put the markers first and the description last (as the server's own examples do); songs put the style first and then the markers, the lyrics
 * with their sections last of all.
 */
export function writeText(prompt: string, markers: readonly Marker[], order: 'markers-first' | 'prompt-first' = 'markers-first'): string {
  const lines = markers.map(line);
  const parts = order === 'markers-first' ? [...lines, prompt] : [prompt, ...lines];
  return parts.filter((p) => p !== '').join('\n');
}

/** The first value of a marker (case as the server writes it), or undefined. */
export const markerValue = (parsed: ParsedText, name: string): string | undefined => parsed.markers.find((m) => m.name === name)?.value;

/** The same markers with one set (replaced where it is, appended where it is not); an empty value takes it away. */
export function withMarker(markers: readonly Marker[], name: string, value: string): Marker[] {
  const rest = markers.filter((m) => m.name !== name);
  return value === '' && name !== 'Instrumental' ? rest : [...rest, { name, value }];
}
