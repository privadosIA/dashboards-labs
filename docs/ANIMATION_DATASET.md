# The animation dataset

The implementation (validate, export, plan, import, fit) is `@lab/animation-dataset`; `libs/animation-dataset/src/testing/golden/` holds the files every consumer must import and export without loss.

A file that takes **one animation** of `video-anim` (or of the Animation section of `dashboard-full`) out of one server and brings it
into another, as in `dashboard-full` a dataset is one project. It carries the animation's design and script (never the video), the
song it follows, its options, the **look** it came from (the style and the YouTube address of its reference) and the **own parts** its
script uses. It is the animation's own format. It is **not** the project dataset of `dashboard-full` (a video project's scenes, which the
server imports under `/api/import`) and **not** the descriptor file of the demonstration data (`libs/music-motion/sample/`, loaded in
memory mode only).

It is **exported from the animation**: the **Export dataset** button of each piece's card and of the piece's page, and one on each row of
the animations listed on the **Datasets** screen. It reads only what that animation needs (see "Export"). There is no export of a whole
server: a dataset is one animation.

## Format

A JSON object. `format`, `version` (2) and `animation` are required.

```json
{
  "format": "music-motion-dataset",
  "version": 2,
  "exportedAt": "2026-11-09T10:00:00.000Z",
  "animation": {
    "title": "Neon Pulse",
    "song": { "project": "ms-1", "trackId": "pista_1", "variant": 0, "title": "Neon Pulse", "seconds": 135.04 },
    "options": { "style": "typographic", "level": "medium", "fps": 30, "resolution": "1280x720" },
    "design": { "dark": "#1d1425", "light": "#c7ad93", "accent": "#6e58db", "display": "condensed", "body": "grotesk", "defaultMode": "dark", "modes": { "intro": "dark", "chorus": "light" }, "concept": "neon city" },
    "script": { "version": 1, "pieces": [{ "id": "p1", "start": 0, "end": 10, "part": "synth-sun" }] },
    "look": {
      "style": { "name": "Meat Proxy", "reference": "https://www.youtube.com/watch?v=gQvQ2NanBTI", "design": { "...": "as above" }, "rhythm": 8, "parts": ["synth-sun", "warp-grid"] },
      "reference": { "title": "A video", "notes": "", "tags": ["edm"], "source": "https://youtu.be/abc" }
    },
    "parts": [
      { "name": "my-part", "description": "what it draws", "levels": ["simple"], "params": [], "text": null },
      { "name": "draft-part", "description": "from a draft", "text": { "request": "a sun", "manifest": "{...}", "fragment": "<div></div>" } }
    ]
  }
}
```

| Field | Notes |
|---|---|
| `title` | The animation's title (at most 120 characters). The file is named after it. |
| `song` | The song the animation follows: `project`, `trackId`, `variant`, `title` and `seconds`, the length of its song map (what a script is fitted from when the animation goes on another song). |
| `options` | `style` (`typographic` or `illustrated`), `level`, `fps` and `resolution`. |
| `design`, `script` | As the server keeps them. A `verseStyle` or `hitStyle` the dashboard does not know is kept as it is. A piece or an extra part of the script may carry `animate`: see *Animated parameters*. |
| `look` | Optional. `style`: the style the animation started from (`name`, `design`, `rhythm` from 2 to 15 seconds, `parts` at most 8 with no repeats, and `reference`, the address of its reference). `reference`: that reference's `title`, `notes`, `tags` (at most 10) and `source`, the YouTube address, so it can be added again. A style kept in the browser that the animation started from goes as the look too. |
| `parts` | Optional, at most 50: the own parts (`source: user`) the script uses. `text` is `null` for a part that was approved, because the server does not let it be read back: only its description and parameters go. A ready draft carries `text` with its `request`, `manifest` and `fragment`. A part that comes with the server is never in the file. |

A file is at most 5 MB. It never carries a token, a ticket, or the address of a video or a key frame on the server (a reference's YouTube
address is the only address in it).

The validator (`validateAnimationDataset` in `libs/music-motion/src/lib/animation/dataset-file.ts`) lists every problem with its place,
in Spanish and English, and accepts nothing if there is one. The first version of the file (four lists: styles, pieces, parts and
references, `version: 1`) was never published and is **no longer read**: it is refused as not being the dataset of an animation, as are a
project dataset and the demonstration file.

## Export

`buildAnimationExport(port, pieceId, local)` reads, through the port: the piece (design, script, song map); the style the piece started
from and that style's reference (only those two, never the lists); the own style it started from when that one is kept in this browser;
the catalog, to know which parts of its script are the user's; and the drafts only when one of those parts needs it, to find a ready
draft with its text. The same code serves the server's adapter and the in-memory one. A piece that started from a style that was since
deleted exports with no look and is still complete.

## Import

The Datasets screen reads a file (up to 5 MB), checks it and shows a **report before anything changes**: one line for the song, the
reference, the style, each own part and the animation, saying whether it will be created, is already there, will be kept in the browser or
cannot be done, and why. Cancelling the report leaves everything as it was; confirming creates what the report said.

What counts as "already there" (so that importing a file twice makes nothing twice):

| Item | It is the same as one that exists when |
|---|---|
| Reference | its address is the same, written however (`youtu.be/x`, `youtube.com/watch?v=x`, `music.youtube.com/...`) |
| Style | its name and the address of its reference are the same (a style kept in the browser counts) |
| Part | its name is in the catalog, or a draft has it |
| Animation | the song, the design and the script are the same (the plain verse and hit styles count as none) |

A script is compared **as the server keeps it**, which makes the pieces cover the whole song: a file exported from a server always
matches, a script written by hand that stops short of the song's end does not.

### Animated parameters

A piece, and each extra part of a piece (`with`), may carry `animate`: a map from a parameter name to its keyframes, as the server takes them.

```json
{ "id": "p1", "start": 0, "end": 24, "part": "counter", "params": { "to": 50 },
  "animate": { "to": [{ "t": 0, "value": 1, "ease": "in" }, { "t": 12, "value": 500, "ease": "out" }, { "t": 24, "value": 100 }] } }
```

`t` is in the piece's own seconds (0 is its start), **strictly increasing** and inside the piece; `value` is text, a number or `true`/`false`;
`ease` (optional, linear when absent) says how the value travels **from that keyframe to the next**: `linear`, `in`, `out`, `in-out` or `step`
(hold). A parameter has 1 to 200 keyframes. The validator names the place of every problem (`animation.script.pieces[0].animate.to[1]: ...`)
and nothing is imported from a file that has one. The `version` stays 2: `animate` is an optional field. A file with keyframes round-trips like
any other (`testing/golden/keyframes.json`).

Whether the target server takes them is in its catalog (`features` has `animate`). When it does not, the animation's line in the report says
`animate-unsupported` and names what would be dropped (`p1: to`, `p2 (counter): to`); the animation is **not made until the person confirms**
that line, and then it is made without any `animate` (the result says so). When the animation goes on another song, the keyframes' times are
scaled together with their piece.

### Theme and crossfade

The design may carry `theme` and `transitionSeconds`, and a piece of the script `transition_seconds` (written as the server writes the script):

```json
"design": { "...": "as above",
  "transitionSeconds": 0.3,
  "theme": { "css": "#verse{letter-spacing:.08em}", "assets": { "mascot": "<svg xmlns=\"http://www.w3.org/2000/svg\">…</svg>" }, "hud": { "tl": "QUIET TOWN", "br": "00:48" } } },
"script": { "pieces": [{ "id": "p1", "start": 0, "end": 24, "part": "toggle", "transition_seconds": 0 }] }
```

`css` is text of up to 20 KB, `assets` at most five SVG drawings of up to 50 KB each (a name is lower case letters, digits and `_`, from a letter, up to 32 characters), `hud` up to four texts
(`tl`, `tr`, `bl`, `br`) of up to 40 characters; `transitionSeconds` and `transition_seconds` are from 0 to 2. The validator names the place of every problem
(`animation.design.theme.hud: ...`, `animation.script.pieces[1].transition_seconds: ...`), in both languages. What the server refuses in the CSS or in a drawing (an `@import`, a `url(` that is not `data:`,
a script in an SVG) is the server's business and comes back as its reason when the design is saved. The `version` stays 2: the fields are optional.

### Scenes

A scene is a part written for **one script piece of one piece** (`manifest.scene: { piece, script_piece }`, `verse: "own"`). It travels as an own part **with its text**: the exporter reads it back
(the server lets a scene be read with its piece) and the file lists it among `parts` with `text` filled, never `null`. Names and piece ids are not stable across servers, so **an import makes
its scenes again**: it creates the animation's piece first, then each scene from its text through a draft, with the name `scene-<end of the new piece's id>-<n>` and `scene.piece` set to the
new piece (the server refuses a scene whose piece does not exist), approves it at once, rewrites the script's references from the old names to the new ones and saves design and script. A scene that
cannot be made stops the animation, and the piece that was made for it is removed. The report counts the scenes that came along (`N scenes`). A file with scenes is always a **new animation**
(it is never "already there": its scenes belong to one piece), so importing it twice makes two. A file that has scenes is checked as any other: `testing/golden/scenes.json` round-trips with the
names put back.

### Layers

A script may carry `layers`: up to 4 lanes `{ id, items }` of parts drawn over the sequence of pieces, each lane with up to 32 items `{ part, params?, start, end, animate? }`.

```json
"layers": [{ "id": "strip", "items": [{ "part": "wire-sphere", "params": { "detail": 12 }, "start": 0, "end": 48 }] }]
```

`start` and `end` are **song seconds**, inside the song, the start before the end, and an item starts after the one before it in its lane ends; the id is lower case letters,
digits and dashes (up to 24, unique). The `animate` of an item has its keyframes in seconds from the item's own start, and is checked against the item's length. The validator
names the place of every problem (`animation.script.layers[1].items[0]: ...`); the catalog's rules (the part exists, a part is not drawn twice on a page) are the server's business.
The `version` stays 2 and a file with layers round-trips like any other (`testing/golden/layers.json`).

Whether the target server takes them is in its catalog (`features` has `layers`). When it does not, the animation's line in the report says `layers-unsupported`, names the lanes (and
the keyframes that would go too if the server takes none), and the animation is **not made until the person confirms** that line (the same box as for keyframes); then it is made without
`layers`. When the animation goes on another song the items' times are scaled with the song (an item that collapses to under half a second is dropped) and their keyframes with them.

### Another song

The report has a **song picker**. By default it is the file's song, when the library has it; the person can pick any song of the library
instead, which is how an animation becomes a template. Then the script is **fitted** (`fitScript` in `animation/fit-script.ts`), after the
animation is made, because only then is the new song's map known:

- the times of every piece are scaled by the length of the new song's map over the file's `song.seconds`, and the pieces are made to cover
  `[0, duration]` exactly: each starts where the one before ends and the last one ends with the song (a piece that collapses to nothing is
  dropped and its time goes to the next one);
- the section of each piece is taken again from the new song's sections, where its start falls, and its mode from the design's `modes` for
  that section;
- the `lines` and the word `hit` of the old song are dropped (they belong to its words); everything else a piece has is kept, and the times
  of its keyframes are scaled with the piece.

Fitting is a guess: it keeps the order and the proportions, but the part choices were made for another song's shape. The report says the
script was fitted and it is edited like any other afterwards. With the song of the file, design and script go exactly as the file has them.
An animation put on another song is always a new one.

### Why an item cannot be done

A song that is not in the library (the report asks for another one), parts the animation's script uses that the catalog does not have yet
(the report names them: **a draft is not a part until it is approved**, so approve on Parts the drafts the file brings and import again), a
part with no text, a reference with no address, or the text of a draft that is not a manifest naming the part. A style that the server cannot
make because there is no ready reference to start from, or because it uses parts nobody has, is **kept in the browser**, not lost.

### Order of creation

The reference (waited for until it is analysed, ten minutes in all), then the style (made from the ready reference and then given the
file's name, design, rhythm and parts), then the own parts (as drafts, asked of the assistant from the request and then given the file's
text; **nothing is approved by an import**), then the animation (made on the chosen song with the file's options and the style, then given
the design and the script). A failure of one item changes nothing of the others: when only the look fails the animation is still made. The
result lists each item as created, already there, kept, failed with the server's words, or not done, and links to the animation. The
import can be stopped; what was made stays. An animation made from a style kept in the browser remembers it, so exporting it again carries
the look.

## Styles kept in the browser, and the builder

The server only makes a style from a ready reference. A style that cannot be made that way (the import has no ready reference to start it
from, or it was made with the builder) is **kept in the browser** under `music-motion.styles.<client>`, listed on the Styles screen under
"Kept in this browser", included in the next export, and recognised by an import as already there. If the storage cannot be used they live
until the page is closed and the screen says so.

**New style** (Styles screen) opens the builder: the same design form as a style of the server, plus a picker over the catalog's parts
(search, a level filter, each part's levels and cost, at most 8, no repeats, in order). It is kept in the browser unless a ready reference is
chosen under "Where to keep it", in which case it is made on the server from that reference and then given the builder's name, design, rhythm
and parts. A style kept in the browser is moved to the server the same way, and the copy in the browser goes only once the server has it.

When a piece is made from an own style, the choice of style lists it beside the server's. The piece is made with no style of the server,
given the style's design, and given a script that cycles through the style's parts, one every `rhythm` seconds over the length of the
piece's song map (the server checks the script against that length, not against the library's rounded one). A part the level does not
draw is swapped for one it does. The piece's screen says it started from an own style. The script is a plain start: it is edited on the
piece like any other, and the assistant can still be asked for a new one there.

## New animation

**New animation** (Pieces screen and the navigation) starts a piece without going through Songs. It has three steps:

1. **Look.** A reference that is already in the library (ready ones, with a key frame), or a YouTube address pasted here: it is added as a
   reference and followed until it is analysed, without leaving the step. Or a style of the server, an own style kept in the browser, or none.
   Choosing makes nothing: when the animation is made, the style of the chosen reference is made (`POST /presets`), or the one already made from
   that reference is used.
2. **Song.** A song of the library, picked from the same cards as the Songs screen. An address that names a song
   (`/new?project=&track=&variant=`, as the Animate button of Songs does) starts at the options with that song chosen.
3. **Options.** Style, level, frame rate, resolution and whether to hear the words, as before.

**The prompt** is the fourth step, optional, up to 200 characters (the most a design's concept holds). When it is not empty, after the piece is
made the text becomes the concept of its design and the assistant is asked for the script; the piece's page says once whether the assistant or the
fixed rule wrote it, and never that the text steered the result when the server answered from the fixed rule. With an own style the script comes
from its parts and the text is only kept as the concept. A failure of the text does not undo the piece. Seen on the real server: the concept does
steer the assistant somewhat, but it does not always answer (see `docs/server-request-music-motion-prompt.md`, which asks for a real `prompt` field
and is not sent).

## Checked against the real server

A real piece (24 script pieces, written by the server) exported from `video-anim` has the shape of the golden files: `format`, `version` 2, `exportedAt` and `animation` with `title`, `song`, `options`, `design` and `script`. What the real file has and the goldens do not: the `parts` of the user the animation draws (five here, as drafts without text, see the note above) and, on each script piece, the `mode` and `section` the server writes; the goldens' pieces carry `params` where the server leaves them out. A script with `layers` travels with them. Nothing else differs.

