#!/usr/bin/env node
// Audits the accessibility of the dashboards with axe-core (WCAG 2.0/2.1 A and AA) in a real browser, on the screens that need no real server: the
// in-memory adapters (`?adapter=memory`) and the simulated API (`npm run mock`, :4667). It prints, by rule, how many elements break it and where, and
// exits with 1 when something of the impact asked with --fail-on (default: serious) is found.
//
//   node scripts/a11y-audit.mjs [dashboard ...] [--fail-on minor|moderate|serious|critical] [--json file]
//
// With no dashboard it audits all of them. Needs a Chromium for Playwright (E2E_CHANNEL=chrome uses the installed Chrome).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';

import { auditScreens, PLAN } from './audit-screens.lib.mjs';

export { PLAN };
const IMPACTS = ['minor', 'moderate', 'serious', 'critical'];

/** The violations of one screen, as { rule, impact, help, nodes: [selector...] }. */
export async function audit(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.map((v) => ({ rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

export function summarise(found) {
  const byRule = new Map();
  for (const { dashboard, screen, violations } of found)
    for (const v of violations) {
      const e = byRule.get(v.rule) ?? { rule: v.rule, impact: v.impact, help: v.help, count: 0, where: new Map() };
      e.count += v.nodes.length;
      for (const n of v.nodes) if (!e.where.has(n)) e.where.set(n, `${dashboard}/${screen}`);
      byRule.set(v.rule, e);
    }
  return [...byRule.values()].sort((a, b) => IMPACTS.indexOf(b.impact) - IMPACTS.indexOf(a.impact) || b.count - a.count);
}

async function main() {
  const args = process.argv.slice(2);
  const failOn = args.includes('--fail-on') ? args[args.indexOf('--fail-on') + 1] : 'serious';
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined;
  const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--fail-on' && args[i - 1] !== '--json');

  const found = [];
  await auditScreens(names, async ({ dashboard, screen, scheme, page }) => {
    found.push({ dashboard, screen: `${screen}:${scheme}`, violations: await audit(page) });
  });

  const summary = summarise(found);
  for (const e of summary) {
    console.log(`${e.impact.padEnd(8)} ${e.rule}  ${e.count} elements  ${e.help}`);
    for (const [selector, where] of [...e.where].slice(0, 3)) console.log(`           ${where}  ${selector.slice(0, 140)}`);
  }
  if (!summary.length) console.log('No violations.');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(found, null, 1));
  const bad = summary.filter((e) => IMPACTS.indexOf(e.impact) >= IMPACTS.indexOf(failOn));
  process.exit(bad.length ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
