import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { buildArgs, readSections, select } from './build-examples.mjs';

// The examples site of the private deployment (deploy/ is not in the public copy, so these tests skip there).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'deploy/web/examples');
const registry = join(root, 'deploy/examples/sections.json');
const present = existsSync(dir) && existsSync(registry);
const read = (f) => readFileSync(join(dir, f), 'utf8');

test('every section is an application of the workspace, with its own folder, and the paths are unique', { skip: !present }, () => {
  const angular = JSON.parse(readFileSync(join(root, 'angular.json'), 'utf8')).projects;
  const sections = readSections(registry);
  assert.ok(sections.length >= 6);
  assert.equal(new Set(sections.map((s) => s.path)).size, sections.length);
  assert.equal(new Set(sections.map((s) => s.project)).size, sections.length);
  for (const s of sections) {
    assert.equal(angular[s.project]?.projectType, 'application', s.project);
    assert.ok(angular[s.project].architect.build.configurations.examples, `${s.project} has an examples configuration`);
    assert.ok(s.title.es && s.title.en && s.blurb.es && s.blurb.en, `${s.path} has both languages`);
  }
});

test('a section builds with its own configuration and base address, and one can be chosen', { skip: !present }, () => {
  const [s] = readSections(registry);
  const args = buildArgs(s, 'out');
  assert.deepEqual(args.slice(0, 3), ['ng', 'build', s.project]);
  assert.ok(args.join(' ').includes(`--configuration examples --base-href /${s.path}/ --output-path out/${s.path}`));
  assert.deepEqual(select(readSections(registry), s.path), [s]);
  assert.throws(() => select(readSections(registry), 'nope'), /no section/);
});

test('the third-party names are the same on the index and in the notice of the dashboards', { skip: !present }, () => {
  const { basedOn } = JSON.parse(readFileSync(registry, 'utf8'));
  const lib = readFileSync(join(root, 'libs/demo-notice/src/lib/texts.ts'), 'utf8');
  const names = [...lib.match(/THIRD_PARTY_PROJECTS[^=]*=\s*\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(basedOn, names);
  const html = read('index.html');
  for (const n of basedOn) assert.equal((html.match(new RegExp(n, 'g')) ?? []).length >= 2, true, `${n} is named in both languages`);
});

test('the index says these are simplified, non-final examples before it lists the sections, in both languages, with no claim of affiliation', { skip: !present }, () => {
  const html = read('index.html');
  assert.ok(html.indexOf('data-testid="examples-disclaimer"') < html.indexOf('data-testid="sections"'));
  assert.match(html, /ejemplos simplificados, no las versiones finales/);
  assert.match(html, /simplified examples, not the final versions/);
  assert.match(html, /proyectos de terceros/);
  assert.match(html, /third-party projects/);
  assert.doesNotMatch(html.replace(/no hay ninguna relación con ellos|there is no tie with them/g, ''), /official|endorsed|partner|affiliat|oficial|colabora/i);
  assert.equal((html.match(/lang="es"/g) ?? []).length - 1, (html.match(/lang="en"/g) ?? []).length); // the <html lang="es"> is the extra one
});

test('the index has one entry per section and each link opens its folder', { skip: !present }, () => {
  const html = read('index.html');
  for (const s of readSections(registry)) assert.ok(html.includes(`href="${s.path}/"`), s.path);
  assert.equal((html.match(/class="card"/g) ?? []).length, readSections(registry).length);
});

test('the pages make no request to any other site and hold no secret', { skip: !present }, () => {
  for (const f of readdirSync(dir).filter((n) => /\.(html|css|js|txt|svg)$/.test(n))) {
    const text = read(f);
    assert.doesNotMatch(text.replaceAll('http://www.w3.org/2000/svg', ''), /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i, f);
    assert.doesNotMatch(text, /@import|url\(\s*['"]?https?:/i, f);
    assert.doesNotMatch(text, /Bearer\s+\S{12,}|password\s*[:=]|secret|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|192\.168\.|\/mnt\/|\/home\//i, f);
  }
  assert.ok(existsSync(join(dir, 'obras.html')));
  assert.match(read('robots.txt'), /Disallow: \//);
  assert.match(read('index.html'), /noindex/);
});

const nginxFile = join(root, 'deploy/vps/nginx/examples.https.conf');
test('nginx has a location with its own fallback for every section, the same mock as the demo, and the abuse limits', { skip: !present || !existsSync(nginxFile) }, () => {
  const conf = readFileSync(nginxFile, 'utf8');
  for (const s of readSections(registry)) {
    assert.ok(conf.includes(`location /${s.path}/ {`), `${s.path} has a location`);
    assert.ok(conf.includes(`try_files $uri $uri/ /${s.path}/index.html;`), `${s.path} falls back to its own index`);
  }
  const folders = [...conf.matchAll(/^\s*location \/([a-z0-9-]+)\/ \{/gm)].map((m) => m[1]).filter((p) => p !== 'api');
  assert.deepEqual(folders.sort(), readSections(registry).map((s) => s.path).sort());
  assert.ok(conf.includes('set $demo_mock http://demo-mock:4667;'));
  assert.match(conf, /server_name examples\.xuxo\.net;/);
  assert.match(conf, /limit_req_status 429;/);
  assert.match(conf, /client_max_body_size 20m;/);
  assert.match(conf, /X-Robots-Tag "noindex, nofollow"/);
  assert.match(conf, /Disallow: \//);
  assert.doesNotMatch(conf.replace(/^\s*#.*$/gm, ''), /live-media|100\.\d+\.\d+\.\d+|token|auth_basic/i); // no home server, no login (the comments say so)
});

test('the name is in the site list and every script that names the sites knows it', { skip: !present }, () => {
  assert.match(readFileSync(join(root, 'deploy/vps/lib.sh'), 'utf8'), /SITES=\(.*examples\.xuxo\.net.*\)/);
  assert.match(readFileSync(join(root, 'deploy/vps/publish-web.sh'), 'utf8'), /orquestator\|live-media\|demo\|examples/);
  const deploy = readFileSync(join(root, 'deploy/vps/deploy.sh'), 'utf8');
  assert.match(deploy, /sites\/examples/);
  assert.equal((deploy.match(/examples\.\*\.conf/g) ?? []).length, 2); // removed and put back on a rollback
  assert.ok(existsSync(join(root, 'deploy/vps/nginx/examples.http.conf')));
});

test('the sections still being tried carry the "in testing" tag on the index and on the landing, and only those', { skip: !present }, () => {
  const html = read('index.html');
  const landing = readFileSync(join(root, 'deploy/web/orquestator/index.html'), 'utf8');
  for (const s of readSections(registry)) {
    const card = html.slice(html.indexOf(`href="${s.path}/"`) - 700, html.indexOf(`href="${s.path}/"`));
    const tagged = card.slice(card.lastIndexOf('<li class="card">')).includes('en pruebas');
    assert.equal(tagged, !!s.testing, `index: ${s.path}`);
    const li = landing.slice(landing.indexOf(`examples.xuxo.net/${s.path}/`)).split('</li>')[0];
    assert.equal(li.includes('en pruebas'), !!s.testing, `landing: ${s.path}`);
  }
});
