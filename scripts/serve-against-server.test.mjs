import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from './serve-against-server.lib.mjs';

test('parseArgs takes the dashboard (video-studio by default), the --mock flag, and leaves the rest for ng serve', () => {
  assert.deepEqual(parseArgs([]), { dashboard: 'video-studio', mock: false, rest: [] });
  assert.deepEqual(parseArgs(['music-studio']), { dashboard: 'music-studio', mock: false, rest: [] });
  assert.deepEqual(parseArgs(['music-studio', '--mock', '--port', '4300']), { dashboard: 'music-studio', mock: true, rest: ['--port', '4300'] });
  assert.deepEqual(parseArgs(['--mock']), { dashboard: 'video-studio', mock: true, rest: [] });
  assert.deepEqual(parseArgs(['--port', '4300']), { dashboard: 'video-studio', mock: false, rest: ['--port', '4300'] });
});
