#!/usr/bin/env node
// Checks the production build of the full dashboard before it is put behind a proxy: the "under works" page is at the root, the service
// worker neither caches it nor rewrites navigation to it, and nothing in the output carries a server address or a token.
//
//   node scripts/check-build-output.mjs [dist/dashboard-full/browser]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OBRAS_FILES = ['obras.html', 'obras.css', 'obras.js'];
/** A private network address (Tailscale's 100.64/10 or the usual LANs) written in a file of the build. */
const PRIVATE_ADDRESS = /\b(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])|10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/;
/** A bearer value written out (the code builds the header from a variable, so `Bearer ` followed by a quote or a letter run is not one). */
const LITERAL_BEARER = /Bearer\s+[A-Za-z0-9._~+/-]{20,}/;
const TEXT = /\.(?:html|js|css|json|webmanifest|txt|map)$/;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** The problems found in a build folder, as readable lines (empty when it is fine). */
export function checkBuildOutput(dir) {
  const problems = [];
  if (!existsSync(join(dir, 'index.html'))) return [`${dir}: no index.html (is this the browser output?)`];
  for (const f of OBRAS_FILES) if (!existsSync(join(dir, f))) problems.push(`${f} is missing at the root of the build`);

  const ngsw = join(dir, 'ngsw.json');
  if (existsSync(ngsw)) {
    const config = JSON.parse(readFileSync(ngsw, 'utf8'));
    const cached = JSON.stringify(config.assetGroups ?? []);
    // The stylesheet and script match the worker's `/*.css` and `/*.js` and may be cached with the build; the page itself must come from the network.
    if (cached.includes('obras.html')) problems.push('ngsw.json caches obras.html: the page must come from the network');
    const urls = (config.navigationUrls ?? []).map((u) => u.regex ?? '');
    // Navigation to a path with a dot (obras.html) must be excluded, so the worker does not answer it with index.html.
    if (!urls.some((r) => r.includes('[^/]*\\.[^/]*') || r.includes('\\.'))) problems.push('ngsw.json does not exclude paths with a dot from navigation');
  }

  for (const file of walk(dir)) {
    if (!TEXT.test(file) || statSync(file).size > 8_000_000) continue;
    const text = readFileSync(file, 'utf8');
    const name = relative(dir, file);
    if (PRIVATE_ADDRESS.test(text) && !/^(?:swagger-ui|.*\.map$)/.test(name)) problems.push(`${name}: a private network address is written in it`);
    if (LITERAL_BEARER.test(text)) problems.push(`${name}: it holds a literal bearer token`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'dist/dashboard-full/browser');
  const problems = checkBuildOutput(dir);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `build output: ${problems.length} problem(s)` : `build output ok (${walk(dir).length} files)`);
  process.exit(problems.length ? 1 : 0);
}
