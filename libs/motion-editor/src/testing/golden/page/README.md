# The page the server wrote

`page-builder.golden.spec.ts` pins the browser's page builder to the server's. It needs one page the server wrote for a drawn piece and
the inputs it was made from. Drop these files here (all from the project the server made for a drawn piece, `<projects>/<piece>/`):

| File | Where it comes from |
|---|---|
| `page.html` | `motion/<scene id>.html` of the piece's project |
| `song-slice.json` | `motion/<scene id>.song.json`, the song map sliced to that scene |
| `piece.json` | `GET /api/music-motion/pieces/{id}` (the piece: size, script, design, song map) |
| `catalog.json` | `GET /api/music-motion/catalog` |
| `fragments.json` | `{ "<part name>": "<fragment>" }` for every part the scene uses (`GET /api/music-motion/parts/{name}`, or the part's `part.html`) |
| `scene-id.txt` | the id of the scene whose page `page.html` is (one line) |

Then change the `it.todo` of `page-builder.golden.spec.ts` into the test it describes: build the scene with `scenesOf` and `buildScenePage`,
and compare with `page.html` after whitespace normalisation, failing with the first differing line.

Until these files are here the spec stays a vitest `todo`, and `ESTADO.md` lists it as pending.
