# Mock API server

A copy of the `orchestrator serve` API that starts in a second, with no GPU, no models and without the Go server.
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
