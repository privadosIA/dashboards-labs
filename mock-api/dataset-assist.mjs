// `POST /api/assist/dataset`, simulated: a dataset of several entries from one sentence, in the tuple shape `POST /api/import/preview` reads.
// Video entries are scenes; with `picture: "blender"` every scene is a 3D scene (`Blender: <id>.scene.json`, no `Motion:`, `Negative:` or
// `Variants:`) and the descriptions come back by file name for the caller to send with the dataset (nothing is stored in a project here).
// The refusals are the contract's: `400` (no text, a mode that does not exist, `picture` with another mode or value), `404` (a `project` that
// is not there), `422` when nothing usable was written (`[fail]` in the sentence fails a scene, as a description that does not pass 3 attempts).
import { example, MAX_IDEA } from './blender-descriptions.mjs';

const err = (status, code, message) => [status, { error: { code, message } }];
/** The most 3D scenes one call keeps (every one is up to 3 model calls on the real server). */
export const MAX_BLENDER_SCENES = 6;
const MAX_ENTRIES = 12;
const MODES = ['video', 'motion', 'music', 'models3d'];

/**
 * What the assistant writes for 3D models: the objects of the sentence (split at commas, "and" and full stops), each the prompt of ONE object alone with no scene, people or background; a sentence with
 * a single object makes three finishes of it. `Engine:`, `Detail:` and `Variants:` appear only where the sentence asks for them; `Seed:`, `Image:` and `Adult:` are never written.
 */
function modelsAnswer(text, body) {
  // what the sentence says about the engine and the detail is not an object
  const words = text.replace(/\b(sf3d|triposr|stable fast 3d|high detail|low detail)\b/gi, ' ');
  const asked = words.split(/[.;\n,]+|\band\b|\by\b/i).map((p) => p.trim()).filter(Boolean);
  let objects = asked.length ? asked : [text];
  if (objects.length === 1) objects = [objects[0], `${objects[0]}, matte black`, `${objects[0]}, brushed steel`];
  const warnings = [];
  if (objects.length > MAX_ENTRIES) warnings.push(`only the first ${MAX_ENTRIES} are kept`);
  const engine = /\bsf3d\b|stable fast/i.test(text) ? 'sf3d' : /\btriposr\b/i.test(text) ? 'triposr' : '';
  const detail = /\bhigh detail\b/i.test(text) ? 'high' : /\blow detail\b/i.test(text) ? 'low' : '';
  const variants = /\bvariants?\s+(\d)\b/i.exec(text)?.[1];
  const entries = objects.slice(0, MAX_ENTRIES).map((object, i) => {
    const prompt = object.replace(/\b(sf3d|triposr|high detail|low detail)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 200) || object.slice(0, 200);
    const markers = [engine && `Engine: ${engine}`, detail && `Detail: ${detail}`, variants && `Variants: ${variants}`].filter(Boolean);
    return [idOf(i), prompt.slice(0, 40), '', [prompt, ...markers].join('\n')];
  });
  void body;
  return { entries, mode: 'models3d', warnings };
}

const idOf = (i) => `s${String(i + 1).padStart(2, '0')}`;

export function datasetAssistHandlers({ db }) {
  return {
    'POST /api/assist/dataset': ({ body }) => {
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) return err(400, 'invalid_request', 'text: say what the dataset is about');
      if (text.length > MAX_IDEA) return err(400, 'invalid_request', `text: at most ${MAX_IDEA} characters`);
      const mode = body.mode ?? 'video';
      if (!MODES.includes(mode)) return err(400, 'invalid_request', `mode: one of ${MODES.join(', ')}`);
      if (mode === 'models3d' && (body.picture !== undefined || body.project !== undefined)) return err(400, 'invalid_request', `${body.picture !== undefined ? 'picture' : 'project'}: does not apply to the mode models3d`);
      if (mode === 'models3d') return [200, modelsAnswer(text, body)];
      const blender = body.picture !== undefined;
      if (blender && (body.picture !== 'blender' || mode === 'music')) return err(400, 'invalid_request', 'picture: only "blender", and only for a storyboard (video) or graphics (motion)');
      if (blender && body.project !== undefined && !db.projects[body.project]) return err(404, 'not_found', `project "${body.project}" not found`);
      const parts = text.split(/[.;\n]+/).map((p) => p.trim()).filter(Boolean);
      const sentences = parts.length ? parts : [text];
      const warnings = [];
      const cap = blender ? MAX_BLENDER_SCENES : MAX_ENTRIES;
      if (sentences.length > cap) warnings.push(`only the first ${cap} are kept`);
      const kept = sentences.slice(0, cap);

      const entries = [];
      const descriptions = {};
      kept.forEach((sentence, i) => {
        const id = idOf(i);
        const title = sentence.slice(0, 40);
        if (blender) {
          const gid = mode === 'motion' ? `g${String(i + 1).padStart(2, '0')}` : id;
          if (sentence.includes('[fail]')) {
            warnings.push(`scene ${gid} left out: no description that passes the checks after 3 attempts (simulated)`);
            return;
          }
          descriptions[`${gid}.scene.json`] = example();
          // a storyboard scene says what it shows after its Blender line; a graphic says what is built, how long it lasts and then its Blender line
          entries.push([gid, title, '', mode === 'motion' ? `${sentence}\nDuration: 4\nBlender: ${gid}.scene.json` : `Blender: ${gid}.scene.json\n${sentence}`]);
        } else if (mode === 'motion') {
          entries.push([`g${String(i + 1).padStart(2, '0')}`, title, '', `Graphic: ${sentence}\nDuration: 4`]);
        } else if (mode === 'music') {
          entries.push([`t${String(i + 1).padStart(2, '0')}`, title, '', `${sentence}, upbeat\nLyrics: la la la`]);
        } else {
          entries.push([id, title, '', `${body.negative ? `Negative: ${body.negative}\n` : ''}${sentence}`]);
        }
      });
      if (!entries.length) return err(422, 'validation_failed', 'nothing usable was written');
      return [200, { entries, mode, warnings, ...(blender ? { descriptions } : {}) }];
    },
  };
}
