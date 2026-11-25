import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSampleGlb, sampleTriangles } from '../mock-api/sample-model.mjs';
import { parseGlb } from '../mock-api/models3d.mjs';

const chunks = (glb) => {
  assert.equal(glb.toString('latin1', 0, 4), 'glTF');
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length, 'the header length is the file length');
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(glb.toString('latin1', 16, 20), 'JSON');
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  const binAt = 20 + jsonLength;
  assert.equal(glb.toString('latin1', binAt + 4, binAt + 8), 'BIN\0');
  return { json, bin: glb.subarray(binAt + 8, binAt + 8 + glb.readUInt32LE(binAt)) };
};

test('a sample model is a valid binary glTF with the triangles and clips asked for', () => {
  const glb = makeSampleGlb({ triangles: 960, clips: ['idle', 'walk'] });
  const { json, bin } = chunks(glb);
  assert.equal(glb.length % 4, 0);
  assert.deepEqual(json.animations.map((a) => a.name), ['idle', 'walk']);
  assert.equal(json.buffers[0].byteLength, bin.length);
  const indices = json.accessors[json.meshes[0].primitives[0].indices];
  assert.equal(indices.count / 3, sampleTriangles(960));
  assert.ok(Math.abs(sampleTriangles(960) - 960) <= 40, 'the grid lands near the triangles asked for');
});

test('every accessor and view stays inside the buffer', () => {
  const { json, bin } = chunks(makeSampleGlb({ triangles: 300, clips: ['a', 'b', 'c'] }));
  for (const v of json.bufferViews) assert.ok(v.byteOffset + v.byteLength <= bin.length);
  const bytes = { 5126: 4, 5125: 4 };
  const parts = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  for (const a of json.accessors) {
    const view = json.bufferViews[a.bufferView];
    assert.ok(a.count * bytes[a.componentType] * parts[a.type] <= view.byteLength, 'an accessor reads inside its view');
  }
});

test('the mock reads its own sample the way it reads a real model', () => {
  const read = parseGlb(makeSampleGlb({ triangles: 480, clips: ['open', 'close'] }));
  assert.equal(read.ok, true);
  assert.deepEqual(read.clips, ['open', 'close']);
  assert.equal(read.triangles, sampleTriangles(480));
});

test('a model without clips has no animations', () => {
  assert.equal(chunks(makeSampleGlb({ triangles: 100 })).json.animations, undefined);
});

test('three.js loads the sample: the same triangles, the clips with their lengths', async () => {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const glb = makeSampleGlb({ triangles: 960, clips: ['idle', 'walk'] });
  const loaded = await new Promise((resolve, reject) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '', resolve, reject));
  let triangles = 0;
  loaded.scene.traverse((o) => { if (o.isMesh) triangles += o.geometry.index.count / 3; });
  assert.equal(triangles, sampleTriangles(960));
  assert.deepEqual(loaded.animations.map((a) => [a.name, a.duration]), [['idle', 2], ['walk', 3]]);
});
