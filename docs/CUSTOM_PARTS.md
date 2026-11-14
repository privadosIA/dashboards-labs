# Writing a part by hand

A part is what a piece of a music-motion animation draws: the catalog has the server's own parts (`builtin`) and the ones of the user (`user`).
A user part is born as a **draft** (`/api/music-motion/part-drafts`): the assistant writes it from a sentence (and an image or a frame of a reference, if
given), or you write it yourself from scratch (`POST /part-drafts` with `{ manifest, fragment }` instead of `request`: no assistant, checked like an edit and
answered `ready` or `failed` with its problems). A draft is not in the catalog until it is approved (video-anim, *Parts*, where **New part from scratch** starts from a template).

Once approved, the part is the user's: `GET /parts/{name}` reads its two files, `PUT /parts/{name}` replaces them (checked like an approval; the name stays) and
`DELETE /parts/{name}` removes it (`409` while a piece or a style uses it, naming them, unless `?force=true`). A part that comes with the program is never changed.
The *Your parts* list of the Parts screen does all of it.

To change a part with the assistant, `POST /part-drafts` with `request` (the instruction, 1 to 500 characters) **and** `manifest` and `fragment` (the current text): the assistant
starts from that text and writes the changed version as a draft (`202`, then `ready` or `failed`) with `replaces` set to the name it came from, a name the draft may keep although the
catalog has it. `approve` still refuses a name the catalog has, so a change to an approved part is stored with `PUT /parts/{name}`: the Parts screen does it with **Replace the part**.
The screen also has a **Preview** that plays the text in the editor in the browser (visual part only, no song) before saving.

## The two files

- **Manifest** (JSON in a string): `name` (lowercase, dashes; not one the catalog already has), `description`, `version` (1), `levels` (`simple`, `medium`,
  `advanced`), `cost_ms` and `params`: each `{ name, type, description, default, ... }` with `type` one of `string` (`max_length`), `int` and `number`
  (`min`, `max`), `bool` and `enum` (`options`).
- **Fragment** (HTML): a `<style>`, the elements and a `<script>`. It reads its parameters from `window.__params` (already filled with the defaults), sizes in
  `vh` so it fits any frame, colours from `var(--accent)`, `var(--fg)`, `var(--bg)` and the typeface from `var(--display)`. To move, it sets
  `window.__partSeek = function (t, b) { ... }`: the page calls it for every frame with `t` (seconds of the piece) and the beat clock `b`
  (`b.number` the beat, `b.position` how far into it, 0 up to 1). Draw from those two and nothing else (no timers, no `Math.random` without a seed): the
  preview and the render must draw the same picture.

`docs/examples/beat-bars/` is a part written this way: a row of bars that jump on every beat and fall back before the next, with a label under them.

## From the editor

Motion Edit makes the whole cycle in a window, **New part…**, at the top of its library: describe the part (and a picture, if wanted), follow the draft the assistant writes, change its manifest and
fragment (with **Start from the template** to begin a hand-written one), see its four previews and approve it, after which the library has it at once. See the Motion Edit tutorial.

## What the server checks, and what it said

The same checks as for any part (manifest and fragment rules, that the page draws, that it moves, that two moments do not look identical, that the name is free). Found by trying:

- A draft cannot declare an `animatable` parameter: `the parameter "gain" is marked animatable: a part that is drafted cannot declare animatable parameters`
  (`422`, and the draft does not change). Only the server's own parts can be animated with keyframes.
- A draft that passes goes to `ready` with four preview images (`GET /part-drafts/{id}/preview/00.png` to `03.png`), which are the four moments it was drawn at.
