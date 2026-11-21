#!/usr/bin/env node
// Writes the TypeScript description of the API (paths, parameters, bodies, answers) from the committed contract.
//
//   node scripts/generate-client.mjs [--contract FILE] [--out FILE]
//   node scripts/generate-client.mjs --check [--contract FILE] [--out FILE]
//
// Without --check it writes the file (only when its text changes). With --check it writes nothing and exits 1,
// saying the file is out of date, when what the contract produces differs from the committed file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const check = args.includes('--check');
const contract = resolve(flag('contract') ?? resolve(root, 'contract/openapi.yaml'));
const out = resolve(flag('out') ?? resolve(root, 'libs/api-client/src/lib/generated/schema.d.ts'));
const shown = (p) => relative(process.cwd(), p) || p;

const fail = (message) => {
  console.error(`generate-client: ${message}`);
  process.exit(1);
};

if (!existsSync(contract)) fail(`cannot read ${shown(contract)}`);

const HEADER = `/**
 * GENERATED from contract/openapi.yaml by scripts/generate-client.mjs. Do not edit by hand:
 * change the contract (in the server's repository), sync it and run \`npm run client:generate\`.
 */

`;

let text;
try {
  text = HEADER + astToString(await openapiTS(pathToFileURL(contract)));
} catch (e) {
  fail(`cannot generate types from ${shown(contract)}: ${e.message}`);
}

const current = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
if (check) {
  if (current === undefined) fail(`${shown(out)} does not exist: run "npm run client:generate"`);
  if (current !== text) fail(`${shown(out)} is out of date with ${shown(contract)}: run "npm run client:generate"`);
  console.log(`generate-client: ${shown(out)} is up to date`);
} else if (current === text) {
  console.log(`generate-client: ${shown(out)} unchanged`);
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`generate-client: ${shown(contract)} -> ${shown(out)}`);
}
