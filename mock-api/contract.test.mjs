// The sample data of the mock must fit the contract, so a dashboard built against it is not built against a lie.
// Run: npm test (from this folder). Where the contract only says "an object" there is nothing to check; those
// endpoints are listed at the end: describing their fields in openapi.yaml is what would protect them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';
import * as fx from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spec = closeObjects(yaml.load(readFileSync(process.env.SPEC ?? resolve(here, '../contract/openapi.yaml'), 'utf8')));
// The formats (int64, date-time) say how a generator should type a field; ajv would only warn about them.
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });

const CASES = {
  '/api/environment': fx.environment(),
  '/api/settings': fx.settings(),
  '/api/music/engines': fx.engines(),
  '/api/routing': fx.routing(),
  '/api/models/availability': fx.availability(),
  '/api/providers': fx.providers(),
  '/api/assets': fx.assets(),
  '/api/assets/catalog': fx.catalog(),
  '/api/storage': fx.storage(['demo']),
  '/api/projects/{id}/storage': fx.projectStorage(),
  '/api/library': fx.library(),
  '/api/stats': fx.stats([]),
  '/api/runs/{id}/resources': fx.runResources(),
  '/api/settings/monitoring': fx.monitoring(),
  '/api/settings/database': fx.database(),
  '/api/generation/options': fx.generationOptions(),
};

const deref = (s) => {
  for (let i = 0; s?.$ref && i < 20; i++) s = s.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  return s;
};
const describesFields = (schema, depth = 0) => {
  const s = deref(schema);
  if (!s || depth > 6) return false;
  if (s.properties && Object.keys(s.properties).length) return true;
  if (s.items) return describesFields(s.items, depth + 1);
  return !!(s.allOf || s.oneOf || s.anyOf);
};

const loose = [];
for (const [path, data] of Object.entries(CASES)) {
  test(`the sample answer of GET ${path} fits the contract`, () => {
    const res = deref(spec.paths[path]?.get?.responses?.['200']);
    const schema = res?.content?.['application/json']?.schema;
    assert.ok(schema, `GET ${path} has no JSON 200 response in the contract`);
    if (!describesFields(schema)) loose.push(path);
    const validate = ajv.compile({ ...schema, components: spec.components });
    assert.ok(validate(data), `${path}: ${ajv.errorsText(validate.errors)}`);
  });
}
test.after(() => {
  if (loose.length) console.log(`\nThe contract does not describe the fields of: ${loose.join(', ')}`);
});
