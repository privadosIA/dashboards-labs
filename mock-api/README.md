# Mock API server

A copy of the `veritmo serve` API that starts in a second, with no GPU, no models and without the Go server.
It serves to develop and test **any dashboard** of this workspace.

```bash
npm install                      # una vez, en la raíz del repositorio
npm run mock                     # http://127.0.0.1:4667
node mock-api/server.mjs --spec http://servidor:4666/api/openapi.json   # con el contrato de un servidor en marcha
```

An Angular dashboard uses it with a proxy from `/api` to `http://127.0.0.1:4667`.

Options: `--spec <fichero o URL>` (by default, `contract/openapi.yaml` of this repository), `--port`, `--host`,
`--latency <ms>`, `--token <t>`, `--speed <n>` (the simulated runs go n times faster) and
`--persist <fichero.json>` (saves the state between starts; without it everything lives in memory).

## What it does

- **The routes come from the server's OpenAPI contract**: if the API changes, the mock follows it.
- **Stateful** (POST, PUT and DELETE change what the next GET returns): projects and their YAML, duplicating,
  runs (queue one at a time, cancel, delete, simulated SSE events) and settings.
- **Video generation and image retouching** (`generation.mjs`): `GET /api/generation/options`, `POST/GET/DELETE
  /api/generations` and `/api/image-edits`, with the same refusals as the server (duration, aspect ratio, quality,
  audio, model, `strength`, variants; `422`, and `503` for what this simulated machine cannot run: H3 and
  AnimateDiff). The state comes from the clock (queued, running with progress, done; `--speed` speeds it up) and a prompt with
  `[fail]` ends up failing. Its `run_id` is made up: there is no run in `/api/runs`.
- **Video editing and motion library** (`video-edit.mjs`): `GET /api/video-edits/options` (the seven
  tools; `depth` comes out unavailable, with its reason, and gives `503`), `POST/GET/DELETE /api/video-edits` (multipart with
  `request`, `video` and `image`) and `GET/POST/DELETE /api/motions` with their preview. The same refusals as the contract
  (setting out of limits, not a video, missing or surplus image, video and motion at the same time). The state comes from the clock;
  `[fail]` in the prompt of `extend`/`motion-control` or in the title of a motion ends up failing, and a video file
  with `long` or `empty` in its name is rejected when added as a motion. They still do not exist on the real server.
- **Stored motion pages** (`motion-pages.mjs`): `GET`, `PUT` and `POST .../generate` of `/api/projects/{id}/scenes/{scene}/motion`
  (a page per scene and overlay, kept in memory; generate writes a sample page with a timeline block) and
  `POST .../motion/revise`, which changes only that block from a request in words (slower, faster, a bounce on the title, stagger;
  anything else delays the entrances a little) and answers the page with `revised`. Refusals as the contract: `400` for an empty or
  over 1000 characters instruction, `404` for a missing project or page, `422` for a page without a block and for `[fail]` in the
  instruction; the stored page is untouched on a refusal.
- **3D models** (`models3d.mjs`, and the piece's own routes in `music-motion.mjs`): the library `/api/models3d/` (the six CC0 packs of the server's list, a sample
  of each one's models; an install is `installing` with a growing `progress` for `MOCK_MODELS_MS` ms (2000), then `installed`, and `MOCK_MODELS_FAIL=<pack>` makes
  that pack fail once; cancel, remove, import of a zip with its required licence: `422` with no `.glb`, `409` for an id in use; the catalog with `q`, `pack`, `tag`,
  `has_clips` and its page headers; thumbnails, with `kenney-retro-urban-kit` answering `503` as a pack with no preview does), the `model` kind of a project's sources
  (a `.glb` read as the server reads it: clips, triangles, the pictures it names; `POST .../sources/model` copies one of the library with its pictures as
  `<pack>--<picture>`) and the models of a piece (`GET`, `PUT`, `DELETE`, `POST .../models`, with `blender-models` in the catalog's features). A description that places a
  model is refused by its place: no project, a file that is not there, a clip it does not have, a picture it misses.
- **Making 3D models** (`models3d-generation.mjs`): the engines `GET /api/models3d/engines` with the server's reasons and, for each, the `backends` (TripoSR and Stable Fast 3D run as a .NET service, the default, or in the
  Docker container, by one saved setting for both; the weights of Stable Fast 3D need the saved Hugging Face key whatever the backend), the setting `model3d_backend` and the block `model3d` of `GET /api/settings` (422 for another value and `no_docker`, 409 for an external service;
  what ran on the old backend stops), start and stop of each engine's own service (`starting` for `MOCK_MODEL3D_START_MS` ms), the install by backend and parts (`POST .../install` answers the plan with
  `backend` and `parts` (`service`, `image`, `weights`), `{confirm: true}` starts a job that runs its parts one after the other in about 1.5 x `MOCK_MODELS_MS` ms naming the one that runs, and
  `.../installs/{id}` with its cancel) and the generations `/api/models3d/generations` (a text as JSON or a picture as multipart: queued, running with the step `picture` and then `model`, done with the
  model in the pack `generated`; a text with the word `fail` ends failed; the refusals 400 naming the field, 413, 422, 503 with the engine's reason). The catalog also takes `source`, `engine` and
  `project` and its `q` looks in the text. `MOCK_MODEL3D` picks the machine: unset (TripoSR's service and weights there, stopped; sf3d without a key), `bare` (no weights, to see the install),
  `noservice` (neither the service nor the weights), `running` (TripoSR up) or `none` (no 3D service: 503); `MOCK_DOCKER=0` is a machine where Docker does not answer, `MOCK_MODEL3D_HOST=1` an external
  service, `MOCK_INSTALL_FAIL=<part>` makes that part fail once, `MOCK_MODEL3D_SF3D=ready` makes sf3d usable, `MOCK_NO_IMAGE_MODEL=1` is a machine with no image model and `MOCK_ADULT=1` a server that
  keeps adult content.
- **A machine without Blender:** `MOCK_BLENDER=missing npm run mock` reports `blender` as missing in `GET /api/environment` (the default is present, version 4.2.3), so the dashboards show nothing 3D.
- **A library that starts full:** `MOCK_PRELOADED_LIBRARY=1 npm run mock` starts with the packs `kenney-furniture-kit` and `kenney-mini-characters` installed and three models an engine made (`wooden-chest`, `red-sailboat`, `potted-cactus`); the public demo runs this way. Without it the library starts empty.
- **A server that does not serve model files:** `MOCK_MODEL_FILE=missing npm run mock` answers `404` for `GET /api/models3d/models/{pack}/{name}/file` (the default serves a sample `.glb` with the model's clips and about its triangles, with `ETag`, `304` and `Range`).
- **Projects of the mode `models3d`** (`models3d-project.mjs`): `output.mode: models3d` with `models:` and `defaults.models3d` is accepted and refused with the server's words (plain unique id, a prompt or an
  image and not both, 1000 characters, engine, detail, variants 1 to 4, scenes or tracks, the keys in another mode); a run goes through the entries (the phases `render` and `model3d`, `skipped` when not needed),
  leaves `out/<project>/<id>.glb` and `manifest.json` (served as artifacts), remakes only what a key says changed, copies each model into the pack `generated` with the project and the entry, and fails with the
  engine's reason when an engine cannot be used (`MOCK_MODEL3D=running` makes triposr usable). `GET /api/runs` and `GET /api/stats` take `mode` (alone or in a list; a mode that is none is a 400 that lists them).
- **Datasets of 3D models** (`models3d-dataset.mjs`, the assistant in `dataset-assist.mjs`): `POST /api/import/preview` with `mode: "models3d"` reads each tuple's text before the first marker as the prompt of one object and
  `Engine:`, `Detail:`, `Variants:`, `Seed:`, `Image:` and `Adult:` as one field each (ids made plain and unique with a warning, `rejected` naming the line, the prompt dropped for an `Image:` line, `Adult: true` a 422 `content_not_allowed`
  unless `MOCK_ADULT=1`); `POST /api/import/confirm` makes the project in the mode `models3d`; `POST /api/assist/dataset` with `mode: "models3d"` writes up to 12 objects alone (the sentence's objects, or three finishes of a single one;
  `picture` and `project` are a 400) and the prompt presets accept the kind `model3d`.
- **3D scene descriptions** (`blender-descriptions.mjs`): `POST /api/projects/{id}/blender/descriptions` (the "model" writes the example
  description of the server's tests, kept as `assets/titulo.scene.json`; with `revise` it adjusts the camera's lens by what the request says),
  `GET` and `PUT .../descriptions/{name}` (a save names each fault by its place in the JSON, for example `objects[1].keys[1].t: 7 is outside
  the scene (0 to 5 s)`) and `POST .../preview` (a placeholder PNG). Refusals as the contract: `400` for a bad name, an empty or over 2000
  characters idea, seconds outside 0.5 to 600 or a description that does not pass, `404` for a missing project or description, `422` for
  `[fail]` in the idea; a refused request leaves the stored description untouched. Kept in memory per project.
- **Realistic sample data** in `fixtures.mjs` for what a dashboard reads field by field and the contract does not detail:
  environment, settings, models and catalog, statistics, music engines, model paths, storage and resources
  of a run. If a screen comes out empty or broken, this is the place to add data.
- **The rest of the endpoints** answer with an example generated from their schema (lists, empty) and accept writes
  without effect.
- **Filler files:** the images, videos and songs of a project (`.../artifacts/...`) are a small PNG, MP4 and
  MP3, from `assets/`. Any other file gives 404.
- **Lists in pages** (`listing.mjs`): every list that declares `limit`, `offset`, `sort` and `q` answers them as the contract says, with
  `X-Total-Count` and `Link` (exposed to a browser through CORS) and a `400` that names the accepted sort fields. The sort fields are
  read from the contract's own text. Without any of the parameters a list answers every item as it always did.
- **What the server keeps in its database** (`database.mjs`, `data.mjs`, `catalog.mjs`): the version history of a project's definition
  (every save that changes it keeps the text it replaces; list, read and restore) and `PATCH` of its name, client and adult label; the song
  library with stars, `rescan` and playlists; the prompt presets (a bundled one is `403`), the providers with the routing of the tasks
  (`409` naming the task that still uses one, `consent_required` for a remote one), and the blocks of HyperFrames; and **`/api/data/*`**:
  the status, the import (`MOCK_DATA_FAIL=<entity>` makes the first import of that entity fail, `MOCK_IMPORT_MS` holds it so a second
  request meets the `409`; the entity `prompts` skips a file the first time, so cleaning it is refused until it is imported again), the
  cleaning of the files left behind and an export that is a real `.zip` (`zip.mjs`, with its own CRC-32).
- **The animation library** (`music-motion.mjs`): characters and backgrounds of the user's (CRUD; the program's are `403`; the drawings pass
  the library's checks: no script, `foreignObject`, event handler or outside link), parts of the user's made without a draft, what was learned
  from a reference, the details of a piece (`PATCH`), and the new optional fields (`repairs`, `fixed_copy`, `fallback_pieces`).
- **A mock with a lot in it:** `MOCK_BULK=170 npm run mock` adds 170 generated projects, songs and part drafts (a third of the drafts failed
  and every fourth is a scene written for a piece), so a screen that pages, filters or searches has something to work on. The data is the same
  every time (a seeded generator) and without the variable the sample data is exactly what it was.
- It starts with two projects: `demo` (video) and `demo-musica`.

## So that it does not lie

`npm test -w mock-api` checks that the sample data meets the contract, and that what the mock answers on each `GET` does too, asked plainly and asked for a page (body and headers). Both tests are strict: an object with declared fields admits no others. Where the contract only says "an object" there is nothing
to check, and the test lists it at the end: describing those fields in `openapi.yaml` is what protects all the
dashboards. Today they are `environment`, `stats` and `runs/{id}/resources`.

It only guarantees the **shape** of the responses and the state flow (projects, runs); it does not validate or time like the real server.
