// Two things the user asked to fix and that are easy to undo by accident: the floating label of a field was cut off
// inside dialogs, and the light theme background was a muddy beige.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSource, tokens } from '../testing/tokens';

describe('form fields in dialogs', () => {
  const styles = readSource('src/styles.scss');

  it('gives the dialog content its top padding back, with enough specificity to beat Material', () => {
    // Material removes it after a title with `.mat-mdc-dialog-container .mat-mdc-dialog-title + .mat-mdc-dialog-content`
    // (injected after our global styles), so the container class is repeated.
    expect(styles).toMatch(
      /\.mat-mdc-dialog-container\.mat-mdc-dialog-container\s+\.mat-mdc-dialog-title\s*\+\s*\.mat-mdc-dialog-content[^{]*\{[^}]*padding-top:\s*var\(--lab-space-[3-6]\)/,
    );
  });

  it('draws the floated label at a readable size (at least 12px once scaled by 0.75)', () => {
    const m = /--mat-form-field-outlined-label-text-populated-size:\s*(\d+)px/.exec(styles);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * 0.75).toBeGreaterThanOrEqual(12);
  });
});

describe('light theme palette', () => {
  const { light } = tokens();
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  it('uses neutral paper greys for its backgrounds, not a warm beige', () => {
    for (const name of ['lab-bg', 'lab-surface', 'lab-surface-high']) {
      const [r, , b] = rgb(light[name]);
      // a beige has clearly more red than blue (the old #f2efe8 was 10 apart)
      expect(r - b, `${name} (${light[name]}) must not lean warm`).toBeLessThanOrEqual(4);
    }
  });

  it('keeps the page and its panels apart: the page is darker than a panel', () => {
    const lum = (hex: string) => rgb(hex).reduce((a, c) => a + c, 0);
    expect(lum(light['lab-bg'])).toBeLessThan(lum(light['lab-surface']));
  });
});

describe('floating surfaces and the colours of Material', () => {
  const styles = readSource('src/styles.scss');
  const code = styles
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  it('pins the system colours that come from the palette Material was generated with, so none of the old look shows through', () => {
    for (const name of [
      'primary-container', 'on-primary-container', 'secondary', 'secondary-container', 'on-secondary-container', 'tertiary', 'tertiary-container',
      'error-container', 'on-error-container', 'surface-tint', 'inverse-primary', 'inverse-surface', 'inverse-on-surface', 'scrim', 'shadow',
    ]) {
      expect(code, name).toMatch(new RegExp(`--mat-sys-${name}:\\s*(var\\(--lab-|color-mix\\(in srgb, var\\(--lab-)`));
    }
  });

  it('gives dialogs, menus, select panels, autocompletes and snackbars a fine border and a soft shadow from the tokens', () => {
    expect(code).toMatch(/\.mat-mdc-dialog-surface\s*\{[^}]*border:\s*1px solid var\(--lab-line\)[^}]*box-shadow:\s*var\(--lab-elev-2\)/);
    expect(code).toMatch(/\.mat-mdc-menu-panel[^{]*\{[^}]*border:\s*1px solid var\(--lab-line\)[^}]*box-shadow:\s*var\(--lab-elev-2\)/);
  });

  it('leaves the phone viewer and the mixer modal their own surface', () => {
    expect(code).toContain('.cdk-overlay-pane:not(.mo-phone-viewer):not(.mo-resizable-dialog) .mat-mdc-dialog-surface');
  });

  it('draws the surfaces that float with the panel radius and the tokens\' surfaces', () => {
    expect(code).toContain('--mat-dialog-container-color: var(--lab-surface)');
    expect(code).toContain('--mat-dialog-container-shape: var(--lab-radius-panel)');
    expect(code).toContain('--mat-menu-container-color: var(--lab-surface-high)');
    expect(code).toContain('--mat-snack-bar-container-color: var(--lab-surface-high)');
  });

  it('underlines the links of a text but not a brand or a tab, which say so with .lab-plain-link', () => {
    expect(code).toContain("a:not([class*='mat-mdc']):not([mat-list-item]):not([mat-button]):not(.lab-plain-link)");
  });
});

describe('the shared components', () => {
  const dir = join(process.cwd(), 'apps/dashboard-full/src/app/shared');
  const sheets = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.scss'))
    .map((f) => ({ file: f, css: readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }));

  it('set their type weights and gaps from the tokens, not from numbers', () => {
    expect(sheets.length).toBeGreaterThan(10);
    for (const { file, css } of sheets) {
      expect(css, `${file}: font-weight`).not.toMatch(/font-weight:\s*\d/);
      expect(css, `${file}: gap`).not.toMatch(/(^|[\s;{])gap:\s*\d+px/);
    }
  });

  it('draw their titles in the display face', () => {
    for (const f of ['page-header/page-header.component.scss', 'panel/panel.component.scss', 'empty-state/empty-state.component.scss']) {
      expect(sheets.find((x) => x.file === f)?.css, f).toContain('font-family: var(--lab-font-display)');
    }
  });
});


describe('shape and depth', () => {
  const styles = readSource('src/styles.scss');
  const panel = readSource('src/app/shared/panel/panel.component.scss');

  it('gives every button the button radius, a little softer than a field and not a pill', () => {
    expect(styles).toContain('--mat-button-filled-container-shape: var(--lab-radius-button)');
    expect(styles).toContain('--mat-button-outlined-container-shape: var(--lab-radius-button)');
  });

  it('raises panels with the resting elevation and the subtle gradient from the tokens', () => {
    expect(panel).toContain('box-shadow: var(--lab-elev-1)');
    expect(panel).toContain('background: var(--lab-surface-grad)');
  });

  it('floats the side navigation without changing the width of its drawer', () => {
    const rail = /\.mat-drawer\.rail\.rail--floating\s*\{[\s\S]*?\n\}/.exec(styles)?.[0] ?? '';
    expect(rail).toContain('.mat-drawer-inner-container');
    expect(rail).toContain('border-radius: var(--lab-radius-panel)');
    expect(rail).toContain('box-shadow: var(--lab-elev-1)');
    // it is inset inside the drawer: the drawer's own width is not set here
    expect(rail).toContain('width: calc(100% - var(--lab-space-4))');
  });

  it('draws the tables of the forms library in a rounded container whose rows light up', () => {
    expect(styles).toMatch(/\.df-table__scroll\s*\{[^}]*border-radius:\s*var\(--lab-radius-panel\)[^}]*box-shadow:\s*var\(--lab-elev-1\)/);
    expect(styles).toMatch(/tbody tr:hover > td\s*\{[^}]*background:\s*var\(--lab-row-hover\)/);
  });
});

describe('hierarchy and accent presence', () => {
  const header = readSource('src/app/shared/page-header/page-header.component.scss');
  const shell = readSource('src/app/app.scss');
  const styles = readSource('src/styles.scss');

  it('opens every page title with a short bar in the accent', () => {
    expect(header).toMatch(/&::before\s*\{[^}]*content:\s*''[^}]*background:\s*var\(--lab-accent\)/);
  });

  it('lights the top of the content area with the glow token and moves nothing', () => {
    expect(shell).toMatch(/mat-sidenav-content\s*\{[^}]*background-image:\s*var\(--lab-glow\)/);
  });

  it('tints the selected toggle with the accent and draws its text in the accent', () => {
    expect(styles).toContain('--mat-button-toggle-selected-state-background-color: color-mix(in srgb, var(--lab-accent)');
    expect(styles).toContain('--mat-button-toggle-selected-state-text-color: var(--lab-accent)');
  });

  it('leaves the accent as the fill of the primary action only (the filled button and the tinted states)', () => {
    const fills = [...styles.matchAll(/--mat-[\w-]*(?:container|background)-color:\s*var\(--lab-accent\)/g)].map((m) => m[0]);
    expect(fills.every((f) => f.startsWith('--mat-button-filled'))).toBe(true);
  });
});

describe('motion on the screens that change', () => {
  const uses = (file: string, what: string) => expect(readSource(`src/app/${file}`), file).toContain(what);

  it('animates the lists and grids that change with appAutoAnimate', () => {
    uses('runs/runs-page/runs-page.component.html', 'appAutoAnimateTarget=".df-table__table tbody"');
    uses('gallery/gallery-page/gallery-page.component.html', 'class="grid clips" appAutoAnimate');
    uses('models/models-page/models-page.component.html', 'appAutoAnimate data-testid="downloads"');
    uses('environment/environment-page/environment-page.component.html', '<ul class="list" appAutoAnimate>');
    uses('music/library/library-page.component.html', '<nav class="views" appAutoAnimate');
  });

  it('makes the tiles and charts of the statistics enter one after another', () => {
    uses('stats/stats-page/stats-page.component.html', '<ul class="cards" appFadeUp');
    uses('stats/stats-page/stats-page.component.html', '<div class="grid" appFadeUp>');
  });
});
