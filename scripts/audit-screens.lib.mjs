// What the audits of the dashboards share: the screens to open on each one (`PLAN`), starting the dev servers and the mock, and a
// loop that opens every screen in a real browser, in both colour schemes, and hands the page to a function. `a11y-audit.mjs` and
// `form-gap-audit.mjs` are written on it. Needs a Chromium for Playwright (E2E_CHANNEL=chrome uses the installed Chrome).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

// AUDIT_REPO points the audits at another checkout of the workspace (a worktree of an older commit, to compare before and after).
export const repo = process.env.AUDIT_REPO ? resolve(process.env.AUDIT_REPO) : resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What to open on each dashboard: a path and, where the screen needs something done first, the steps (clicks by selector). */
export const PLAN = {
  'video-anim': {
    start: '/?adapter=memory',
    screens: [
      { name: 'pieces', path: '/pieces?adapter=memory', steps: [{ click: '[data-testid="load-example"]' }, { wait: 600 }] },
      { name: 'songs', path: '/songs?adapter=memory' },
      { name: 'new', path: '/new?adapter=memory' },
      { name: 'references', path: '/references?adapter=memory' },
      { name: 'presets', path: '/presets?adapter=memory' },
      { name: 'parts', path: '/parts?adapter=memory' },
      { name: 'datasets', path: '/datasets?adapter=memory' },
    ],
  },
  'motion-edit': {
    screens: [
      { name: 'pieces', path: '/pieces?adapter=memory', steps: [{ click: '[data-testid="load-example"]' }, { wait: 600 }] },
      { name: 'editor', path: '/pieces?adapter=memory', steps: [{ click: '[data-testid="load-example"]' }, { click: 'app-piece-row button.open' }, { waitFor: 'lab-motion-timeline' }, { wait: 1500 }] },
      { name: 'editor-library', path: '/pieces?adapter=memory', steps: [{ click: '[data-testid="load-example"]' }, { click: 'app-piece-row button.open' }, { waitFor: 'lab-motion-timeline' }, { click: '[data-testid="tab-library"]' }, { wait: 600 }] },
      { name: 'editor-new-part', path: '/pieces?adapter=memory', steps: [{ click: '[data-testid="load-example"]' }, { click: 'app-piece-row button.open' }, { waitFor: 'lab-motion-timeline' }, { click: '[data-testid="tab-library"]' }, { click: '[data-testid="new-part-open"]' }, { wait: 600 }] },
      { name: 'editor-help', path: '/pieces?adapter=memory', steps: [{ click: '[data-testid="load-example"]' }, { click: 'app-piece-row button.open' }, { waitFor: 'lab-motion-timeline' }, { click: '[data-testid="help-open"]' }, { wait: 600 }] },
    ],
  },
  'vector-studio': {
    screens: [
      { name: 'editor', path: '/editor?adapter=memory' },
      { name: 'editor-example', path: '/editor?adapter=memory', steps: [{ click: '[data-testid="example"]' }, { wait: 800 }] },
      { name: 'editor-send', path: '/editor?adapter=memory', steps: [{ click: '[data-testid="example"]' }, { click: '[data-testid="toolbar"] [data-testid="send"]' }, { wait: 600 }] },
      { name: 'catalog', path: '/catalog?adapter=memory', steps: [{ wait: 600 }] },
    ],
  },
  'dataset-studio': {
    screens: [
      { name: 'studio', path: '/studio?adapter=memory', steps: [{ wait: 800 }] },
      { name: 'songs', path: '/studio?adapter=memory', steps: [{ click: '[data-testid="kind-songs"]' }, { wait: 600 }] },
      { name: 'result', path: '/studio?adapter=memory', steps: [{ fill: ['lab-brief textarea', 'The hive at dawn\nThe bee says "good morning"'] }, { click: '[data-testid="generate"]' }, { waitFor: '[data-testid="server-counts"]' }, { wait: 800 }] },
      { name: 'presets', path: '/presets?adapter=memory', steps: [{ wait: 600 }] },
    ],
  },
  'video-studio': { screens: [{ name: 'create', path: '/' }, { name: 'edit', path: '/', steps: [{ click: '[role="tab"]:nth-of-type(2)' }, { wait: 800 }] }], mock: true },
  'music-studio': { screens: [{ name: 'custom', path: '/' }, { name: 'easy', path: '/', steps: [{ click: '[data-testid="mode-easy"]' }, { wait: 500 }] }], mock: true },
  // `/api-docs` is left out: under the dev server's `/api` proxy that address is answered by the mock, not by the dashboard
  // The section windows (Animation, Video, Music, Dataset) are screens of their own, with their header and no side navigation.
  'dashboard-full': { screens: ['/projects', '/runs', '/statistics', '/gallery', '/library', '/models', '/environment', '/settings', '/animation', '/video', '/music', '/dataset'].map((p) => ({ name: p.slice(1), path: p })), mock: true },
};

/**
 * The screens with a form drawn by `@core/dynamic-forms`, one or more on each dashboard (the guided flow's picker, the create forms of the
 * studios, the dialogs of the editors). Kept apart from `PLAN` so that what the accessibility audit covers does not change with it.
 * A dashboard whose forms have no two fields one beside or under the other (they are separated by slot components, or there is one field) says so in
 * `noPairs` with the reason: the audit then does not fail it for having nothing to measure, and measures it all the same if a pair turns up.
 */
export const FORM_PLAN = {
  'dashboard-full': {
    mock: true,
    screens: [
      { name: 'flow', path: '/animation/motion-edit/flow' },
      { name: 'video', path: '/video' },
      { name: 'music', path: '/music' },
    ],
  },
  'video-anim': {
    noPairs: 'its create form is one field and slots; the design form of a piece is only reachable inside an open piece',
    screens: [{ name: 'new', path: '/new?adapter=memory' }],
  },
  'video-studio': { mock: true, noPairs: 'its forms are made of slot components (settings rows, the image frames, notes), each with its own spacing', screens: PLAN['video-studio'].screens },
  'music-studio': { mock: true, noPairs: 'its forms alternate a field with a slot (character counter, lyrics tools), each with its own spacing', screens: PLAN['music-studio'].screens },
  'motion-edit': {
    screens: [
      PLAN['motion-edit'].screens.find((s) => s.name === 'editor-new-part'),
      { name: 'flow', path: '/flow?adapter=memory' },
    ],
  },
  'vector-studio': {
    screens: [{ name: 'send', path: '/editor?adapter=memory', steps: [{ click: '[data-testid="toolbar"] [data-testid="send"]' }, { wait: 600 }] }],
  },
  'dataset-studio': {
    screens: [{ name: 'studio', path: '/studio?adapter=memory', steps: [{ wait: 800 }] }],
  },
  example: { mock: true, noPairs: 'its only form has one field', screens: [{ name: 'settings', path: '/settings' }] },
};

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

export async function up(url, timeout = 150) {
  for (let i = 0; i < timeout; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export async function runStep(page, step) {
  if (step.click) await page.locator(step.click).first().click();
  else if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1]);
  else if (step.waitFor) await page.locator(step.waitFor).first().waitFor({ timeout: 15000 });
  else if (step.wait) await page.waitForTimeout(step.wait);
}

/**
 * Opens every screen of the dashboards in `names` (all of them by default) in each colour scheme and calls
 * `onScreen({ dashboard, screen, scheme, page, base })` with the page ready (`options.plan` says which screens: `PLAN` unless given). Starts the mock when a dashboard needs it and a dev server for each
 * dashboard in turn, and stops them all at the end.
 */
export async function auditScreens(names, onScreen, { schemes = ['light', 'dark'], langs = ['en'], plan = PLAN } = {}) {
  const chosen = names.length ? names : Object.keys(plan);
  for (const n of chosen) if (!plan[n]) throw new Error(`unknown dashboard ${n}: ${Object.keys(plan).join(', ')}`);

  const children = [];
  const stop = () => children.forEach((c) => c.kill());
  process.on('exit', stop);
  let browser;
  try {
    if (chosen.some((n) => plan[n].mock)) {
      const mock = spawn('node', ['mock-api/server.mjs'], { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] });
      children.push(mock);
      if (!(await up('http://127.0.0.1:4667/api/health', 30))) throw new Error('the mock did not start on :4667');
    }
    browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
    for (const name of chosen) {
      const port = await freePort();
      const child = spawn('npx', ['ng', 'serve', name, '--port', String(port)], { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] });
      children.push(child);
      const base = `http://localhost:${port}`;
      if (!(await up(base))) throw new Error(`${name} did not start`);
      for (const lang of langs) {
        for (const scheme of schemes) {
          for (const screen of plan[name].screens) {
            const context = await browser.newContext({ viewport: { width: 1400, height: 1800 }, colorScheme: scheme });
            const page = await context.newPage();
            await page.addInitScript((l) => {
              try {
                for (const k of ['video-anim', 'motion-edit', 'video-studio', 'music-studio', 'dashboard-full']) localStorage.setItem(`${k}.lang`, l);
              } catch {
                /* a frame without storage */
              }
            }, lang);
            await page.goto(base + screen.path);
            await page.waitForTimeout(1800);
            try {
              for (const step of screen.steps ?? []) await runStep(page, step);
            } catch (e) {
              console.error(`${name}/${screen.name} (${scheme}): the steps failed: ${e.message.split('\n')[0]}`);
            }
            await onScreen({ dashboard: name, screen: screen.name, scheme, page, base });
            await context.close();
          }
        }
      }
      child.kill();
    }
  } finally {
    if (browser) await browser.close();
    stop();
  }
}
