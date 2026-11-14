import { type AnimationDataset } from '../lib/dataset-file';

/**
 * A file with scenes comes back with new names: each scene is made again for the new piece (`scene-<end of the piece id>-<n>`, `scene.piece` the new piece). Everything else is what the
 * file had; with the names put back, the two are the same.
 */
export function expectScenesAgain(was: AnimationDataset['animation'], now: AnimationDataset['animation']): void {
  expect(now.parts).toHaveLength(was.parts!.length);
  const names = new Map<string, string>();
  now.parts!.forEach((part, i) => {
    const manifest = JSON.parse(part.text!.manifest) as { name: string; scene: { piece: string; script_piece: string } };
    const old = was.parts![i];
    const oldManifest = JSON.parse(old.text!.manifest) as { scene: { script_piece: string } };
    expect(part.name).toBe(manifest.name);
    expect(manifest.name).toMatch(/^scene-[a-z0-9]+-\d+$/);
    expect(manifest.name).not.toBe(old.name);
    expect(manifest.scene.script_piece).toBe(oldManifest.scene.script_piece);
    expect(part.text!.fragment).toBe(old.text!.fragment);
    names.set(manifest.name, old.name);
  });
  expect(new Set(now.parts!.map((p) => JSON.parse(p.text!.manifest).scene.piece)).size).toBe(1);
  const back = { ...now.script, pieces: now.script.pieces.map((p) => ({ ...p, part: names.get(p.part) ?? p.part })) };
  expect(back).toEqual(was.script);
  expect(now.design).toEqual(was.design);
}
