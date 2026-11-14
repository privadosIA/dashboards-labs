import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Script } from '@lab/animation-core';
import { CATALOG as BASE } from '@lab/animation-core/testing';

import { LAYER_SEEK } from '../../lib/preview/layer-script';
import { buildScenePage } from '../../lib/preview/page-builder';
import { scenesOf } from '../../lib/preview/scene-model';
import { DESIGN, SONG_MAP } from '../../lib/preview/test-data';

/** Pins the part of the page that draws layer items to the text the server writes (see the first field of the fixture). */
// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const fixture = JSON.parse(readFileSync(join(process.cwd(), 'libs/motion-editor/src/testing/golden', 'page', 'layers-server.json'), 'utf8')) as { layerSeek: string; wrapperStart: string; registration: string };

const catalog = { ...BASE, features: ['layers'], parts: [{ name: 'stamp', description: 'A stamp', levels: ['simple', 'medium', 'advanced'], costMs: 50, manual: false, params: [] }] } as typeof BASE;
const script: Script = { version: 1, pieces: [{ id: 'p1', start: 0, end: 12, part: 'stamp' }], layers: [{ id: 'a', items: [{ part: 'stamp', start: 5, end: 9 }] }] };
const page = buildScenePage(scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script, catalog, fragments: new Map([['stamp', { name: 'stamp', manifest: '{}', fragment: '<i></i>' }]]) })[0]);

describe('the page of a scene with layers, against the server\'s', () => {
  it('carries the server\'s layer seek, inside the seek loop', () => {
    expect(LAYER_SEEK).toBe(fixture.layerSeek);
    expect(page).toContain(`seeks[i](t, beat);${fixture.layerSeek}`);
  });

  it('wraps and registers an item as the server does', () => {
    expect(page).toContain(fixture.wrapperStart);
    expect(page).toContain(fixture.registration);
  });
});
