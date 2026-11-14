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
- It starts with two projects: `demo` (video) and `demo-musica`.

## So that it does not lie

`npm test -w mock-api` checks that the sample data meets the contract, and that what the mock answers on each `GET` does too. Both tests are strict: an object with declared fields admits no others. Where the contract only says "an object" there is nothing
to check, and the test lists it at the end: describing those fields in `openapi.yaml` is what protects all the
dashboards. Today they are `environment`, `stats` and `runs/{id}/resources`.

It only guarantees the **shape** of the responses and the state flow (projects, runs); it does not validate or time like the real server.
