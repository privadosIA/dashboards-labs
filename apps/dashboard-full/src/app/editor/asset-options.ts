/**
 * Inventory entries that can be chosen as a Piper voice. A voice is the
 * `.onnx` file; its `.onnx.json` companion sits beside it in `voices/` and
 * is listed by the inventory too, but selecting it as the voice would make
 * Piper fail.
 */
export function selectableVoices(names: string[]): string[] {
  return names.filter((n) => n.toLowerCase().endsWith('.onnx'));
}

/** How a speaker of a multi-speaker voice is shown: Piper's own M and F read as man and woman. */
export function speakerLabel(name: string): string {
  if (name === 'M') return $localize`:@@speaker.male:Man`;
  if (name === 'F') return $localize`:@@speaker.female:Woman`;
  return name;
}
