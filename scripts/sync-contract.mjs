#!/usr/bin/env node
// Keeps contract/openapi.yaml (a committed copy of the server's OpenAPI description) in step with its source.
//
//   node scripts/sync-contract.mjs <file | http(s)://server/api/openapi.json> [--token T] [--contract DIR]
//   node scripts/sync-contract.mjs <source> --check [--token T] [--contract DIR]
//
// Without --check it replaces the copy and its record (contract/SOURCE.json: where it came from, when, SHA-256).
// With --check it writes nothing and exits 1, naming what differs, when the source is not the copy. A source that
// cannot be read, or that is not an OpenAPI 3 document, leaves both files untouched.
// The token of the server can also come from ORCHESTRATOR_TOKEN (preferred: a flag shows up in `ps`).
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const check = args.includes('--check');
const token = flag('token') ?? process.env.ORCHESTRATOR_TOKEN ?? '';
const dir = resolve(flag('contract') ?? resolve(here, '../contract'));
const source = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--token' && args[i - 1] !== '--contract');

const fail = (message) => {
  console.error(`sync-contract: ${message}`);
  process.exit(1);
};
if (!source) fail('say the source: a file or the URL of a running server (…/api/openapi.json)');

async function readSource() {
  if (/^https?:\/\//.test(source)) {
    let res;
    try {
      res = await fetch(source, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch (e) {
      fail(`cannot reach ${source}: ${e.cause?.code ?? e.message}`);
    }
    if (!res.ok) fail(`${source} answered ${res.status}${res.status === 401 ? ' (the server wants its token: --token or ORCHESTRATOR_TOKEN)' : ''}`);
    return { text: await res.text(), fromUrl: true };
  }
  try {
    return { text: readFileSync(source, 'utf8'), fromUrl: false };
  } catch (e) {
    return fail(`cannot read ${source}: ${e.code ?? e.message}`);
  }
}

const { text, fromUrl } = await readSource();
let doc;
try {
  doc = yaml.load(text); // JSON is YAML too: the same loader reads the file and the server's JSON
} catch (e) {
  fail(`${source} is not YAML or JSON: ${e.message}`);
}
if (!doc || typeof doc !== 'object' || typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.') || typeof doc.paths !== 'object') {
  fail(`${source} is not an OpenAPI 3 description (no "openapi: 3.x" and "paths")`);
}

// What the description declares, as one line each, to say what changed.
const operations = (d) => Object.entries(d.paths ?? {}).flatMap(([p, item]) => Object.keys(item).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).map((m) => `${m.toUpperCase()} ${p}`));
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

const specFile = resolve(dir, 'openapi.yaml');
const recordFile = resolve(dir, 'SOURCE.json');

if (check) {
  if (!existsSync(specFile)) fail(`there is no copy at ${specFile}: run it without --check first`);
  const mine = yaml.load(readFileSync(specFile, 'utf8'));
  if (stable(mine) === stable(doc)) {
    console.log(`sync-contract: the copy is current (${operations(doc).length} operations, ${source})`);
    process.exit(0);
  }
  const a = new Set(operations(mine));
  const b = new Set(operations(doc));
  const added = [...b].filter((o) => !a.has(o));
  const removed = [...a].filter((o) => !b.has(o));
  console.error(`sync-contract: the contract of ${source} is not the copy.`);
  if (added.length) console.error(`  new in the source: ${added.join(', ')}`);
  if (removed.length) console.error(`  gone from the source: ${removed.join(', ')}`);
  if (!added.length && !removed.length) console.error('  the same operations, but some schema or description changed');
  console.error('  run: npm run contract:sync -- ' + source);
  process.exit(1);
}

// A file is copied as it is; what a server answers (JSON) is written as YAML with a stable order.
const out = fromUrl ? yaml.dump(JSON.parse(stable(doc)), { lineWidth: -1, noRefs: true }) : text;
// The record is committed: a path inside the home directory is written with `~`, so it does not name the person.
const home = homedir();
const recorded = !fromUrl && home && source.startsWith(`${home}/`) ? `~${source.slice(home.length)}` : source;
const record = {
  source: recorded,
  fetchedAt: new Date().toISOString(),
  sha256: createHash('sha256').update(out).digest('hex'),
  openapi: doc.openapi,
  title: doc.info?.title ?? '',
  version: doc.info?.version ?? '',
  operations: operations(doc).length,
};
mkdirSync(dir, { recursive: true });
// Both files or none: written aside, then renamed.
writeFileSync(`${specFile}.tmp`, out);
writeFileSync(`${recordFile}.tmp`, JSON.stringify(record, null, 2) + '\n');
renameSync(`${specFile}.tmp`, specFile);
renameSync(`${recordFile}.tmp`, recordFile);
console.log(`sync-contract: ${record.operations} operations from ${source} -> ${specFile}`);
