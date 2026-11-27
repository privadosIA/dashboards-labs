# Client labels as a visual category (`dashboard-full`)

The `client` label of an item (`dashboard-full`, `other-app`, `claude-test`, `embedded`, `unknown`) says where it came from. The owner uses it as a
category, so `dashboard-full` draws it as one: filter chips with the label's colour and count, a colour the owner can choose, and a way to change the label
of an item. The server (Veritmo, change `add-client-labels`) keeps the colours, so every dashboard shows the same one. The label is only visual: it gives no
permission and changes no behaviour. The server's own words are in `docs/requests/dashboards-lab-client-labels.md` of the Veritmo repository.

## What the dashboard does

- **Chips** (`shared/client-chips/`): the Projects list draws one chip per label of `GET /api/clients`, in the server's order (newest use first), with the
  colour and the count the server gives. A chip is a toggle; several can be on. The choice narrows the list, combines with the modes and the search, and is
  remembered in the browser (`mo.clients`). A chosen label the server no longer reports is dropped. When the call fails the list works without chips.
- **Colour**: the palette button of a chip opens a form (`#rrggbb`) that does `PUT /api/clients/{name}`; «Restore the default colour» sends `null`. The default is worked
  out from the name as the contract says (`shared/client-color.ts`: hue from the first four bytes of the SHA-256 of the name modulo 360, 55 %, 50 %), so a label the
  list does not have yet already has the colour the server will give it. The colour is data: it paints a dot and tints the surface (`color-mix` with the
  `--lab-*` tokens), and the text keeps the dashboard's ink, so it reads in both themes whatever colour is chosen (`contrast.spec.ts` tries the extremes).
- **Badge**: the label beside a project's name takes the label's colour. `embedded` is hidden unless a label is chosen.
- **Relabel**: the details dialog of a project has a client field with the known labels as suggestions; the generation row of the 3D library has a *Label* action.
  Only valid names are sent (`embedded`, `unknown` or `^[a-z0-9-]{1,32}$`); empty removes the label. A `409` (the item runs) says so and changes nothing.

## Which route changes a label

The label of an item of the generation API is changed by the route of its kind, never by `PATCH /api/projects/{id}` (the server answers `400` and names the
right route, so the project's label and the item's would drift apart). `ApiService.setClient(id, client)` chooses by the id's prefix, in the same table that
decides which route deletes it:

| Prefix | Route |
|---|---|
| `api-gen-` | `PATCH /api/generations/{id}` |
| `api-edit-` | `PATCH /api/image-edits/{id}` |
| `api-vid-` | `PATCH /api/video-edits/{id}` |
| `api-m3d-` | `PATCH /api/models3d/generations/{id}` |
| anything else | `PATCH /api/projects/{id}` |

A change of name and label together on one of those items is two requests (the name by the project route, the label by its own); the list is read again
whatever was applied (`ProjectsStore.patch`). An animation (`api-mm-`) is relabelled by `PATCH /api/music-motion/pieces/{id}` (`409` while it renders), chosen by the row's `kind` first and the prefix after.

## `managed=all` and the animations

The animations of the music mode (`api-mm-`, `kind: music_motion`) are rows of the shared listings only when `?managed=all` asks. `dashboard-full` asks it on `/api/projects`,
`/api/storage` and `/api/clips` (`all` also brings the generation API's items, which each say their `kind` / `project_kind`). The song library (`/api/library/songs`) does not ask:
its rows are songs and an animation is not one.

An animation row is not a project, so it is drawn and acted on by its kind (`shared/project-kind.ts`):

- it carries the *Animation* mark, its label with the label's colour and its size, and is listed through the *Animation* option of the *Modes shown* filter (the preference Runs already has, off by default), whatever the project modes chosen: an animation has no project mode and is not counted as a video project;
- it **opens the piece** (`/animation/pieces/{id}`) and is deleted with `DELETE /api/music-motion/pieces/{id}`; a `409` (the piece is
  being drawn) is said in the server's words and the row stays;
- it keeps the actions the server answers for the project it keeps for the animation: details (name and content label by the project route, the client label by the piece route), history (empty), storage, copy (an ordinary video project with its scenes) and export; it has no scene editor or clip review, and *Open* takes the place of *Edit*;
- the route of every managed item comes from its `kind` and, without one, from its id's prefix (the mock's sample pieces are called `sample-piece…`, which is why the kind wins).

What the real server does (tried on the 180): the animation row has `mode: 'video'` and its name is its id, so it is told by its `kind`, not by its mode, and the gallery and the run launcher read `ProjectsStore.workable()`, which leaves it out; a piece is listed only from its first render; `DELETE` of a piece that is rendering cancels and deletes it (`204`); `PATCH client` while it renders is a `409`. The project routes answer for a rendered animation: history (`[]`), export (dataset and zip), storage, `PATCH` of the name and duplicate (an ordinary video project).

So a label made only of animations has the rows its chip counts. The kept-clips picker marks a clip whose project is not an ordinary one (`Animation`, `Generation`…).

## The 3D library hook (`@lab/model-library-kit`)

The list of generations shows a label and the *Label* action only when the host provides `GENERATION_RELABEL` (`relabel(generation)`, `colorOf(client)`);
the library alone, and any other dashboard, shows the generations as before. `dashboard-full` provides it in `core/generation-relabel.ts`.

## The mock

`mock-api` serves `GET /api/clients`, `PUT /api/clients/{name}` and the four `PATCH {client}` with the contract's refusals (`400`, `404`, `409`), and answers `400`
to a `PATCH /api/projects/{id}` with `client` on an item that has its own route. `MOCK_CLIENT_LABELS=1 npm run dashboard-full:mock` labels the seed projects
(`dashboard-full`, `other-app`, `claude-test`) and gives `claude-test` a colour, so the chips have something to show.
