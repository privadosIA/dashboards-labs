# Dashboard Full

The management app of the media orquestator server, moved here area by area (OpenSpec change
`migrate-web-to-dashboard-full`). The source is the server's `web/`; this project is its replacement and the server drops
its embedded copy once this one works through `--web-dir`.

```bash
npm run dashboard-full:serve        # ng serve; set the server in the Connection button (its --cors-origin must list http://localhost:4200)
npm run mock                        # or the API mock on http://127.0.0.1:4667 ...
npx ng serve dashboard-full         # ... and this dashboard on http://localhost:4200, with /api proxied to it
npx ng test dashboard-full --no-watch
npm run dashboard-full:build        # dist/dashboard-full/browser, ready for the server's --web-dir
npm run dashboard-full:i18n         # after changing a text: extracts the Spanish catalogue and syncs the English one
npm run dashboard-full:e2e          # the Playwright suite (desktop) against a real server; :e2e:mobile for the phone projects
```

## Where things are

| Path | What it is |
|---|---|
| `src/theme/_tokens.scss` | The design tokens (`--lab-*`), light and dark; `data-theme` on `<html>` pins a choice |
| `src/theme/_forms.scss` | Maps the form library to the tokens |
| `src/styles.scss` | Angular Material built from the tokens, and the global rules |
| `src/app/app.*` | The shell: navigation rail (tab bar on a phone), language, theme, connection |
| `src/app/core/` | Services shared by the areas (language, theme, update, server link, simple mode) |
| `src/app/shared/` | What several areas share |
| `src/app/shell/` | Tab bar and the status banner |
| `src/locale/` | `messages.xlf` (English source, extracted) and `messages.es.json` (Spanish translation) |
| `ngsw-config.json`, `public/` | The service worker and the install files (manifest, icons) |

## Languages

Texts use Angular's `$localize` / `i18n`, as the server's app did: English is the source and Spanish (`src/locale/messages.es.json`) is loaded at start
when chosen, and changing the language reloads the page. The keys in the browser's storage (`mo.lang`, `mo-theme`,
`mo.simple`) are the same as the old app's, so someone who changes over keeps their choices. The connection (address
and token) is kept by `@lab/server-connection` under its own key, so it is asked once again.

## Connection

The **Connection** button of the rail opens the box of `@lab/server-connection`; a `401` opens it by itself. With no
address it is the server that serves the page. A deployment can put a `config.json` next to the app
(`{"server": "http://host:4666", "token": "..."}`) to start with another server: it is used when the person has saved
nothing, never saved by itself, and ignored if it is missing or not JSON. A token in that file is as secret as the page.

The buttons of the Projects header that open another section (`animation`, `video`, `music`, `flow`, `dataset`) are shown or hidden by
`src/environments/environment.ts` (all shown); `environment.tutorial.ts` hides them all and is used by `npm run dashboard-full:serve:tutorial`
(`--configuration tutorial` in a build), so that the tutorials are recorded without them. The same `config.json` can overrule the environment button by
button: `{"sections": {"animation": false, "dataset": true}}`.

## The look

The palette (emerald on blue-tinted ink, dark and light), the two typefaces, the radii, the elevations and the motion are tokens in
`src/theme/_tokens.scss` and global rules in `src/styles.scss` and `src/theme/_interaction.scss`; a screen only uses them. The side navigation
folds to a column of icons with the hamburger at its foot (the choice is kept in this browser; the content follows it at the same pace).
Lists and grids that change use `appAutoAnimate` and the tiles enter with `appFadeUp` (`@lab/motion-ui`); nothing moves with reduced motion.
Checked with `npm run theme:check`, `contrast.spec.ts`, `npm run a11y:audit` and `npm run forms:audit`.

## Scenes drawn by a part of the catalog

The scene editor has a fifth image mode, **Part of the catalog**, beside Generate with AI, My image, My clip and
Motion graphic. The scene is drawn by a part of the server's "music in motion" catalog
(`GET /api/music-motion/catalog`): the part is chosen, or **The model chooses** (`motion_part: auto`, which asks for the description
of the motion graphic of the part the model chooses), its parameters are drawn with the form of `@lab/motion-parts`, and there is a
line of text (up to 120 characters) and a tempo (from 40 to 240). It is excluded with own image, clip, starting image,
animation and render, as on the server, and the editor checks before saving what the server checks (the part exists,
the parameters are its own and within its limits, the text, the tempo, the combinations) and shows the server's reason
next to the scene. A server without a catalog (404) does not offer the mode and everything else stays the same. When an `auto` scene has already
gone through a run, it shows what the model chose (`motion/<escena>.choice.json`).

The block **Scenes drawn by a part of the catalog**, beside the background music, stores `defaults.motion`: the tempo, the design
(colors, catalog typefaces, mode, verse and word-hit styles, concept) and a song from the sources that the
scenes follow and that is their soundtrack (hence the reminder to use silent scenes). Only what is set is written, an empty block
disappears from the file and what the editor does not show is kept as it was.
