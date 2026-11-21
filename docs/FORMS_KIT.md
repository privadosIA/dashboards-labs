# The forms kit

[← Back to the README](../README.md)

The shared configuration of the forms (`@core/dynamic-forms`) and how a dashboard writes its JSON schemas.

## The forms kit

`@lab/motion-parts` (`libs/motion-parts/`) is the form for the parameters of a catalog part of "music in motion",
built at run time from what the server says about the part (type, limits, options and default value). A dashboard uses it
with `provideMotionParts({ lang })` and the component `<lab-part-params [part] [values] [level] [locked] (change)>`; it brings the model
of the part (`Part`, `PartParam`, `defaultParams`, `readDefault`) and its texts in `es`/`en`. Its styles use only the `--lab-*`
tokens that all the dashboards define (`npm run theme:check` verifies it). `dashboard-full` uses it.

`@lab/forms-kit` configures `@core/dynamic-forms` in one go (`provideLabForms({ lang })`, Material theme and texts in `es`/`en`).
The forms are JSON in a `dynamic/` folder next to the component, one file per language (`nombre.es.json`,
`nombre.en.json`); `pickSchema` chooses the one of the active language, or English warning about what is missing. `npm run dynamic:check`
(and `npm test`) fail if a language has no file or if the two do not have the same fields. The library is installed from
`vendor/` (see its README).

## The space between fields

Every dashboard defines `--lab-field-gap` in its own `src/theme/_tokens.scss` (the same in both themes, never smaller than its
`--lab-space-3`; `npm run theme:check` tells). It is the one space between two fields stacked in a form or side by side. In the
dashboard's `src/theme/_forms.scss` it comes from a single place, so that nothing adds to it:

- the library's own field wrapper, through `--df-field-gap: var(--lab-field-gap)` (its `margin-bottom`);
- Material's form fields, with `.df-form .mat-mdc-form-field { margin-bottom: var(--lab-field-gap) }` (and none for a form field inside
  a wrapper of the library, so it is not counted twice);
- the grid has no row gap of its own (`row-gap` stays `0`; it adds up in nested grids), and `--df-grid-gap` is the same token for fields
  that share a row.

The kits (`libs/*-kit/src/lib/styles/`) carry their own form rules inside the kit's class and are more specific than the dashboard's, so
they also read `var(--lab-field-gap)`: a kit never sets a margin on a field from a fixed step.

**`npm run forms:audit`** opens a form screen of each dashboard in a real browser (the in-memory adapters and the mock; no real server),
in the light and the dark theme, and measures the space between every pair of neighbouring fields of each `.df-form`: the outline of a
Material field (plus its message when it shows one) or the library's wrapper. It prints the smallest and largest gap of each form
against the dashboard's own token and fails when a gap is smaller, when two fields stacked in the same column are more than 2px over it,
or when a dashboard yields no pair and has not declared why. Pass dashboard names to audit only those, `--json file` to keep the numbers.

- The **slot fields** a dashboard puts inside a form (a character counter, the lyrics tools, the model and duration rows: `df-slot-field`)
  are not fields: they are kept in the layout so that no pair is made across them, but their spacing is their own component's.
  A dashboard whose forms alternate fields with slots, or have one field, says so in `FORM_PLAN` (`scripts/audit-screens.lib.mjs`) with
  `noPairs` and the reason; it is measured anyway if two fields turn up.
- To cover a new form, add a screen to `FORM_PLAN` (a path and, if it needs it, the steps that open it).
- `AUDIT_REPO=<path>` runs the audits against another checkout of the workspace, to compare before and after.
