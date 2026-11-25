/** A small binary glTF (a unit box, one material, one turning animation per clip name) for the in-memory library and the viewer's specs: built from typed arrays, nothing stored. */
export function sampleGlb(clips: readonly string[] = []): ArrayBuffer {
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0]);
  const parts: Uint8Array[] = [];
  const views: object[] = [];
  const accessors: object[] = [];
  let offset = 0;
  const pad = (bytes: Uint8Array) => {
    const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    out.set(bytes);
    return out;
  };
  const view = (bytes: Uint8Array, target?: number) => {
    const padded = pad(bytes);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    parts.push(padded);
    offset += padded.length;
    return views.length - 1;
  };
  accessors.push({ bufferView: view(new Uint8Array(positions.buffer), 34962), componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
  accessors.push({ bufferView: view(new Uint8Array(indices.buffer), 34963), componentType: 5123, count: indices.length, type: 'SCALAR' });
  const animations = clips.map((name, k) => {
    const seconds = 2 + (k % 3);
    const times = new Float32Array([0, seconds / 2, seconds]);
    const dir = k % 2 ? -1 : 1;
    const turn = (fraction: number) => [0, Math.sin((dir * fraction * Math.PI) / 1), 0, Math.cos((dir * fraction * Math.PI) / 1)];
    const quats = new Float32Array([...turn(0), ...turn(1 / 2), ...turn(1)]);
    const input = accessors.push({ bufferView: view(new Uint8Array(times.buffer)), componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [seconds] }) - 1;
    const output = accessors.push({ bufferView: view(new Uint8Array(quats.buffer)), componentType: 5126, count: 3, type: 'VEC4' }) - 1;
    return { name, samplers: [{ input, output }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] };
  });
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) {
    bin.set(p, at);
    at += p.length;
  }
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.5, 0.3, 1], metallicFactor: 0.1, roughnessFactor: 0.7 } }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
    ...(animations.length ? { animations } : {}),
  };
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  jsonBytes.set(text);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const bytes = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  const binAt = 20 + jsonBytes.length;
  dv.setUint32(binAt, bin.length, true);
  dv.setUint32(binAt + 4, 0x004e4942, true);
  bytes.set(bin, binAt + 8);
  return out;
}
