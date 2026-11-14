# Tailwind and motion in the dashboards

Tailwind CSS (v4) draws with each dashboard's own `--lab-*` tokens and nothing else. The glue is the dashboard's **bridge**, a plain
CSS file next to its stylesheet: `apps/<name>/src/tailwind.css`. `@lab/motion-ui` (`libs/motion-ui`) adds the animation helpers.
The change that put this in place is `add-tailwind-and-motion-foundation`; the rules for writing templates are in `CLAUDE.md`.

## What the bridge does

- Loads Tailwind's **theme and utilities, not its reset** (`preflight`). The dashboards keep their own base styles, so adding the
  bridge changes nothing on screen. What the reset would have set and the dashboards do not is `box-sizing: border-box` on every element: an element that is not `border-box` and has `w-full p-4` overflows, so a restyle sets `box-sizing` on the elements it converts (most already get it from Material or from their `.scss`).
- Removes Tailwind's default colours, fonts, type sizes, corners and shadows (`--color-*: initial`, …) so a class from them draws
  nothing, and maps the dashboard's tokens instead:

  | Token | Utility |
  |---|---|
  | `--lab-surface` | `bg-lab-surface`, `border-lab-surface`, … (every colour token: `lab-<name>`) |
  | `--lab-ink` | `text-lab-ink` |
  | `--lab-fs-body` | `text-lab-body` |
  | `--lab-fw-title` | `font-lab-title` |
  | `--lab-radius`, `--lab-radius-panel` | `rounded-lab`, `rounded-lab-panel` |
  | `--lab-space-1` | the unit of `p-4`, `gap-3`, … (`--spacing`) |
  | `--lab-shadow` (where it exists) | `shadow-lab` |
  | `--lab-font`, `--lab-font-mono` | `font-sans`, `font-mono` |
  | | `ease-lab`: `cubic-bezier(0.16, 1, 0.3, 1)` |

- The utilities read `var(--lab-…)` instead of copying the value (`@theme inline`), so the light and dark themes keep switching with
  the tokens and no template needs `dark:`.
- Turns off the transitions and the hover and press effects of utilities under `prefers-reduced-motion`.

`npm run theme:check` keeps it honest: the bridge holds no colour literal and names only tokens its dashboard defines; no template
(in a dashboard or a library) has `bg-[#fff]`, a default-palette class (`bg-zinc-200`, `text-white`) or `dark:`.
`node --test scripts/tailwind-bridge.test.mjs` compiles every bridge against a fixture and checks what comes out.

## Adding to it

- **A token**: add it to the dashboard's `src/theme/_tokens.scss` (both themes if it is a colour) and one line to its `tailwind.css`
  (`--color-lab-<name>: var(--lab-<name>);`).
- **A library the dashboard starts to show**: add `@source '../../../libs/<lib>/src';` to its `tailwind.css`. A utility that does not
  appear is the symptom of a missing line.
- **A new dashboard**: `npm run new` copies the template's bridge (`templates/dashboard/src/tailwind.css`, registered in `styles` by
  `templates/dashboard-project.json`). Edit it as the dashboard's tokens change, so that every `--color-lab-*` points to a token it defines
  (`npm run theme:check` tells). `npm run generator:verify` builds a generated dashboard and fails if Tailwind did not process its bridge.

## Things to know

- Tailwind makes a utility for every word of a template that looks like one. The utilities are in the lowest cascade layer, below every
  component stylesheet, so a component's own rule wins wherever both set a property. That keeps the bridge invisible, and it also means
  a restyle must **delete the `.scss` rule a utility replaces**; leaving both means the old rule wins.
- Icons stay Material Symbols (`<mat-icon>`). Fonts are chosen by each dashboard in its restyle.
- The micro-interaction of buttons and cards: `transition-transform duration-200 ease-lab active:scale-[0.98] hover:-translate-y-0.5`.

## `@lab/motion-ui`

```ts
import { AutoAnimateDirective, EASE_LAB, fadeUp, prefersReducedMotion } from '@lab/motion-ui';
```

`appAutoAnimate` on a container animates what is added, removed or moved; `[appAutoAnimateDisabled]` turns it off. It does nothing on the
server and keeps still for reduced motion (`@formkit/auto-animate` already does).

```html
<ul appAutoAnimate class="grid gap-2">
  @for (item of items(); track item.id) {
    <li class="rounded-lab border border-lab-line bg-lab-surface p-3 transition-transform duration-200 ease-lab hover:-translate-y-0.5">{{ item.name }}</li>
  }
</ul>
```

When the items live inside another component (the rows of a table drawn by `@core/dynamic-forms`), `appAutoAnimateTarget` names the descendant
whose children change: the directive attaches to the first match as soon as it exists, and again if it is replaced.

```html
<div appAutoAnimate appAutoAnimateTarget="tbody"><dynamic-form [schema]="tables" [model]="model()" /></div>
```

`fadeUp(elements, { offset, duration, gap, delay, spring })` makes elements fade in and rise one after another and resolves at the end; with
reduced motion it shows them in place at once. Use it from the component (`afterNextRender`) on the elements of a grid:

```ts
afterNextRender(() => fadeUp(this.host.nativeElement.querySelectorAll('.card')));
```

The library imports nothing from a dashboard or a kit and carries no style; `EASE_LAB` is the same curve as `ease-lab`.
