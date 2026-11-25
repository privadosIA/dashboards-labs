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

// The audits of the other dashboards of a full checkout live in `audit-screens.apps.mjs`; a checkout without it audits the full alone.
const apps = await import('./audit-screens.apps.mjs').catch(() => ({}));

/** What to open on each dashboard: a path and, where the screen needs something done first, the steps (clicks by selector). */
export const PLAN = {
  ...(apps.APP_PLAN ?? {}),
  // `/api-docs` is left out: under the dev server's `/api` proxy that address is answered by the mock, not by the dashboard
  'dashboard-full': { screens: ['/projects', '/runs', '/statistics', '/gallery', '/library', '/models', '/environment', '/settings/assistant', '/settings/music', '/settings/data', '/settings/system'].map((p) => ({ name: p.slice(1).replace(/\//g, '-'), path: p })), mock: true },
};

/**
 * The screens with a form drawn by `@core/dynamic-forms`, one or more on each dashboard (the guided flow's picker, the create forms of the
 * studios, the dialogs of the editors). Kept apart from `PLAN` so that what the accessibility audit covers does not change with it.
 * A dashboard whose forms have no two fields one beside or under the other (they are separated by slot components, or there is one field) says so in
 * `noPairs` with the reason: the audit then does not fail it for having nothing to measure, and measures it all the same if a pair turns up.
 */
export const FORM_PLAN = {
  ...(apps.APP_FORM_PLAN ?? {}),
  'dashboard-full': {
    mock: true,
    screens: [
      // the Details dialog of a project: three fields one under the other
      { name: 'project-details', path: '/projects', steps: [{ click: '[data-testid="details-demo"]' }, { wait: 700 }] },
      // the form that imports a zip of 3D models as a pack: id, name, author, licence and where it comes from
      { name: 'import-pack', path: '/models/3d', steps: [{ click: '[data-testid="packs-import"]' }, { wait: 700 }] },
      // the form that makes a 3D model from a text: the text, the engine, the detail, the name and the adult mark
      { name: 'generate-model', path: '/models/3d', steps: [{ click: '[data-testid="making-open"]' }, { wait: 700 }] },
      // the entries of a project of 3D models: id, text, engine, detail, variants, seed and the adult mark
      { name: 'model-entry', path: '/projects/demo-modelos/models3d', steps: [{ wait: 900 }] },
    ],
  },
};

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

export async function up(url, timeout = 150) {
  // A dev server may listen only on the IPv6 loopback (`ng serve` does on some machines): the browser reaches it through `localhost`, but Node's
  // `fetch` may try only the IPv4 one and be refused. So `localhost` is tried as itself and as `[::1]`.
  const candidates = url.includes('//localhost') ? [url, url.replace('//localhost', '//[::1]')] : [url];
  for (let i = 0; i < timeout; i++) {
    for (const candidate of candidates) {
      try {
        if ((await fetch(candidate)).ok) return true;
      } catch {
        /* not up yet */
      }
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
      const mock = spawn(process.execPath, ['mock-api/server.mjs'], { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] });
      children.push(mock);
      if (!(await up('http://127.0.0.1:4667/api/health', 30))) throw new Error('the mock did not start on :4667');
    }
    browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
    for (const name of chosen) {
      const port = await freePort();
      const child = spawn(resolve(repo, 'node_modules/.bin/ng'), ['serve', name, '--port', String(port)], { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] });
      children.push(child);
      const base = `http://localhost:${port}`;
      if (!(await up(base))) throw new Error(`${name} did not start`);
      for (const lang of langs) {
        for (const scheme of schemes) {
          for (const screen of plan[name].screens) {
            const context = await browser.newContext({ viewport: { width: 1400, height: 1800 }, colorScheme: scheme });
            const page = await context.newPage();
            await page.addInitScript(({ l, names }) => {
              try {
                for (const k of names) localStorage.setItem(`${k}.lang`, l);
              } catch {
                /* a frame without storage */
              }
            }, { l: lang, names: Object.keys(plan) });
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
