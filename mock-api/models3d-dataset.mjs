// A dataset of 3D models, as the server reads it (`POST /api/import/preview` with `mode: "models3d"`): each tuple `[id, title, lora, text]` is an object, the lines of its text before the
// first marker are the prompt of ONE object alone (joined with spaces, up to 1000 characters) and one-line markers set the rest (`Engine:`, `Detail:`, `Variants:`, `Seed:`, `Image:`, `Adult:`, in any case).
// The id is made plain (lower case, digits, dashes, up to 32 characters) and unique with a number, with a warning; an entry the server cannot read goes to `rejected` naming the line; `Image:` makes the
// picture of the model that file and the entry has no prompt (the prompt is discarded); `Adult: true` is a 422 `content_not_allowed` on a server that does not keep adult content.
const ENGINES = ['triposr', 'sf3d'];
const DETAILS = ['low', 'normal', 'high'];
const MARKER = /^(engine|detail|variants|seed|image|adult)\s*:\s*(.*)$/i;
const PICTURE = /\.(png|jpe?g|webp)$/i;
const MAX_PROMPT = 1000;

const plain = (id) =>
  String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');

/** What the server answers for a dataset of models: the preview, or `{ refused }` with the status and words of a refusal, or `null` for a file that is not a dataset. */
export function readModelsDataset(content, { adultKept = false } = {}) {
  let rows;
  try {
    rows = JSON.parse(content);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || !rows.length || !rows.every((r) => Array.isArray(r) && r.length >= 4 && r.every((c) => typeof c === 'string'))) return null;

  const warnings = [];
  const taken = new Set();
  const read = rows.map(([rawId, , , full], i) => {
    const lines = full.split('\n').map((l) => l.trim());
    const marks = {};
    const prompt = [];
    const discarded = [];
    let problem = null;
    let seenMarker = false;
    for (const line of lines) {
      const m = MARKER.exec(line);
      if (m) {
        seenMarker = true;
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'engine' && !ENGINES.includes(value)) problem ??= `Engine: "${value}" is not triposr or sf3d`;
        else if (key === 'detail' && !DETAILS.includes(value)) problem ??= `Detail: "${value}" is not low, normal or high`;
        else if (key === 'variants' && !(/^\d+$/.test(value) && +value >= 1 && +value <= 4)) problem ??= `Variants: "${value}" is not a number from 1 to 4`;
        else if (key === 'seed' && !/^-?\d+$/.test(value)) problem ??= `Seed: "${value}" is not a whole number`;
        else if (key === 'image' && !PICTURE.test(value)) problem ??= `Image: "${value}" is not the name of a .png, .jpg, .jpeg or .webp file`;
        else if (key === 'adult' && !/^(true|false)$/i.test(value)) problem ??= `Adult: "${value}" is not true or false`;
        marks[key] = value;
      } else if (line && !seenMarker) prompt.push(line);
      else if (line) discarded.push(`a line after the markers: ${line.slice(0, 40)}`);
    }
    const text = prompt.join(' ');
    if (marks.image !== undefined && text) discarded.push('the text: an entry with its own picture has no prompt');
    if (marks.image !== undefined && !problem) discarded.push(`Image ${marks.image} has to be in the project's sources: a dataset cannot carry it (the confirmation refuses the project without it)`);
    if (!problem && marks.image === undefined && !text) problem = 'entry yields an empty prompt: write the text of one object or an Image: line';
    if (!problem && text.length > MAX_PROMPT && marks.image === undefined) problem = `the text has ${text.length} characters: at most ${MAX_PROMPT}`;
    if (!problem && marks.image !== undefined && marks.variants !== undefined && +marks.variants > 1) discarded.push('Variants: an entry with its own picture makes one model');

    let id = plain(rawId) || 'object';
    if (taken.has(id)) {
      let n = 2;
      while (taken.has(`${id.slice(0, 29)}-${n}`)) n++;
      id = `${id.slice(0, 29)}-${n}`;
    }
    taken.add(id);
    if (id !== rawId) {
      const said = `id "${rawId}" was changed to "${id}" (a plain lower-case name that no other entry has)`;
      warnings.push(`${rawId}: ${said}`);
      discarded.unshift(said);
    }
    return { rawId, id, text, marks, problem, discarded };
  });

  if (read.some((r) => !r.problem && String(r.marks.adult).toLowerCase() === 'true') && !adultKept) {
    return { refused: [422, { error: { code: 'content_not_allowed', message: 'this server does not keep adult content: remove the Adult: true lines' } }] };
  }

  const usable = read.filter((r) => !r.problem);
  for (const r of usable) if (r.marks.image !== undefined) warnings.push(`${r.rawId}: Image ${r.marks.image} has to be in the project's sources: a dataset cannot carry it (the confirmation refuses the project without it)`);
  const yamlOf = (r) => {
    const fields = [`  - id: ${JSON.stringify(r.id)}`];
    if (r.marks.image !== undefined) fields.push(`    image: ${JSON.stringify(r.marks.image)}`);
    else fields.push(`    prompt: ${JSON.stringify(r.text)}`);
    if (r.marks.engine) fields.push(`    engine: ${r.marks.engine}`);
    if (r.marks.detail) fields.push(`    detail: ${r.marks.detail}`);
    if (r.marks.variants && r.marks.image === undefined && +r.marks.variants > 1) fields.push(`    variants: ${r.marks.variants}`);
    if (r.marks.seed) fields.push(`    seed: ${r.marks.seed}`);
    if (String(r.marks.adult).toLowerCase() === 'true') fields.push('    adult: true');
    return fields.join('\n');
  };
  const mapped = (r) => [r.marks.image !== undefined ? `image ← ${r.marks.image}` : `prompt ← ${r.text.length} chars`, ...Object.entries(r.marks).filter(([k]) => k !== 'image').map(([k, v]) => `${k} ← ${v}`)];
  return {
    yaml: `# Generated by \`veritmo import --mode models3d\`. Check the models below and set the\n# image model (commented) that draws the picture of each prompt before running it.\n\nproject: imported\n\noutput:\n  mode: models3d\n\ndefaults:\n  model: models/Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors\n  resolution: 768x768\n  sampler: euler\n  steps: 20\n  # models3d: {engine: triposr, detail: normal}\n\nmodels:\n${usable.map(yamlOf).join('\n')}\n`,
    report: `${read.map((r) => (r.problem ? `[${r.rawId}]\n  rejected: ${r.problem}` : `[${r.rawId}]\n${mapped(r).map((m) => `  mapped: ${m}`).join('\n')}${r.discarded.map((d) => `\n  discarded: ${d}`).join('')}`)).join('\n')}\nimported ${usable.length}, rejected ${read.length - usable.length}`,
    entries: read.map((r) => (r.problem ? { id: r.rawId, mapped: null, discarded: null, rejected: r.problem } : { id: r.rawId, mapped: mapped(r), discarded: r.discarded.length ? r.discarded : null })),
    imported: usable.length,
    silent: 0,
    instrumental: 0,
    rejected: read.length - usable.length,
    warnings,
  };
}
