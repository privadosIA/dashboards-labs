// A sample binary glTF with real geometry, for the mock's model files and the viewer's tests: a UV sphere squashed into a rounded box-ish blob, with normals,
// one material and, per clip name, an animation that turns the node about Y (the clips differ in length and direction, so playing another one is visible).
// Nothing here is stored as a binary: the file is built on demand from typed arrays (the JSON and BIN chunks are written by hand, no dependency).

const COMPONENT_FLOAT = 5126;
const COMPONENT_UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const pad4 = (buffer, fill = 0) => {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, fill)]) : buffer;
};

/** Rings and segments of a UV sphere whose triangle count is the nearest it can make to `triangles` (2 * rings * segments - 2 * segments). */
export function gridFor(triangles) {
  const want = Math.max(8, triangles);
  const options = [];
  for (let rings = 2; rings <= 400; rings++) {
    const segments = Math.max(3, Math.round(want / (2 * rings - 2)));
    options.push({ rings, segments, delta: Math.abs(2 * segments * (rings - 1) - want), roundness: Math.abs(segments - 2 * rings) });
  }
  // within 2% of the count asked for the roundest sphere wins: a prime-ish count must not make a double cone of a thousand segments
  const tolerance = Math.max(Math.min(...options.map((o) => o.delta)), Math.ceil(want * 0.02));
  const pick = options.filter((o) => o.delta <= tolerance).sort((x, y) => x.roundness - y.roundness || x.delta - y.delta)[0];
  return { rings: pick.rings, segments: pick.segments };
}

/** A sample model: `triangles` is approximate (the nearest a sphere's grid makes), `clips` the names of its animations. */
export function makeSampleGlb({ triangles = 960, clips = [] } = {}) {
  const { rings, segments } = gridFor(triangles);
  const positions = [];
  const normals = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      // a squashed, slightly boxy blob: the power of the cosine makes the sides flatter
      const boxy = (x) => Math.sign(x) * Math.abs(x) ** 0.8;
      positions.push(boxy(nx) * 0.5, boxy(ny) * 0.4, boxy(nz) * 0.5);
      normals.push(nx, ny, nz);
    }
  }
  const indices = [];
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = a + stride;
      if (r !== 0) indices.push(a, b, a + 1);
      if (r !== rings - 1) indices.push(a + 1, b, b + 1);
    }
  }
  const position = Buffer.from(new Float32Array(positions).buffer);
  const normal = Buffer.from(new Float32Array(normals).buffer);
  const index = pad4(Buffer.from(new Uint32Array(indices).buffer));

  const views = [];
  const accessors = [];
  const chunks = [];
  let offset = 0;
  const add = (data, target) => {
    views.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(data);
    offset += data.length;
    return views.length - 1;
  };
  const bounds = (list) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < list.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], list[i + k]); max[k] = Math.max(max[k], list[i + k]); }
    return { min, max };
  };
  accessors.push({ bufferView: add(position, ARRAY_BUFFER), componentType: COMPONENT_FLOAT, count: positions.length / 3, type: 'VEC3', ...bounds(positions) });
  accessors.push({ bufferView: add(normal, ARRAY_BUFFER), componentType: COMPONENT_FLOAT, count: normals.length / 3, type: 'VEC3' });
  accessors.push({ bufferView: add(index, ELEMENT_ARRAY_BUFFER), componentType: COMPONENT_UINT, count: indices.length, type: 'SCALAR' });

  // one animation per clip: a turn about Y over 2 + k seconds, every other clip the other way
  const animations = clips.map((name, k) => {
    const seconds = 2 + (k % 4);
    const dir = k % 2 ? -1 : 1;
    const times = Buffer.from(new Float32Array([0, seconds / 4, seconds / 2, (3 * seconds) / 4, seconds]).buffer);
    const quats = [];
    for (let i = 0; i <= 4; i++) {
      const half = (dir * (i / 4) * Math.PI * 2) / 2;
      quats.push(0, Math.sin(half), 0, Math.cos(half));
    }
    const input = accessors.push({ bufferView: add(times), componentType: COMPONENT_FLOAT, count: 5, type: 'SCALAR', min: [0], max: [seconds] }) - 1;
    const output = accessors.push({ bufferView: add(Buffer.from(new Float32Array(quats).buffer)), componentType: COMPONENT_FLOAT, count: 5, type: 'VEC4' }) - 1;
    return { name, samplers: [{ input, output, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] };
  });

  const bin = pad4(Buffer.concat(chunks));
  const json = {
    asset: { version: '2.0', generator: 'dashboards-lab mock sample model' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'sample', mesh: 0 }],
    meshes: [{ name: 'sample', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'sample', pbrMetallicRoughness: { baseColorFactor: [0.82, 0.55, 0.3, 1], metallicFactor: 0.1, roughnessFactor: 0.7 } }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
    ...(animations.length ? { animations } : {}),
  };
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'latin1');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.write('JSON', 16, 'latin1');
  jsonChunk.copy(out, 20);
  const binAt = 20 + jsonChunk.length;
  out.writeUInt32LE(bin.length, binAt);
  out.write('BIN\0', binAt + 4, 'latin1');
  bin.copy(out, binAt + 8);
  return out;
}

/** How many triangles a sample made for `triangles` really has. */
export const sampleTriangles = (triangles) => {
  const { rings, segments } = gridFor(triangles);
  return 2 * segments * (rings - 1);
};
