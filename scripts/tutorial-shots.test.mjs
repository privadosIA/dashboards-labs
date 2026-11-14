import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleAt, parseArgs, pickShots, shotFile, VIEWPORT } from './tutorial-shots.mjs';

test('a figure has the same name in both languages and is numbered in the order of the tutorial', () => {
  assert.equal(shotFile('video-anim', 'en', 0, 'load', '/d'), '/d/tutorial/animation/en/01-load.png');
  assert.equal(shotFile('video-anim', 'es', 11, 'piece', '/d'), '/d/tutorial/animation/es/12-piece.png');
  assert.equal(shotFile('music-studio', 'en', 2, 'x', '/d'), '/d/tutorial/music/en/03-x.png');
  assert.equal(shotFile('video-studio', 'en', 2, 'x', '/d'), '/d/tutorial/video/en/03-x.png');
  // the full's figures are flat and keep the name the text already uses (in tutorial/en/ and tutorial/es/)
  assert.equal(shotFile('dashboard-full', 'en', 5, 'x', '/d', '06-proyectos-lista'), '/d/tutorial/en/06-proyectos-lista.png');
  assert.equal(shotFile('dashboard-full', 'es', 5, 'x', '/d', '06-proyectos-lista'), '/d/tutorial/es/06-proyectos-lista.png');
});

test('the arguments name a dashboard, and can narrow the language, the shot and the address', () => {
  assert.deepEqual(parseArgs(['video-anim']), { dashboard: 'video-anim', langs: ['en', 'es'], only: undefined, url: undefined });
  assert.deepEqual(parseArgs(['music-studio', '--lang', 'es', '--only', 'easy', '--url', 'http://x']), { dashboard: 'music-studio', langs: ['es'], only: 'easy', url: 'http://x' });
  assert.throws(() => parseArgs([]), /name a dashboard/);
  assert.throws(() => parseArgs(['nope']), /name a dashboard/);
  assert.throws(() => parseArgs(['video-anim', '--lang', 'fr']), /--lang is one of/);
  assert.throws(() => parseArgs(['video-anim', '--what']), /unknown argument/);
});

test('a circle sits on the corner of a box and beside a line of text (left if there is room, else right), and stays in the viewport', () => {
  assert.deepEqual(circleAt({ x: 100, y: 200, width: 300, height: 48 }, 8), { n: 8, x: 86, y: 186 }); // a box: its corner
  assert.deepEqual(circleAt({ x: 100, y: 200, width: 50, height: 20 }, 1), { n: 1, x: 66, y: 196 }); // left, level with the first line
  assert.deepEqual(circleAt({ x: 24, y: 200, width: 300, height: 20 }, 2), { n: 2, x: 330, y: 196 }); // no room on the left: right
  assert.deepEqual(circleAt({ x: 24, y: 200, width: 1170, height: 20 }, 3), { n: 3, x: 10, y: 186 }); // a wide line with no room either side: on its corner
  assert.deepEqual(circleAt({ x: 300, y: 200, width: 50, height: 20 }, 5, VIEWPORT, 28, 6, 'gutter'), { n: 5, x: 2, y: 196 });
  assert.deepEqual(circleAt({ x: 300, y: 200, width: 50, height: 20 }, 6, VIEWPORT, 28, 6, 'right'), { n: 6, x: 356, y: 196 });
  assert.deepEqual(circleAt({ x: 300, y: 200, width: 60, height: 40 }, 7, VIEWPORT, 28, 6, 'below'), { n: 7, x: 316, y: 242 });
  const far = circleAt({ x: VIEWPORT.width + 500, y: VIEWPORT.height + 500, width: 10, height: 10 }, 4);
  assert.ok(far.x <= VIEWPORT.width - 28 && far.y <= VIEWPORT.height - 28);
});

test('the shots to take are all of them, or the one asked for, and an unknown one is an error', () => {
  const shots = [{ name: 'a' }, { name: 'b' }];
  assert.deepEqual(pickShots(shots).map((s) => s.index), [0, 1]);
  assert.deepEqual(pickShots(shots, 'b'), [{ name: 'b', index: 1 }]);
  assert.throws(() => pickShots(shots, 'c'), /no shot called c: a, b/);
});
