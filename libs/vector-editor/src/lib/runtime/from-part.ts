import type { VectorDocument } from '../model/document';
import { fromJson, VectorModelError } from '../model/json';

/** Reads the document back from the model a vector part carries. A part without one is not a vector part. */
export function fromPart(part: { manifest?: string; fragment: string }): { doc: VectorDocument } | { problem: string } {
  const match = /<script[^>]*\bdata-vector-model\b[^>]*>([\s\S]*?)<\/script>/.exec(part.fragment);
  if (!match) return { problem: 'It is not a vector part: it carries no model to open.' };
  try {
    return { doc: fromJson(match[1]) };
  } catch (e) {
    if (e instanceof VectorModelError) return { problem: `The model of the part cannot be opened: ${e.message}.` };
    throw e;
  }
}
