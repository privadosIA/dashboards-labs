#!/usr/bin/env node
// `npm run test:coverage`: the tests of the scripts and the simulated API with Node's coverage, and the Angular ones with theirs, both
// written as lcov under `coverage/` for SonarQube. The two always run: a failing test of the first must not leave the Angular coverage
// unmeasured (it is most of the code), so it is reported as a failure at the end instead of stopping here.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The two runs, in order: what to execute and how it is called in the report. */
export const RUNS = [
  {
    name: 'scripts and simulated API',
    command: process.execPath,
    args: [
      '--test',
      '--experimental-test-coverage',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=lcov',
      '--test-reporter-destination=coverage/lcov.info',
      'scripts/**/*.test.mjs',
      'mock-api/**/*.test.mjs',
    ],
  },
  { name: 'Angular projects', command: 'npx', args: ['ng', 'test', '--no-watch', '--coverage'] },
];

/** The exit code of the whole: 0 when every run passed, else 1; `statuses` are the exit codes of the runs. */
export const overall = (statuses) => (statuses.every((s) => s === 0) ? 0 : 1);

/** Runs `runs` one after the other, all of them whatever each gives, and returns their exit codes. */
export function runAll(runs, spawn = spawnSync) {
  return runs.map((run) => {
    const result = spawn(run.command, run.args, { cwd: root, stdio: 'inherit' });
    return result.status ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(resolve(root, 'coverage'), { recursive: true });
  const statuses = runAll(RUNS);
  RUNS.forEach((run, i) => console.log(`test:coverage: ${run.name}: ${statuses[i] === 0 ? 'passed' : `FAILED (exit ${statuses[i]})`}`));
  process.exit(overall(statuses));
}
