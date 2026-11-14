# Prompt: specify `motion-edit`, a motion-graphics editor dashboard

> This file is a self-contained brief for an assistant that **knows nothing about this project**. Read all of it before you write
> anything. The repository is `dashboards-lab`; if you have access to it, the files named below are the source of truth and this brief
> is a map to them. Where the brief and the repository disagree, the repository wins: say so in your answer.

---

## 0. Your task

Write the **specification** of a new dashboard, working name **`motion-edit`**, inside the `dashboards-lab` workspace: a visual editor
for the *music-motion animations* that the project's server already makes. You write the **plan**, not the code.

**Deliver** one OpenSpec *change* (see §8 for the exact format) in English, with `proposal.md`, `design.md`, one `spec.md` per
capability and `tasks.md`, ready to be implemented later by a coding assistant. Be concrete: a coding assistant with only these files
and the repository must be able to build the dashboard phase by phase without asking you anything.

**Do not** write application code, do not edit existing code, do not touch the server. If you need something the server does not have,
**write it down as a request to the server** (§7) — never assume it exists.

If something is ambiguous and it changes scope, behaviour or compatibility, **ask me before you write**; otherwise decide, and record
the decision and the alternative you rejected in `design.md`.

---

## 1. The workspace

`dashboards-lab` is an **Angular workspace of independent dashboards against ONE server** (the *mediaOrquestator* server, written in
Go, in another repository that you cannot see). This repository **never contains server code**: it consumes the server's HTTP API
through its OpenAPI contract, a versioned copy in `contract/openapi.yaml` (160 operations).

| Thing | What it is |
|---|---|
| Stack | Angular 22 (standalone components, signals, `OnPush`), Angular Material 22, RxJS 7.8, TypeScript strict, Vitest 4 through `ng test`, SCSS |
| `apps/` | The dashboards: `dashboard-full` (the big embedded one), `video-studio`, `music-studio`, `video-anim` (the animation tool this editor relates to), `example` (the template the generator copies) |
| `libs/` | Shared libraries, imported as `@lab/<name>`: `api-client` (typed client generated from the contract), `forms-kit` (the owner's form generator `@core/dynamic-forms` + languages), `server-connection` (the Connection button/dialog: address + token, ticket for media), `theme-switch` (light/dark), `motion-parts` (the model of a catalog *part* and a form for its parameters), `music-motion` (**everything about animated pieces**: port, adapters, screens, dataset format), `music-studio-kit`, `video-studio-kit`, `paged-list` |
| `mock-api/` | A Node mock of the server (`npm run mock`), including `/api/music-motion/*`, so dashboards run with no GPU, models or server |
| `scripts/` | `new-dashboard.mjs` (generator: `npm run new -- <name>` creates an app from `templates/dashboard/`), `check-theme.mjs`, `check-dynamic.mjs`, `tutorial-shots.mjs`, `sync-contract.mjs`, `update-public-branch.sh`, … |
| `openspec/` | The planning system: `specs/` (48 capability specs that describe what exists) and `changes/` (planned work), `changes/archive/` (finished) |
| `docs/` | `ANIMATION_DATASET.md` (the dataset file format), tutorials (es/en) with figures, notes for the server's own team |
| `contract/` | `openapi.yaml` and `SOURCE.json` (where the copy came from) |

Run: `npm install`, `npm test` (everything), `npm run video-anim:serve` / `:mock`, `npm run theme:check`, `npm run dynamic:check`,
`npm run generator:verify`, `npm run tutorial:check`.

### Rules of the repository (you must write a plan that obeys them)

1. **Dashboards are independent.** A dashboard under `apps/<name>/` never imports from, links to or reads files of another dashboard.
   If two need the same thing, **copy** it (a token file, a form stylesheet) or **move it to a shared library** under `libs/`. The
   contract is the only thing dashboards and server share. *Each dashboard has its own design:* its tokens live in its own `src/theme/`.
2. **No HTML and no styles inside `.ts` files.** Every component has its own `.ts`, `.html` and `.scss`, linked with `templateUrl` and
   `styleUrl` (test-only host components may use an inline template). One folder per component; a child used by one component only
   lives inside its folder; what several components share goes in one `shared/` folder of the dashboard.
3. **Forms are drawn with `@core/dynamic-forms`** through `@lab/forms-kit`: one JSON schema per language in a `dynamic/` folder
   (`<name>.es.json`, `<name>.en.json`), checked by `npm run dynamic:check`.
4. **Colours, type, spacing and shape come from the `--lab-*` tokens** (`npm run theme:check`), never literals. A dashboard has light
   and dark themes pinned in its own `_tokens.scss`, and a switch (`@lab/theme-switch`).
5. **Texts in Spanish and English, both always.**
6. **Planning is OpenSpec** (`openspec/changes/`); artifacts are written **in English**. Commit messages are in Spanish; one commit per
   finished group of tasks; the archive of a change in its own commit; nothing is pushed until the owner reviews it.
7. Before a change is "done": `npm test`, `npm run dynamic:check`, `npm run theme:check`, `npm run generator:verify` (and
   `npm run tutorial:check` if tutorials are touched) must pass.
8. Every feature works against the real server **and** against an in-memory adapter / the mock (`?adapter=memory`), so it can be
   developed and tested without a server.

Look at `apps/video-anim` (a thin app: ~10 files that wire `@lab/music-motion`) and `apps/example` + `templates/dashboard/` (the
smallest complete dashboard: header with brand, Connection button, navigation, light/dark switch and language buttons) to see the shape
of an app. Look at `openspec/specs/video-anim-dashboard/spec.md` and `openspec/specs/music-motion-kit/spec.md` to see how requirements
are written.

---

## 2. The server and its contract

The server turns text and media into video, images and music, and runs a local assistant (Ollama LLMs). It listens on port **4666**.

- **Auth:** `Authorization: Bearer <token>`. Media (video, audio, key frames) is fetched with a short-lived **ticket** in the query
  (`?ticket=…`) because `<video>` and `<img>` cannot send headers; `@lab/server-connection` provides `TicketService.withTicket(url)`.
- **CORS:** the dev server's origin must be in the server's `--cors-origin`.
- **Errors:** `AnimationFailure { kind, reason }` in the client (`refused` = 422, `busy` = 409, `missing` = 404, `unavailable` = 503…).
- **Operations you need (all under `/api/music-motion/`)** — read their exact shapes in `contract/openapi.yaml`:

| Operation | Purpose |
|---|---|
| `GET /api/library` | The songs available (`project/track/variant`, title, length, `duration` = the length the song map reads) |
| `GET /catalog` | The **catalog**: parts (name, description, levels, `cost_ms`, `manual`, `source: builtin|user`, typed `params`), characters, backgrounds, levels, styles, frame rates, actions, fonts, modes |
| `GET/POST /pieces`, `GET/DELETE /pieces/{id}` | List, create (from a song + options + optional `preset` and `prompt`), read (design, script, **song map**, `proposal`), delete |
| `PUT /pieces/{id}/design`, `PUT /pieces/{id}/script` | Replace the design / the script (validated; a refusal is a `422` naming the place) |
| `POST /pieces/{id}/propose` | Ask the assistant for `design`, `script` or `all` (`all`/`async` answer `202` and write in the background; read `proposal` on the piece: `waiting|writing|done|failed`, with per-part source and `fallback_reason`); `prompt` and `model` accepted |
| `POST /pieces/{id}/render` | Draw the video (a project of its own; minutes) → states `queued → running (progress) → done` (`video` address) |
| `POST /pieces/{id}/transcribe` | Hear the words of the song (Whisper) and rebuild the song map |
| `GET/POST/PUT/DELETE /presets`, `/references` | Styles (a design + rhythm + parts) and reference videos (analysed: colours, cuts, key frames) |
| `/part-drafts…`, `GET /parts/{name}` | Ask the assistant to write a **new part** (draft → approve); read back the manifest and fragment of a *user* part |
| `GET /api/assist/models` | The installed assistant models |

**What the server does NOT have today (and an editor needs):** any way to *preview* a piece or a part (a frame at time *t*, or a short
clip) without drawing the whole video; a way to read the HTML of the *built-in* parts; pieces that overlap in time; animated
parameters. See §7.

---

## 3. The domain: music-motion animations

A **piece** is a motion-graphics video made to go with a song: typography, shapes and (optionally) illustrated characters that move on
the beat, with the lyrics appearing as they are sung. The server draws it with headless Chrome from HTML pages, one scene per script
piece, and caches scenes that did not change. Full description: the server's `docs/MUSIC_MODE_MOTION.md` (not in this repo; the
essentials follow).

### 3.1 The song map (read-only, comes with the piece)

`duration`, `bpm`, `beats[]` (time of every beat, followed in the audio), `sections[]` (`tag` like `verse`/`chorus`, `start`, `end`),
`words[]` (`text`, `start`, `end`, `line`), `wordsEstimated` (true when the word times were spread over the sections rather than heard),
`loudness[]` with `loudnessHop`.

### 3.2 The design (the look of the whole piece)

`dark`, `light`, `accent` (hex colours), `display` and `body` (typefaces from the catalog's `fonts`), `defaultMode`, `modes` (a mode
`dark|light` per section tag), `concept` (a sentence), optional `verseStyle` (`plain|highlight|karaoke|glow`) and `hitStyle`
(`plain|metal|glow`). Validated by the server: valid hex colours, known fonts, **accent contrast ≥ 3:1 against the background of every
mode in use**, concept ≤ 200 characters.

### 3.3 The script (what happens when) — the core of the editor

`{ version: 1, pieces: ScriptPiece[] }`. A **script piece**:

```
id, start, end                     seconds; cuts are snapped by the server to beats
section?, mode?                    the section tag and the mode (dark|light) it is drawn in
part                               name of a catalog part (REQUIRED, must exist in the catalog)
params?                            values for that part's typed parameters (names/types/limits come from the catalog)
lines?, hit?                       the lyric lines it covers (with a keyword painted in the accent) and a "word hit" (one word at full screen)
stage?                             illustrated style: { background, characters: [{ character, pose, expression, action, x, y, size }] }
with?                              up to 3 EXTRA parts drawn beside the main one: [{ part, params? }], none repeated
design?                            overrides dark/light/accent/display/body/verse_style/hit_style for this piece only
```

**Server-enforced rules of a script:** the pieces must **cover the whole song map duration with no gaps and no overlap** (each starts
where the previous ends; the last ends at the song map's `duration`, which is *not* the rounded library length); every `part` exists in
the catalog; parameters respect the catalog's types, `min`/`max`, `maxLength`, `options`; at most 3 extras per piece; a part not
supported by the piece's *level* is replaced by a simpler one when drawn (reported as `replacements`).

### 3.4 The catalog of parts and how a part works

A **part** is a folder with `manifest.json` (name, description, `cost_ms`, `levels`, typed `params`: `string|int|number|bool|enum`, each
with a default) and `part.html` (an HTML/CSS/JS fragment). The fragment reads `window.__params` and draws by defining
`window.__partSeek = function (t, beat) {…}` — a **pure function of time**: it must not use the wall clock or `Math.random()`.
`beat = { number, position, section, sectionIndex, bpm, time }` (index of the last beat, how far inside it, the lyrics section tag…),
so frames land on the music. This is why a **browser preview is feasible**: the same fragment can be rendered in an iframe and driven
by seeking. Built-in parts include `toggle`, `glass-card`, `stamp`, `counter`, `terminal`, `flat-slabs`, `parallax-cards`,
`depth-stack`, `wire-sphere`, `glitch-text`, `particles`, interface parts (`search-box`, …) and more (the mock serves a few dozen); new parts come
from *drafts* the assistant writes and the person approves.

Levels: `simple` (flat, best synchronised), `medium` (depth/parallax), `advanced` (3D, glitch, particles). Frame rates 24/30/60.
Styles: `typographic` or `illustrated` (characters and backgrounds from the library; actions `enter|exit|bounce|look|wave|slide…`).

### 3.5 Other things around a piece

- **Styles (presets):** a design + a rhythm (2–15 s per script piece) + a list of parts (≤ 8); made from an analysed *reference* video or
  from scratch; a piece can start from one. A *local* style kept in the browser exists for styles the server cannot take.
- **References:** videos (YouTube address or file) analysed for colours, cuts, key frames, tempo.
- **The assistant** (`propose`): writes design and/or script from the song map, the catalog and an optional free-text `prompt`; a model
  can be chosen; when its answer fails validation the **fixed rule** writes a plain version and says why. The fixed rule does not read the
  prompt.
- **Render:** a forecast (`estimate`, in seconds, always marked as an estimate) before drawing; progress while drawing; a video when done.

---

## 4. What already exists on the client (reuse, do not rebuild)

`libs/music-motion` is the whole animation client, used by `video-anim` and by the Animation section of `dashboard-full`:

- **`AnimationPort`** (`animation/port.ts`): the interface to everything above (songs, catalog, pieces, `piece(id)`, `create`,
  `saveDesign`, `saveScript`, `propose`, `proposeAll`, `followProposal`, `assistModels`, `render`, `follow`, `transcribe`, references,
  drafts, presets…). Two adapters: **`ServerAnimation`** (over `@lab/api-client`) and **`InMemoryAnimation`** (no server; simulates
  the render by a clock, proposals by a clock, refusals like the server's). The model is `animation/model.ts`.
- **Screens** (each a routed page): Songs, New animation (3 steps: idea+look, song, options), Pieces, **Piece** (design form, song map,
  script editor with a row per script piece and its parameter forms drawn **at run time from the catalog**, propose panel, proposal
  strip, render panel), References, Styles, Parts, Datasets, Style builder.
- **Dataset file** (`animation/dataset-*.ts`, spec `openspec/specs/animation-datasets`, doc `docs/ANIMATION_DATASET.md`): the format
  `music-motion-dataset` **version 2** = **one animation** (title, song with `seconds`, options, design, script, optional `look`
  {style, reference}, optional own `parts`), with a validator, an export that reads only what that animation needs, an import with a
  report before anything is created, a song picker and `fitScript` (scales a script to another song). Own styles live in
  `localStorage` (`LocalStyles`).
- **`@lab/motion-parts`**: the `Part` model and the typed parameter form (`lab-part-params`), reused by the script editor.
- **Quality bar:** every component has Vitest specs; both languages; tokens only; `?adapter=memory` works for everything; the mock
  (`mock-api/music-motion.mjs`) answers every route and is checked against the contract.

Read these before specifying: `libs/music-motion/src/lib/animation/{model,port}.ts`, `…/piece/script-editor/`, `…/piece/song-map/`,
`libs/motion-parts/src/lib/model.ts`, `apps/video-anim/src/app/`, `docs/ANIMATION_DATASET.md`, `openspec/specs/{animation-datasets,music-motion-kit,video-anim-dashboard,theme-switch-kit}/spec.md`.

---

## 5. What `motion-edit` is

### 5.1 Goal

A **real editor** for the script and design of a music-motion piece: you see the result before drawing, you arrange pieces on a
timeline against the song, and you can also write the script as typed code. `video-anim` stays as it is (the quick tool: pick a song,
describe, tweak, draw); `motion-edit` is the serious tool. **Same server, same pieces**: a piece made in one is visible and editable in
the other.

Inspiration (look and feel of the workflow, not a clone): **SVGator** (layers panel, timeline with keyframes, canvas, inspector). The
owner also finds the *typed language* of **OpenFL/Haxe** interesting. **OpenToonz** (frame-by-frame hand drawing) is explicitly
**out of scope**; vector drawing tools are out of scope.

### 5.2 The four pieces (a vision to be phased, not built at once)

1. **Preview.** A canvas with a time scrubber and play that renders the script's pieces in the browser by loading each part's fragment
   in an isolated iframe and driving `window.__partSeek(t, beat)` from the song map's beats (the same contract the server's Chrome
   uses). Includes the song audio (ticketed URL) with a waveform. Fidelity to the server render is an explicit risk to specify
   (fonts, the page wrapper the server puts around a fragment, level fallbacks).
2. **Visual editor (SVGator-like).** Layers panel (script pieces and their extra parts), a timeline over the song map (sections, beats,
   words, loudness) where pieces are dragged, resized and snapped to beats/sections, an inspector (reusing the catalog-driven parameter
   forms and the design form), undo/redo, keyboard shortcuts, zoom. Save = `PUT script`/`PUT design` with the server's validation
   reasons shown at the place they name.
3. **Typed code view.** A tab with a code editor (e.g. Monaco) where the script is written as **TypeScript-like code whose types are
   generated from the catalog**: each part is a typed function with its parameters (so a label over 20 characters or an int outside its
   range is a compile-time error with autocomplete). Code and visual editor are **two views of the same script JSON**: editing either
   updates the other; code that cannot be mapped to a valid script says why. Specify the language precisely (grammar, how pieces/extras/
   stage/design overrides are expressed, how it round-trips to JSON, what is rejected) — keep it small and honest.
4. **Keyframes (SVGator-like animation of parameters).** A parameter that changes over time with easing. The script has no such thing
   today, so this needs a server change and a data-model extension; specify it as a later phase with the data model proposed (§7).

### 5.3 Compatibility with `video-anim` (hard requirement)

Datasets and pieces must move freely between the two dashboards:

- Both use **one shared implementation of the dataset format** — specify extracting `dataset-file`, `dataset-export`, `dataset-plan`,
  `dataset-run` and `fit-script` from `libs/music-motion` into a shared library (working name `@lab/animation-dataset`) **as the first
  change**, with no behaviour change in `video-anim`.
- Changes to the format are **additive**: anything the editor adds (layers, keyframes, its own UI state) goes in optional fields; the
  `version` rises only if something stops being readable. Readers are **tolerant**: unknown fields are kept and written back (the
  existing requirement "what the editor does not show is kept"). If the editor uses something the server cannot take yet, the import
  report says so explicitly instead of losing it silently.
- Shared golden dataset fixtures that both dashboards validate/import/export without loss, in tests.

### 5.4 Non-goals

Drawing/vector tools; frame-by-frame animation; rendering in the browser as the final output (the server still draws the video);
editing the song or its words; changing the server; anything in another dashboard.

---

## 6. Proposed shape (you may improve it — justify changes)

- **New app** `apps/motion-edit/`, created with the generator (`npm run new -- motion-edit`), own tokens and design (a darker "studio"
  look is fine; decide and record it), light/dark switch, es/en, Connection button, `?adapter=memory`.
- **Libraries:** extract the dataset logic (first change); put the editor's reusable parts in a new library
  (e.g. `@lab/motion-editor`: timeline, preview host, code view, script⇄code mapping, undo stack) so the editor logic is testable
  without the app shell; keep using `@lab/music-motion` for the port, adapters and model (or split the model out if you argue for it).
- **Routing:** the editor opens a piece by id (`/pieces/:id`); a piece list can be minimal (or reuse the library's pieces list) —
  decide.
- **Phasing (proposed — each phase = one OpenSpec change that ships something usable):**
  0. *Extract the dataset library* (no UI change).
  1. *Scaffold `motion-edit`* + open a piece + the **preview** (needs the server's preview source, §7; define the fallback if it is
     not there yet, e.g. user parts only, or an in-memory/mock preview for development).
  2. *Timeline editor* (drag/resize/snap, layers, inspector, undo/redo, save with validation reasons).
  3. *Typed code view* (type generation from the catalog, editor integration, round-trip).
  4. *Keyframes* (after the server supports them).

---

## 7. Requests to the server (specify exactly what the editor needs; do not assume)

Write these as a **document of requests** the owner can hand to the server team (inside your change, e.g. `server-requests.md`), each
with: the problem, the proposed endpoint/field with a JSON example, how the editor uses it, and a fallback if it is refused.
Known needs:

1. **Preview source.** One of: (a) the HTML of every part, built-in ones included (plus the exact page wrapper/runtime the server wraps
   around a fragment and its virtual clock protocol), so the browser can render a part itself; or (b) an endpoint that returns a frame
   of a piece at time *t* (and ideally a short clip of a range) using the saved design and script.
2. **Overlapping pieces / layers.** Today script pieces are sequential, gap-free and non-overlapping, with ≤ 3 extra parts each. A
   multi-track timeline needs a way to place pieces on layers that overlap, or an explicit statement that it will not be supported
   (then the editor models "layers" only as the `with` extras).
3. **Keyframes.** A field on a script piece, e.g. `animate: { <param>: [{ t, value, ease }] }`, evaluated per frame by the engine, plus
   how it interacts with the parts' `__params` (static today).
4. **Anything else** your design needs (e.g. a cheap validation-only endpoint to check a script without saving).

---

## 8. Format of your deliverable (OpenSpec, `spec-driven` schema)

Create these files (in a new folder `openspec/changes/<change-name>/`, e.g. `extract-animation-dataset-lib` for phase 0 and
`add-motion-edit-dashboard` for phases 1+; or one change per phase — your call, but the **first change must be implementable on its
own**). All **in English**.

- **`proposal.md`** — `## Why`, `## What Changes` (bullets, mark **BREAKING** where it applies), `## Capabilities` (`### New
  Capabilities` and `### Modified Capabilities`, each a `kebab-case` capability name; modified ones must be existing names under
  `openspec/specs/`), `## Impact` (code, APIs, dependencies).
- **`design.md`** — `## Context` (current state), `## Goals / Non-Goals`, `## Decisions` (numbered, each with the rationale and the
  alternatives rejected), `## Risks / Trade-offs`. This is where the preview-fidelity problem, the code language and the
  script⇄code mapping, the undo model, the dataset-compatibility rules and the library boundaries are settled.
- **`specs/<capability>/spec.md`** — delta specs. For a new capability: `# Spec Delta` then `## ADDED Requirements`, each
  `### Requirement: <sentence>` followed by a paragraph using **SHALL/SHALL NOT**, then one or more
  `#### Scenario: <name>` with `- **WHEN** …` / `- **THEN** …`. For an existing capability use `## MODIFIED Requirements` (repeat the
  whole requirement text with the change) or `## ADDED Requirements`. Requirements must be testable and observable.
- **`tasks.md`** — `# Tasks`, numbered groups (`## 1. …`) of checklist items (`- [ ] 1.1 …`), each small enough to be one commit-sized
  step, naming files/folders, the tests to write, and ending each group with the checks and "commit". Include verification against the
  real server and the docs/tutorial/ESTADO updates as the repository's changes do (look at any folder in `openspec/changes/archive/`
  for how finished changes were written, e.g. `2026-11-09-rework-animation-dataset-per-animation/`).

Quality bar: no "TBD"; every requirement has a scenario; every task is verifiable; the plan obeys §1's rules (independence, no HTML/CSS
in `.ts`, tokens only, es/en, in-memory adapter, tests). Prefer a few precise requirements over many vague ones.

---

## 9. Before you write, answer these (briefly, in your first message)

1. Anything in this brief that contradicts the repository.
2. The decisions you intend to take on: preview strategy and its fallback; whether layers are real or just `with`; the code language
   (one paragraph); the library split; the phase boundaries.
3. Questions for the owner that change scope (keep it to the few that matter).

Then wait for the owner's answers before producing the files.
