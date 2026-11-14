import type { DatasetMode, ImportedEntry } from './model';

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** The text of a YAML scalar written on one line: plain, 'single' or "double" quoted. */
function scalar(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      return String(JSON.parse(v));
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

/** The lines under a key that are indented deeper than it. */
function deeper(lines: readonly string[], from: number, keyIndent: number): string[] {
  const out: string[] = [];
  for (let i = from; i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > keyIndent); i++) out.push(lines[i]);
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

/** The value of a key: on its own line, folded over the lines under it, or a `|` / `>` block. */
function valueOf(first: string, under: readonly string[]): string {
  const head = first.trim();
  if (/^[|>][+-]?\d*$/.test(head)) {
    const pad = Math.min(...under.filter((l) => l.trim()).map(indentOf));
    const body = under.map((l) => l.slice(pad));
    return (head.startsWith('|') ? body.join('\n') : body.join(' ').replace(/ {2,}/g, ' ')).trim();
  }
  return scalar([head, ...under.map((l) => l.trim())].filter(Boolean).join(' '));
}

/**
 * The first track or scene of the project file the server wrote from a dataset, as an entry. The file is the server's own, with a fixed shape (a list of
 * mappings of text); this reads that shape and nothing else, so that a whole YAML reader is not carried for it. The server gives no title: the entry's id
 * stands in when it is a name and not just a number, and the style tags are the server's `tags` line. Null when the file has no track or its shape is not what is expected.
 */
export function readFirstEntry(yaml: string, mode: DatasetMode): ImportedEntry | null {
  const lines = yaml.split('\n').filter((l) => !l.trimStart().startsWith('#'));
  const start = lines.findIndex((l) => l.trimEnd() === `${mode === 'music' ? 'tracks' : 'scenes'}:`);
  if (start < 0) return null;
  const item = lines.findIndex((l, i) => i > start && /^\s*-\s/.test(l));
  if (item < 0) return null;
  const dash = indentOf(lines[item]);
  const fields: Record<string, string> = {};
  const body = [' '.repeat(dash + 2) + lines[item].trimStart().slice(1).trimStart(), ...lines.slice(item + 1)];
  const keyIndent = dash + 2;
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (i > 0 && line.trim() && indentOf(line) <= dash) break;
    const m = indentOf(line) === keyIndent ? /^\s*([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line) : null;
    if (!m) continue;
    const under = deeper(body, i + 1, keyIndent);
    fields[m[1]] = valueOf(m[2] ?? '', under);
    i += under.length;
  }
  if (!Object.keys(fields).length) return null;
  const id = fields['id'] ?? '';
  const tags = (fields['tags'] ?? '').split(',').map((t) => t.trim()).filter(Boolean).join(', ');
  return { title: /\D/.test(id) ? id : '', style: fields['prompt'] ?? '', tags, lyrics: fields['lyrics'] ?? '' };
}
