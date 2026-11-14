#!/usr/bin/env node
// Serves a dashboard (default video-studio) against the simulated API (mock-api, :4667): starts the mock, then `ng serve`.
// Nothing is asked: to reach a real server, use `npm run <dashboard>:serve` and set the address and the token in the
// Connection button of the page.
//
//   npm run <dashboard>:mock [-- [ng serve options]]
//   node scripts/serve-against-server.mjs <dashboard> --mock
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LauncherError, parseArgs } from './serve-against-server.lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { dashboard, mock, rest } = parseArgs(process.argv.slice(2));

/** The simulated API on :4667, which the dev server's own proxy already points at; resolves once it listens. */
function startMock() {
  const child = spawn('node', ['mock-api/server.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolveStarted, reject) => {
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      if (String(chunk).includes('mock orchestrator API')) resolveStarted(child);
    });
    child.on('exit', (code) => reject(new LauncherError(`The mock stopped before it listened (exit ${code}): is something else on :4667?`)));
  });
}

if (!mock) {
  console.error(`This launcher only serves the mock: run \`npm run ${dashboard}:serve\` to serve ${dashboard} and set the server in its Connection button.`);
  process.exit(1);
}

try {
  const api = await startMock();
  console.log(`Serving ${dashboard} against the mock (http://127.0.0.1:4667)`);
  const child = spawn('npx', ['ng', 'serve', dashboard, ...rest], { cwd: root, stdio: 'inherit' });
  const stop = (signal) => {
    api.kill();
    child.kill(signal);
  };
  child.on('exit', (code) => {
    api.kill();
    process.exit(code ?? 0);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
} catch (error) {
  if (!(error instanceof LauncherError)) throw error;
  console.error(error.message);
  process.exit(1);
}
