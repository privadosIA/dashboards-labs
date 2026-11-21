#!/usr/bin/env node
// Measures, in a real browser, the space between the fields of every form drawn by @core/dynamic-forms in the dashboards, in both colour
// schemes, and fails when it is smaller than the dashboard's `--lab-field-gap`, more than a couple of pixels larger (some other margin is
// adding to it) or when a dashboard shows no pair of fields to measure at all and has not declared why (`noPairs` in `FORM_PLAN`). It needs no real server: the in-memory adapters and the mock.
//
//   node scripts/form-gap-audit.mjs [dashboard ...] [--json file]
//
// With no dashboard it audits all of them. Needs a Chromium for Playwright (E2E_CHANNEL=chrome uses the installed Chrome).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditScreens, FORM_PLAN } from './audit-screens.lib.mjs';

// A box closer than this to another in one axis is taken to share it (sub-pixel rounding of the layout).
const EPS = 0.5;
// How far above the field gap a measured gap may be before something else is taken to be adding to it.
export const LOOSE_BY = 2;

/**
 * The gaps between neighbouring boxes, each as { a, b, direction: 'below' | 'beside', gap, measured, sameSpan } in pixels: for every box, the
 * nearest one under it that shares part of its width and the nearest one at its right that shares part of its height. A negative gap is an overlap.
 * `rects` are { id, x, y, width, height, kind } where `kind` is 'field' (judged) or 'other' (a block that is not a field the audit knows how to
 * measure: it stays in the layout so that no pair is made across it, but its gaps are not judged). `sameSpan` says two stacked boxes have the
 * same left and right edge, i.e. they are one above the other in the same column.
 */
export function pairGaps(rects) {
  const boxes = rects.map((r) => ({ id: r.id, kind: r.kind ?? 'field', left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }));
  const centre = (b) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
  const pairs = new Map();
  for (const a of boxes) {
    let below = null;
    let beside = null;
    for (const b of boxes) {
      if (a === b) continue;
      const sharesColumn = Math.min(a.right, b.right) - Math.max(a.left, b.left) > EPS;
      const sharesRow = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > EPS;
      if (sharesColumn && centre(b).y > centre(a).y) {
        const gap = b.top - a.bottom;
        const sameSpan = Math.abs(a.left - b.left) < 1 && Math.abs(a.right - b.right) < 1;
        if (!below || gap < below.gap) below = { a: a.id, b: b.id, direction: 'below', gap, measured: a.kind === 'field' && b.kind === 'field', sameSpan };
      }
      if (sharesRow && centre(b).x > centre(a).x) {
        const gap = b.left - a.right;
        if (!beside || gap < beside.gap) beside = { a: a.id, b: b.id, direction: 'beside', gap, measured: a.kind === 'field' && b.kind === 'field', sameSpan: true };
      }
    }
    for (const pair of [below, beside]) if (pair) pairs.set(`${pair.direction}:${pair.a}>${pair.b}`, pair);
  }
  return [...pairs.values()].sort((x, y) => x.gap - y.gap);
}

/**
 * What is wrong with `pairs` against a field gap of `gap` pixels: a sentence for each pair of fields that is too tight, or too loose when the two are
 * stacked in the same column (a hole in the grid beside a field is not a gap between fields).
 */
export function judgeGaps(pairs, gap, looseBy = LOOSE_BY) {
  const problems = [];
  for (const p of pairs) {
    if (p.measured === false) continue;
    const px = `${Math.round(p.gap * 10) / 10}px`;
    if (p.gap < gap - EPS) problems.push(`${p.a} and ${p.b} (${p.direction}) are ${px} apart: closer than the field gap of ${gap}px`);
    else if (p.gap > gap + looseBy && p.sameSpan !== false) problems.push(`${p.a} and ${p.b} (${p.direction}) are ${px} apart: more than the field gap of ${gap}px (another margin adds to it)`);
  }
  return problems;
}

/**
 * Runs in the page: the visible box of every field of every `.df-form` (Material's form field, which holds the message it shows, or the library's
 * field wrapper, or the field itself) and the dashboard's field gap in pixels (`--lab-field-gap`, or `--lab-space-3` where it has no token yet).
 */
export function collectInPage() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--lab-field-gap, var(--lab-space-3, 1rem))';
  document.body.appendChild(probe);
  const gap = probe.getBoundingClientRect().width;
  probe.remove();
  const named = (el, i) => {
    const label = el.querySelector('mat-label, label, .df-label')?.textContent?.trim();
    const control = el.querySelector('input, textarea, mat-select, select');
    return label || control?.getAttribute('aria-label') || control?.id || `field ${i + 1}`;
  };
  const forms = [...document.querySelectorAll('.df-form')].map((form, f) => {
    const leaves = [...form.querySelectorAll('formly-field')].filter((el) => !el.querySelector('formly-field') && el.checkVisibility?.());
    const rects = [];
    leaves.forEach((el, i) => {
      // What a person sees as the field: the outline of a Material field (plus the message under it when it shows one), the library's own
      // wrapper, or, for a field type this does not know, the whole block (kept as an obstacle and not judged).
      const material = el.querySelector('.mat-mdc-form-field');
      const wrapper = el.querySelector('.df-field');
      let top;
      let bottom;
      let left;
      let right;
      let kind = 'field';
      if (material) {
        const outline = (material.querySelector('.mat-mdc-text-field-wrapper') ?? material).getBoundingClientRect();
        ({ top, bottom, left, right } = outline);
        const message = material.querySelector('.mat-mdc-form-field-subscript-wrapper');
        if (message?.textContent?.trim()) bottom = Math.max(bottom, message.getBoundingClientRect().bottom);
      } else {
        ({ top, bottom, left, right } = (wrapper ?? el).getBoundingClientRect());
        if (!wrapper) kind = 'other';
      }
      if (right - left < 2 || bottom - top < 2) return;
      rects.push({ id: named(el, i), x: left, y: top, width: right - left, height: bottom - top, kind });
    });
    return { form: f + 1, rects };
  });
  return { gap, forms };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined;
  const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');

  const rows = [];
  await auditScreens(
    names,
    async ({ dashboard, screen, scheme, page }) => {
      const { gap, forms } = await page.evaluate(collectInPage);
      for (const { form, rects } of forms) {
        const pairs = pairGaps(rects);
        rows.push({ dashboard, screen: `${screen}:${scheme}`, form, gap, fields: rects.length, pairs, problems: judgeGaps(pairs, gap) });
      }
    },
    { plan: FORM_PLAN },
  );

  const round = (n) => Math.round(n * 10) / 10;
  let failed = false;
  for (const row of rows) {
    const measured = row.pairs.filter((p) => p.measured);
    const gaps = measured.map((p) => p.gap);
    const state = measured.length === 0 ? 'nothing to measure' : row.problems.length ? 'FAILS' : 'ok';
    const range = gaps.length ? `${measured.length} pairs  min ${round(Math.min(...gaps))}px  max ${round(Math.max(...gaps))}px` : 'no pairs';
    console.log(`${row.dashboard.padEnd(15)} ${row.screen.padEnd(24)} form ${row.form}  ${String(row.fields).padStart(2)} fields  ${range.padEnd(36)} gap ${round(row.gap)}px  ${state}`);
    for (const p of row.problems) console.log(`    ${p}`);
    if (row.problems.length) failed = true;
  }
  for (const name of names.length ? names : Object.keys(FORM_PLAN)) {
    if (rows.some((r) => r.dashboard === name && r.pairs.some((p) => p.measured))) continue;
    if (FORM_PLAN[name].noPairs) {
      console.log(`${name}: no pair of fields to measure (declared: ${FORM_PLAN[name].noPairs})`);
    } else {
      console.log(`${name}: no pair of fields to measure on any of its screens, and it does not declare why`);
      failed = true;
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  console.log(failed ? 'Some forms keep their fields too close or too far apart.' : 'Every form keeps its field gap.');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
