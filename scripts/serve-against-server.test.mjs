import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from './serve-against-server.lib.mjs';

test('parseArgs takes the dashboard (dashboard-full by default), the --mock flag, and leaves the rest for ng serve', () => {
  assert.deepEqual(parseArgs([]), { dashboard: 'dashboard-full', mock: false, rest: [] });
  assert.deepEqual(parseArgs(['other-dashboard']), { dashboard: 'other-dashboard', mock: false, rest: [] });
  assert.deepEqual(parseArgs(['other-dashboard', '--mock', '--port', '4300']), { dashboard: 'other-dashboard', mock: true, rest: ['--port', '4300'] });
  assert.deepEqual(parseArgs(['--mock']), { dashboard: 'dashboard-full', mock: true, rest: [] });
  assert.deepEqual(parseArgs(['--port', '4300']), { dashboard: 'dashboard-full', mock: false, rest: ['--port', '4300'] });
});
