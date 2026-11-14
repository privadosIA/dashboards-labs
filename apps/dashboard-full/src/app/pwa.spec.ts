// Contract tests for the installable app: what the manifest promises and what the service worker may keep
// (specs/mobile-app: only the app shell, never data).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = join(process.cwd(), 'apps/dashboard-full');
const read = (p: string) => JSON.parse(readFileSync(join(app, p), 'utf8'));
const manifest = read('public/manifest.webmanifest');
const ngsw = read('ngsw-config.json');

describe('web manifest', () => {
  it('is installable: name, standalone display, Create as the start address', () => {
    expect(manifest.name).toBe('mediaOrquestator');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/create');
  });

  it('has 192 and 512 px icons and a maskable one, and the files exist', () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    for (const i of manifest.icons) expect(existsSync(join(app, 'public', i.src))).toBe(true);
  });

  it('is linked from index.html together with the theme colour', () => {
    const html = readFileSync(join(app, 'src/index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('viewport-fit=cover');
  });
});

describe('service worker configuration', () => {
  it('keeps no data: there are no data groups', () => {
    expect(ngsw.dataGroups).toBeUndefined();
  });

  it('never answers a navigation to /api with the app shell', () => {
    expect(ngsw.navigationUrls).toContain('!/api/**');
  });

  it('keeps only static files, none of them under /api', () => {
    const files = ngsw.assetGroups.flatMap((g: { resources: { files?: string[]; urls?: string[] } }) => [
      ...(g.resources.files ?? []),
      ...(g.resources.urls ?? []),
    ]);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f: string) => f.includes('/api'))).toEqual([]);
  });
});

describe('production build', () => {
  const workspace = JSON.parse(readFileSync(join(process.cwd(), 'angular.json'), 'utf8'));
  const build = workspace.projects['dashboard-full'].architect.build;

  it('generates the service worker from ngsw-config.json, which brings ngsw.json and ngsw-worker.js', () => {
    expect(build.configurations.production.serviceWorker).toBe('apps/dashboard-full/ngsw-config.json');
  });

  it('copies the install files (manifest and icons) to the output', () => {
    expect(build.options.assets).toContainEqual({ glob: '**/*', input: 'apps/dashboard-full/public' });
  });

  it('puts the hash in the name of every script and style, so the server can cache them for good', () => {
    expect(build.configurations.production.outputHashing).toBe('all');
  });
});
