# The forms kit

[← Back to the README](../README.md)

The shared configuration of the forms (`@core/dynamic-forms`) and how a dashboard writes its JSON schemas.

## The forms kit

`@lab/motion-parts` (`libs/motion-parts/`) is the form for the parameters of a catalog part of "music in motion",
built at run time from what the server says about the part (type, limits, options and default value). A dashboard uses it
with `provideMotionParts({ lang })` and the component `<lab-part-params [part] [values] [level] [locked] (change)>`; it brings the model
of the part (`Part`, `PartParam`, `defaultParams`, `readDefault`) and its texts in `es`/`en`. Its styles use only the `--lab-*`
tokens that all the dashboards define (`npm run theme:check` verifies it). `video-anim` and `dashboard-full` use it.

`@lab/animation-core` (`libs/animation-core/`) is the model, the port (`AnimationPort`, `ANIMATION`), the failure and the pure script edits of "music in motion", with no screen; `@lab/animation-dataset` (`libs/animation-dataset/`) is the dataset format on top of it, with the golden files every consumer must round-trip. `@lab/music-motion` re-exports both.

`@lab/video-studio-kit` (`libs/video-studio-kit/`) is the video studio: the four ports (generation, video editing,
motion library and image retouching) with their server and in-memory adapters, the page with its Create video and
Edit video tabs (with the **Motion library**: cards with preview, adding from a file or an address with title and tags, and deleting), the history and the viewers, the texts in `es`/`en` and the `dynamic/` schemas. A dashboard uses it with
`provideVideoStudio({ lang, client?, memory? })` and mounts the route with `videoStudioRoutes()` (at the root, or under a section, like
`/video` in `dashboard-full`); the page draws no header, language or connection. The dashboards include once the mixin
`video-studio-kit/src/lib/styles/studio` (`@include studio.studio()`: the settings menu, the checkbox and the text boxes of the
studio) and can set `--studio-offset` (what they leave above and below, 7.5rem by default) so that the page fills the window.

`@lab/music-studio-kit` (`libs/music-studio-kit/`) is the music studio: the songs port with its server
and in-memory adapter, the page (the Easy and Custom forms with the lyrics tools, the style tags and the
"AI Lyrics Generator" dialog with the style capture), the generator choice, "My songs" and the Engines panel, the texts
in `es`/`en` and the `dynamic/` schemas. A dashboard uses it with `provideMusicStudio({ lang, client?, memory? })` and mounts the route with
`musicStudioRoutes()` (at the root, or under a section); `client` (`music-studio` by default) is the name with which the songs
reach the server and by which "My songs" filters. The page draws no header, language or connection: the button of the Engines
panel is the component `<app-engines-button>` (`EnginesButton`), which each dashboard places where it wants. The dashboards include
once the mixin `music-studio-kit/src/lib/styles/studio` (`@include studio.studio()`: the form fields, the style panel and the
structure tags menu) and can set `--studio-offset` (what they leave above and below, 6.5rem by default).
`music-studio` and `dashboard-full` use it (the **Music** section, at `/music`, with a bar that carries the Engines button; the music
of a project and the library do not change).

`@lab/music-motion` (`libs/music-motion/`) are the screens of the "music in motion" API (songs, new piece, pieces,
the piece with its design, script and map, references, styles and parts), with the port, the server adapter and the in-memory one, its
texts in `es`/`en` and its `dynamic/` schemas. A dashboard uses it with `provideMusicMotion({ lang, client, memory? })` and mounts the routes
with `musicMotionRoutes({ base })` (at the root with `base: ''`, or under a section, like `/animation` in `dashboard-full`); the
library draws no navigation: each host paints its links with `MUSIC_MOTION_SECTIONS`. The screens are seen with the host's `--lab-*`
tokens, and the ones it uses are defined by all the dashboards, the example and the generator template.

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
