# @lab/model-library-kit

The library of 3D models for any dashboard: the packs of the server (install with progress, cancel, remove, import a zip), the catalog of the installed models (search, filters, pages,
pictures, licence, author and attribution) and a picker that copies a model into a project or a piece. It knows the server's `/api/models3d/` routes only through two ports the host gives.

| Piece | What it is |
|---|---|
| `MODEL_LIBRARY_PORT` | packs, install, cancel, remove, import, catalog, thumbnails and, where the server has the 3D service, the engines, the download of their weights and the generations (`ModelLibraryPort`; `engines()` answers `null` for a server with no service) |
| `MODEL_PLACE_PORT` | the models of one place (a project's sources or a piece): list, upload, remove, add from the library (`ModelPlacePort`); a host with no place gives none |
| `<lab-model-packs>` | the cards of the packs; `(changed)` says the catalog may be others now |
| `<lab-model-catalog>` | the models, with filters by pack, tag, source and engine; `[pickable]`, `(picked)`, `[refresh]` and `[find]` (a model's id: the generated models with that name) |
| `<lab-model-making>` | the engines (start, stop, the plan and download of the weights), the form to make a model from a text or a picture and the list of generations; shown only where the server has the 3D service; `(made)` and `(showModel)` |
| `ModelPicker` | `open('the project')`: the catalog in a dialog that adds the picked model to the place |
| `provideModelLibrary({ lang, pollMs?, pageSize? })` | the language (the host's) and the timings |
| `InMemoryModelLibrary`, `InMemoryModelPlace` | ports kept in memory for `?adapter=memory`, the examples and the specs (`service`: `none`, `bare`, `running` or the default) |

Nothing here is a dashboard's: texts are in Spanish and English, colours and shapes come from the `--lab-*` tokens every dashboard defines, and the import and generation forms are dynamic forms (`lib/packs/import-pack/dynamic/`, `lib/making/generate-model/dynamic/`).
`size` of a model in a scene is its **height**: that is said by the 3D scene block (`@lab/blender-scene-kit`), which hosts the models panel of a project or a piece.
