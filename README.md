# dashboards-lab

The public edition of the dashboards of **mediaOrquestator**: the server's management dashboard (`apps/dashboard-full`) and the libraries it is built from. They share the API contract, the server mock, the generated client and the forms system.

**This repository contains no server code.** It only consumes its contract (`contract/openapi.yaml`), a versioned copy
of the OpenAPI description that the server serves at `GET /api/openapi.json`.

## Getting started

```bash
npm install
npm run mock            # el servidor simulado en http://127.0.0.1:4667, sin GPU ni modelos
npm test                # los tests de los scripts, del simulado y de las librerías de Angular
```

## Documentation

| Guide | What it covers |
|---|---|
| [`docs/CONTRACT_AND_CLIENT.md`](docs/CONTRACT_AND_CLIENT.md) | The contract copy, how to keep it in step with the server, and the typed API client generated from it |
| [`docs/SERVER_CONNECTION.md`](docs/SERVER_CONNECTION.md) | The Connection box: address, token and tickets for media |
| [`docs/FORMS_KIT.md`](docs/FORMS_KIT.md) | The forms kit and the JSON schemas of the forms |
| [`docs/TAILWIND_BRIDGE.md`](docs/TAILWIND_BRIDGE.md) | Tailwind through each dashboard's tokens (the bridge) and the `@lab/motion-ui` animation helpers |
| [`docs/DASHBOARDS.md`](docs/DASHBOARDS.md) | How to run the Dashboard Full and where its guide is |
| [`docs/ANIMATION_DATASET.md`](docs/ANIMATION_DATASET.md) | The dataset file of one animation (design, script, own parts, theme and crossfade, scenes) |
| [`docs/MOTION_SCRIPT_CODE.md`](docs/MOTION_SCRIPT_CODE.md) | The script as typed code (the Code tab of Motion Edit): the language, the times and what is checked |
| [`docs/VECTOR_PARTS.md`](docs/VECTOR_PARTS.md) | The vector editor's parts: what the fragment carries, the node kinds, what animates, parameters, fonts, images, what the server checks |
| [`docs/PROMPT_PRESETS.md`](docs/PROMPT_PRESETS.md) | The prompt presets: model, bundle, where they live and how the examples are chosen |
| `docs/TUTORIAL*.md` | The screen-by-screen guides, in English and Spanish |

## What is here

| Folder | What it is |
|---|---|
| `contract/` | The copy of the contract and the record of its origin |
| `mock-api/` | The API mock server (see its README) |
| `libs/api-client/` | The API client, with types generated from the contract |
| `libs/forms-kit/` | The shared configuration of the forms and their JSON schemas |
| `libs/motion-parts/` | The form for the parameters of a catalog part (used by `dashboard-full`) |
| `libs/animation-core/` | The model, port, failure and pure script edits of "music in motion", with no Angular screen (`@lab/animation-core`) |
| `libs/animation-dataset/` | The animation dataset format: validate, export, plan, import, fit, and the golden files (`@lab/animation-dataset`) |
| `libs/motion-editor/` | The preview of a piece in the browser (page builder, wrapper, clock, frame host, transport), the timeline and layers panel of and (entry `@lab/motion-editor/code`) the script as typed code: parser, mapper both ways and the declarations generated from the catalog |
| `libs/music-motion/` | The screens, port and adapters of the "music in motion" API (mounted by `dashboard-full`) |
| `libs/server-connection/` | The server connection box (address, token, tickets) used by all the dashboards |
| `libs/theme-switch/` | The light/dark switch of the dashboards (service and header button) |
| `libs/vector-editor/` | The vector animation editor, with no server and no music domain: tree document model (groups, imports, rectangles, ellipses, lines, text and images, links to the beat), SVG import and cleaning, canvas with handles and drawing tools, multi-selection, align and snap, layers, properties, timeline and transport, history, the runtime a part carries and the export to a part, an animated SVG or a still (`@lab/vector-editor`) |
| `libs/paged-list/` | The paged list used by the lists of the dashboards |
| `libs/music-studio-kit/` | The music studio (port, adapters, page and Engines panel; mounted by `dashboard-full`) |
| `libs/motion-edit-kit/` | The editor of animated pieces (list of pieces with import, the guided flow from one sentence to a video, editor page with timeline, layers, inspector, Code and Vector tabs; mounted by `dashboard-full`) (`@lab/motion-edit-kit`) |
| `libs/assist-kit/` | The assistant picker (provider and model, consent, add an external provider) and the providers reader, shared by the guided flow, Dataset Studio (its Providers tab), the screens of Animation that ask the assistant to write and the Vector describe dialog (`@lab/assist-kit`) |
| `libs/dataset-studio-kit/` | The dataset generator (kinds, engines read from the server, brief, presets, generation, preview and actions; mounted by `dashboard-full`) (`@lab/dataset-studio-kit`) |
| `libs/vector-studio-kit/` | The Vector Studio (editor page, catalog of vector parts, the sinks of the catalog and the assistant, the hand-off; mounted by `dashboard-full`) (`@lab/vector-studio-kit`) |
| `libs/video-studio-kit/` | The video studio (ports, adapters and page; mounted by `dashboard-full`) |
| `apps/dashboard-full/` | The server's management dashboard, moved by areas from its `web/` |
| `vendor/` | `@core/dynamic-forms` packaged, to install without a private registry |
| `scripts/` | `sync-contract`, `generate-client`, `check-dynamic`, `check-theme` and their tests (the prompt presets are fetched by the server's `orchestrator prompts fetch`, see [`docs/PROMPT_PRESETS.md`](docs/PROMPT_PRESETS.md)) |

## Related repositories

Depends on `mediaOrquestator` (the contract in `contract/openapi.yaml` and the server it talks to) and on `forms-lib` (vendored in `vendor/`). Nothing depends on it.

| Repository | What it is |
|---|---|
| [`mediaOrquestator`](https://github.com/privadosIA/mediaOrquestator) | The server: the HTTP API and its contract, the pipelines (video, images, music), the run history and the music services it starts. |
| [`dashboards-labs`](https://github.com/privadosIA/dashboards-labs) (this repository) | The dashboards (Angular) that talk to the server through its OpenAPI contract. |
| [`heartmula`](https://github.com/privadosIA/heartmula) | C# (.NET 8 + TorchSharp) port of [heartlib](https://github.com/HeartMuLa/heartlib): the HeartMuLa song generator, run by the server as a service. |
| [`DiffRhythm2`](https://github.com/privadosIA/DiffRhythm2) | C# port of [DiffRhythm2](https://github.com/ASLP-lab/DiffRhythm2): a diffusion model that writes a whole song. |
| [`lion-clap`](https://github.com/privadosIA/lion-clap) | C# port of [LAION-CLAP](https://github.com/LAION-AI/CLAP): audio and text embeddings, used to recognise songs. |
| [`musicgen-core`](https://github.com/privadosIA/musicgen-core) | The TorchSharp building blocks shared by the three ports. |
| [`forms-lib`](https://github.com/privadosIA/forms-lib) | `@core/dynamic-forms`, the Angular library that draws forms and tables from JSON (vendored in `dashboards-labs`). |

The links are to the private copies of these repositories. The third-party tools, models and libraries they build on, with their licenses, are listed in [THIRD_PARTY.md](https://github.com/privadosIA/mediaOrquestator/blob/main/THIRD_PARTY.md).

## License

MIT, see [LICENSE](LICENSE). `vendor/` keeps the license of the packages it holds.

## Accessibility

`npm run a11y:audit` opens the screens of every dashboard (`dashboard-full`, on their in-memory adapters or the simulated API) in a real browser, in the light and the dark theme, and checks them with axe-core against WCAG 2.0 and 2.1, levels A and AA: it prints the violations by rule and exits with 1 on a `serious` or `critical` one (`--fail-on`, `--json file`; `E2E_CHANNEL=chrome` uses the installed Chrome). Motion Edit also keeps it in its end-to-end suite (`apps/motion-edit/e2e/a11y.spec.ts`).
