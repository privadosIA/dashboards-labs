import { expect, test } from '@playwright/test';

// Audit of the phone layout (openspec change add-mobile-e2e-audit, task 1.2). It does not
// fail: it measures what overflows the page and which controls are under 44 px high, on every
// area of the menu, and prints a report. Set MOBILE_AUDIT_OUT to also write it to a file.
const ROUTES = [
  '/projects',
  '/runs',
  '/statistics',
  '/gallery',
  '/library',
  '/models',
  '/environment',
  '/api-docs',
  '/settings',
  '/projects/audit-demo/editor',
  '/projects/audit-demo/review',
  '/projects/audit-music/music',
];

const TOUCH_MIN = 44;

test('audit: overflow and touch targets on every route', async ({ page, request }, testInfo) => {
  test.setTimeout(240_000);
  // Some data to look at: a video project, a music project and one finished run.
  await request.post('/api/projects', { data: { id: 'audit-demo' } });
  await request.post('/api/projects', { data: { id: 'audit-music' } });
  await request.put('/api/projects/audit-music/config', {
    data: { yaml: 'project: audit-music\noutput:\n  mode: music\ntracks:\n  - id: pista_1\n    prompt: Balada pop con piano\n' },
  });
  const launched = await request.post('/api/projects/audit-demo/runs', { data: {} });
  let runId = '';
  if (launched.ok()) {
    runId = (await launched.json()).run?.id ?? '';
    await expect
      .poll(async () => (await (await request.get(`/api/runs/${runId}`)).json()).run?.state, { timeout: 60_000 })
      .not.toMatch(/queued|running/);
  }
  const routes = runId ? [...ROUTES, `/runs/${runId}`] : ROUTES;

  const lines: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate((min) => {
      const vw = window.innerWidth;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const describe = (el: Element) =>
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        ([...el.classList].slice(0, 2).map((c) => `.${c}`).join('') || '') +
        ((el.textContent ?? '').trim().slice(0, 24) ? ` "${(el.textContent ?? '').trim().slice(0, 24)}"` : '');
      // An element that sticks out past the right edge, unless an ancestor scrolls it.
      // The Material sidenav content scrolls by itself, so it does not count as a container that
      // holds its children: the page scrolls sideways through it.
      const scrolled = (el: Element) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (p.tagName === 'MAT-SIDENAV-CONTENT' || p.tagName === 'MAT-SIDENAV-CONTAINER') continue;
          const o = getComputedStyle(p).overflowX;
          if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.getBoundingClientRect().right <= vw + 1) return true;
        }
        return false;
      };
      const wide = [...document.querySelectorAll('body *')]
        .filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1 && !scrolled(el))
        .map((el) => ({ el: describe(el), right: Math.round(el.getBoundingClientRect().right) }))
        .sort((a, b) => b.right - a.right)
        .slice(0, 3);
      const small = [...document.querySelectorAll('button, a[href], [role=button], [role=menuitem], [role=tab], input:not([type=hidden]), mat-checkbox, mat-slide-toggle')]
        .filter((el) => visible(el) && el.getBoundingClientRect().height < min)
        .map((el) => `${describe(el)} ${Math.round(el.getBoundingClientRect().height)}px`);
      const content = document.querySelector('mat-sidenav-content');
      // Sideways overflow of the page, or of the sidenav content (which is narrower than the screen
      // while the side column is shown).
      const over =
        document.documentElement.scrollWidth > vw + 1 || (content ? content.scrollWidth > content.clientWidth + 1 : false);
      const scrollWidth = Math.max(document.documentElement.scrollWidth, content?.scrollWidth ?? 0);
      return { scrollWidth, vw, over, wide, small };
    }, TOUCH_MIN);
    const over = m.over;
    lines.push(`${route}: ${over ? `OVERFLOW ${m.scrollWidth}>${m.vw}` : 'ok'}, ${m.small.length} small controls`);
    for (const w of m.wide) lines.push(`    wide: ${w.el} (right ${w.right})`);
    for (const s of [...new Set(m.small)].slice(0, 6)) lines.push(`    small: ${s}`);
    await testInfo.attach(`shot ${route.replace(/\W+/g, '_')}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  const report = `# ${testInfo.project.name} (${page.viewportSize()?.width}x${page.viewportSize()?.height})\n${lines.join('\n')}\n`;
  console.log(report);
  const out = process.env['MOBILE_AUDIT_OUT'];
  if (out) (await import('node:fs')).appendFileSync(out, report);
});
