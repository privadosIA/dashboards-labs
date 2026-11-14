import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Animate, Script } from '@lab/animation-core';
import { CATALOG as BASE } from '@lab/animation-core/testing';

import { ANIMATION_SCRIPT, animateData } from '../../lib/preview/animate-script';
import { buildScenePage } from '../../lib/preview/page-builder';
import { scenesOf } from '../../lib/preview/scene-model';
import { DESIGN, SONG_MAP } from '../../lib/preview/test-data';

/**
 * Pins the part of the page that moves parameters to the text the server writes: the data, the hand-over of a part's own parameters, the
 * evaluator and the call in the seek. The fixture holds excerpts of a real page (the server's preview of a piece whose counter animates
 * `from` and `step`, see its first field); the browser's builder must write the same text, so a part behaves the same in both.
 */
// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const fixture = JSON.parse(readFileSync(join(process.cwd(), 'libs/motion-editor/src/testing/golden', 'page', 'animate-server.json'), 'utf8')) as {
  animate: string;
  handOver: string;
  animationScript: string;
  seekStart: string;
  scene: { duration: number; part: string; animate: Animate };
};

const catalog = {
  ...BASE,
  features: ['animate'],
  parts: [{ name: 'counter', description: 'A counter', levels: ['simple', 'medium', 'advanced'], costMs: 50, manual: false, params: [{ name: 'from', type: 'int', default: '0', animatable: true }, { name: 'step', type: 'int', default: '128', animatable: true }, { name: 'unit', type: 'string', default: 'lines' }] }],
} as typeof BASE;
const script: Script = { version: 1, pieces: [{ id: 'p4', start: 0, end: fixture.scene.duration, part: fixture.scene.part, animate: fixture.scene.animate }] };
const scene = scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script, catalog, fragments: new Map([['counter', { name: 'counter', manifest: '{}', fragment: '<div id="c"></div>' }]]) })[0];
const page = buildScenePage(scene);
const jsonSafe = (v: unknown): string => JSON.stringify(v).replace(/[<>&]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

describe('the page of a scene that animates, against the server\'s', () => {
  it('writes the tracks as the server does, the whole-number parameters flagged', () => {
    expect(animateData([{ animate: scene.part.animate, ints: new Set(['from', 'step']) }], jsonSafe)).toBe(fixture.animate);
    expect(page).toContain(fixture.animate);
  });

  it('hands over the part\'s own parameters as the server does', () => {
    expect(page).toContain(fixture.handOver);
  });

  it('carries the server\'s evaluator and its call in the seek, in the same order: the data, the evaluator, the layers', () => {
    expect(`<script>${ANIMATION_SCRIPT}</script>`).toBe(fixture.animationScript);
    expect(page).toContain(fixture.animationScript);
    expect(page).toContain(fixture.seekStart);
    const order = [page.indexOf(fixture.animate), page.indexOf(fixture.animationScript), page.indexOf(fixture.seekStart)];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
