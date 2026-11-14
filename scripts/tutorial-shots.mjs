#!/usr/bin/env node
// Takes the figures of a dashboard's tutorial from the dashboard running on its in-memory adapter, in both languages, and draws
// the numbered orange circles that the text of the tutorial explains. The shots of each dashboard are in scripts/tutorial/<dashboard>.mjs.
//
//   node scripts/tutorial-shots.mjs <video-anim|video-studio|music-studio|motion-edit|vector-studio|dataset-studio|dashboard-full> [--lang en|es] [--only name] [--url http://localhost:4200]
//
// Without --url it serves the dashboard with `ng serve` on a free port and stops it at the end. Needs a Chromium for Playwright.
// `dashboard-full` needs --url: serve it on the mock with `node scripts/serve-against-server.mjs dashboard-full --mock --configuration tutorial --port 4300`
// (the tutorial configuration hides the buttons that open other sections). Its figures are flat, the `file` of the shot, in docs/tutorial/en/ and docs/tutorial/es/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

/** The folder of a dashboard's figures inside docs/tutorial/. */
export const FIGURE_FOLDERS = { 'video-anim': 'animation', 'video-studio': 'video', 'music-studio': 'music', 'motion-edit': 'motion-edit', 'vector-studio': 'vector', 'dataset-studio': 'dataset', 'dashboard-full': '' };
export const VIEWPORT = { width: 1200, height: 800 };
export const LANGS = ['en', 'es'];

/** The file of a figure: the same name in both languages, numbered in the order of the tutorial. */
export const shotFile = (dashboard, lang, index, name, docs = resolve(repo, 'docs'), file = undefined) =>
  file ? resolve(docs, 'tutorial', lang, `${file}.png`) : resolve(docs, 'tutorial', FIGURE_FOLDERS[dashboard], lang, `${String(index + 1).padStart(2, '0')}-${name}.png`);

export function parseArgs(argv) {
  const out = { dashboard: undefined, langs: LANGS, only: undefined, url: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.langs = [argv[++i]];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (!a.startsWith('--') && !out.dashboard) out.dashboard = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.dashboard || !(out.dashboard in FIGURE_FOLDERS)) throw new Error(`name a dashboard: ${Object.keys(FIGURE_FOLDERS).join(', ')}`);
  if (out.langs.some((l) => !LANGS.includes(l))) throw new Error(`--lang is one of ${LANGS.join(', ')}`);
  return out;
}

/**
 * Where the circle of a mark goes. A box (a button, a field, a card: 30 px high or more) gets it on its top-left corner, where
 * there is no text; a line of text or a label gets it beside it, never on top: on the left when there is room, else on the right,
 * level with its first line, always inside the viewport. `at` forces a place: `gutter`
 * (the left margin of the page, for a row), `left`, `right` or `below` (centred under the element, for buttons in a row).
 */
export function circleAt(rect, n, viewport = VIEWPORT, size = 28, gap = 6, at = 'auto') {
  const clamp = (v, max) => Math.min(Math.max(v, 2), max - size - 2);
  const y = clamp(rect.y + (Math.min(rect.height, 32) - size) / 2, viewport.height);
  if (at === 'gutter') return { n, x: 2, y };
  if (at === 'below') return { n, x: clamp(rect.x + rect.width / 2 - size / 2, viewport.width), y: clamp(rect.y + rect.height + 2, viewport.height) };
  if (at === 'left') return { n, x: clamp(rect.x - gap - size, viewport.width), y };
  if (at === 'right') return { n, x: clamp(rect.x + rect.width + gap, viewport.width), y };
  if (rect.height >= 30) return { n, x: clamp(rect.x - size / 2, viewport.width), y: clamp(rect.y - size / 2, viewport.height) };
  if (rect.x - gap - size >= 2) return { n, x: clamp(rect.x - gap - size, viewport.width), y };
  if (rect.x + rect.width + gap + size <= viewport.width - 2) return { n, x: clamp(rect.x + rect.width + gap, viewport.width), y };
  return { n, x: clamp(rect.x - size / 2, viewport.width), y: clamp(rect.y - size / 2, viewport.height) };
}

/** The shots of a dashboard to take: all, or only the one called `only` (an unknown name is an error). */
export function pickShots(shots, only) {
  if (!only) return shots.map((s, index) => ({ ...s, index }));
  const found = shots.map((s, index) => ({ ...s, index })).filter((s) => (s.name ?? s.file) === only);
  if (!found.length) throw new Error(`no shot called ${only}: ${shots.map((s) => s.name ?? s.file).join(', ')}`);
  return found;
}

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function serve(dashboard) {
  const port = await freePort();
  const child = spawn('npx', ['ng', 'serve', dashboard, '--port', String(port)], { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) return { base, stop: () => child.kill() };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error('the dashboard did not start');
}

async function runStep(page, step) {
  if (step.click) await page.locator(step.click).nth(step.nth ?? 0).click();
  else if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1]);
  else if (step.upload) await page.locator(step.upload[0]).first().setInputFiles(resolve(repo, step.upload[1]));
  else if (step.chooseFile) {
    // A button that opens the system's file chooser: the chooser is answered with the file.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(step.chooseFile[0]).first().click()]);
    await chooser.setFiles(resolve(repo, step.chooseFile[1]));
  } else if (step.press) await page.keyboard.press(step.press);
  else if (step.drag) {
    // drag: [from, to, where in `to`, where in `from`]: the last two are optional and default to the centre.
    const options = { ...(step.drag[2] ? { targetPosition: step.drag[2] } : {}), ...(step.drag[3] ? { sourcePosition: step.drag[3] } : {}) };
    await page.locator(step.drag[0]).first().dragTo(page.locator(step.drag[1]).first(), options);
  }
  else if (step.hover) await page.locator(step.hover).first().hover();
  else if (step.wheel) await page.mouse.wheel(0, step.wheel);
  else if (step.scrollTop) await page.locator(step.scrollTop).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  else if (step.scrollTo) await page.locator(step.scrollTo).first().scrollIntoViewIfNeeded();
  else if (step.waitFor) await page.locator(step.waitFor).first().waitFor();
  else if (step.wait) await page.waitForTimeout(step.wait);
  else throw new Error(`unknown step ${JSON.stringify(step)}`);
  await page.waitForTimeout(150);
}

async function drawCircles(page, marks, viewport) {
  const rects = [];
  for (const m of marks) {
    const box = await page.locator(m.selector).nth(m.nth ?? 0).boundingBox();
    if (!box) throw new Error(`the mark ${m.selector} is not on the screen`);
    if (box.y + Math.min(box.height, 32) > viewport.height) throw new Error(`the mark ${m.selector} is below the visible part: scroll to it with a step`);
    rects.push(box);
  }
  const placed = rects.map((r, i) => circleAt(r, i + 1, viewport, undefined, undefined, marks[i].at));
  await page.evaluate((circles) => {
    for (const c of circles) {
      const d = document.createElement('div');
      d.textContent = String(c.n);
      d.setAttribute('data-tutorial-circle', '');
      d.style.cssText = `position:fixed;z-index:2147483647;left:${c.x}px;top:${c.y}px;width:28px;height:28px;border-radius:50%;background:#f97316;color:#fff;border:2px solid #fff;font:700 15px/24px sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4);pointer-events:none`;
      // A dialog's overlay is in the browser's top layer (a popover): a circle outside it would be under its backdrop, so it goes inside.
      (document.querySelector('mat-dialog-container') && document.querySelector('.cdk-overlay-popover') ? document.querySelector('.cdk-overlay-popover') : document.body).appendChild(d);
    }
  }, placed);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = await import('@playwright/test');
  const def = (await import(pathToFileURL(resolve(here, 'tutorial', `${args.dashboard}.mjs`)).href)).default;
  const shots = pickShots(def.shots, args.only);
  if (def.needsUrl && !args.url) throw new Error(`${args.dashboard} is not served by this script: serve it and pass --url (see the top of this file)`);
  const server = args.url ? { base: args.url, stop: () => {} } : await serve(args.dashboard);
  const browser = await chromium.launch();
  try {
    for (const lang of args.langs) {
      for (const shot of shots) {
        const viewport = { width: shot.width ?? def.viewport?.width ?? VIEWPORT.width, height: shot.height ?? def.viewport?.height ?? VIEWPORT.height };
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: lang === 'es' ? 'es-ES' : 'en-US', colorScheme: 'light' });
        // The dashboards read their language and their adapter from the storage: the figures always show the in-memory data.
        // The full has its own keys (`mo.lang`) and no adapter to choose: the mock answers.
        await context.addInitScript(([entries]) => {
          for (const [key, value] of entries) localStorage.setItem(key, value);
        }, [def.storage ? def.storage(lang) : [[`${args.dashboard}.lang`, lang], [`${args.dashboard}.adapter`, 'memory']]]);
        const page = await context.newPage();
        if (shot.beforeLoad) {
          await page.goto(`${server.base}${shot.beforeLoad.path}`);
          for (const step of shot.beforeLoad.steps) await runStep(page, step);
        }
        if (shot.setup) await shot.setup(page, lang);
        await page.goto(`${server.base}${shot.path}`);
        for (const step of shot.steps ?? []) await runStep(page, step);
        await drawCircles(page, shot.marks ?? [], viewport);
        const file = shotFile(args.dashboard, lang, shot.index, shot.name, undefined, shot.file);
        mkdirSync(dirname(file), { recursive: true });
        await page.screenshot({ path: file });
        console.log(`${lang} ${file.replace(`${repo}/`, '')}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
