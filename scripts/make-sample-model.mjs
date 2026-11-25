// Writes the mock's sample model to a file, to look at it in any glTF viewer: `node scripts/make-sample-model.mjs out.glb [triangles] [clip,clip]`.
import { writeFileSync } from 'node:fs';
import { makeSampleGlb, sampleTriangles } from '../mock-api/sample-model.mjs';

const [out, triangles = '960', clips = 'idle,spin'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node scripts/make-sample-model.mjs <out.glb> [triangles] [clip,clip,...]');
  process.exit(1);
}
const names = clips ? clips.split(',').filter(Boolean) : [];
writeFileSync(out, makeSampleGlb({ triangles: Number(triangles), clips: names }));
console.log(`${out}: ${sampleTriangles(Number(triangles))} triangles, clips: ${names.join(', ') || 'none'}`);
