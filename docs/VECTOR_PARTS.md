# Vector parts

A vector part is a part of the user's (see `CUSTOM_PARTS.md`) that `@lab/vector-editor` writes instead of a person: an inline `<svg>`, a small runtime
that applies keyframes in `window.__partSeek(t, beat)`, and the editable model of the animation embedded in the fragment so the part can be opened again.
The server needs nothing new: it receives a manifest and a fragment like any hand-written part (`createDraftFromText`, `approveDraft`, `replacePart`).

## What the fragment carries

`toPart(doc, { name, description })` returns `{ manifest, fragment, bytes }` (both files as text, as the port takes them), or `{ problems }`.

- `<style>`: a wrapper that fills the frame and an `<svg>` of `100vw` by `100vh` fitted by the document's `fit` (`contain` is `meet`, `cover` is `slice`).
- The `<svg>` drawn at 0 s, every node with its `id` (a `<g>` around its markup or its one drawn element). Nothing outside the file is named: the namespace declarations are left out (it is HTML).
- `<script type="application/json" data-vector-model>`: the whole document as JSON (`<` written as `<` so nothing inside can close the script).
  `fromPart({ fragment })` reads it back; a fragment without one is not a vector part, and a model from a newer version is refused.
- `<script>` with the runtime (`RUNTIME_SOURCE`) and a glue of five lines that reads the model, applies `window.__params`, defines `window.__partSeek` and
  draws 0 s.

The runtime is the editor's evaluator written in plain JavaScript. It draws from `t` only (no timers, no clock, no `Math.random`, nothing from outside), and the
editor's canvas runs the same text on its live DOM. `runtime.spec.ts` compares it with `stateAt` at twenty times to 1e-6: what you see is what the server draws.
Each element's own attributes are kept in a `data-vo` attribute the first time the runtime touches it, so a drawing that is already at 0 s can be driven again.

## What a document is made of

A document is a tree of nodes with any number of roots, over one artboard (`viewBox`). The kinds:

| kind | what it is | its own fields |
| --- | --- | --- |
| `group` | children drawn together | - |
| `import` | the cleaned markup of an imported SVG, and children that are handles on its selectable elements | `source`, `tag` |
| `rect` | a rectangle from the node's origin (its top left corner) | `width`, `height`, `rx` |
| `ellipse` | an ellipse whose centre is the node's origin | `width`, `height` |
| `line` | a line from the node's origin to (`x2`, `y2`) | `x2`, `y2` |
| `text` | one line of text with one style; the origin is where the baseline starts, `align` (`start`, `middle`, `end`) is its `text-anchor` | `content`, `font`, `fontSize`, `fontWeight`, `align` |
| `image` | a picture drawn in a `width` × `height` box from the origin | `source` (a `data:` URL), `width`, `height`, `preserve` (`contain`, `cover`, `stretch`) |

Every node has the same transform (`x`, `y`, `scaleX`, `scaleY`, `rotate`, `anchorX`, `anchorY`), `opacity`, and paints. A text's `fill` is its colour. The drawn kinds are drawn by the
editor, not imported: that is why their size and radius can be animated and be parameters. A document written before these kinds existed opens unchanged.

**Several SVGs in one document.** Open › `.svg` over a document that has something asks for a new document or "add to the current". An added SVG is placed at the centre of the
artboard at half its size and its ids are prefixed by the import's (`import-2-logo`), in the tree and in the fragment, so two files that both have `id="path1"` do not collide
(`url(#…)` and `href="#…"` inside it follow). Names in the tree stay the ones the SVG gave.

**Groups.** Ctrl+G wraps the selection in a group where its topmost node was; Ctrl+Shift+G takes the children out keeping where they stand (the group's matrix is composed into
each child's transform; a shear that rotation with a non-uniform scale would make cannot be written and is dropped). A group **with tracks is not ungrouped**: a rotating group is
not three rotating children, and the editor says so.

## What animates

Per node: `x`, `y`, `scaleX`, `scaleY`, `rotate` (about the node's anchor), `opacity`, `fill`, `stroke` and `strokeWidth`, and for the kinds that have them `width`, `height`, `rx` and
`fontSize`, with `linear`, `in`, `out`, `in-out` and
`step` easings (the repository's and the server's formulas). A number goes between keyframes with the earlier one's ease; a `#rrggbb` colour goes channel by channel;
anything else holds. The node's transform is written **after** the element's own `transform` attribute, so an imported SVG is never rewritten.

What does not animate: path data, gradients, filters, masks, clip paths (kept and drawn, not edited), a line's end (`x2`, `y2`), text content (it is a parameter, not a track), and anything an
imported `<style>` sets on fill or stroke (the import lists those elements; a `var(--accent)` paint is applied through the element's `style`, which wins).

## Beat links

A node can link a property to the music, in `node.beat`: per animatable property one link.

| link | what it does |
| --- | --- |
| `pulse { amount, decay }` | adds `amount × (1 − position)^decay` to a number from each beat until the next (`decay` 1–8, default 3; `position` is how far into the beat the time is) |
| `alternate { values: [a, b] }` | takes `a` on even beat numbers and `b` on odd ones (numbers, or two colours for a fill or stroke) |
| `loudness { amount }` | adds `amount × loudness(t)`, the song's loudness (0 to 1) at the time |

Links ride **on top of the tracks** (the link adds to what the keyframes give, or to the static value), are applied after the tracks and the parameters, and **do nothing without a beat**: before the first beat
(`number` −1), in an animated SVG in a browser, in the studio's canvas. The page gives a part its beat as `__partSeek(t, beat)` with `beat = { number, position, … }`, and the loudness through
`window.__motionSong` (`loudness[floor(t / loudness_hop)]`, the slice's offset already applied by the server). The evaluator (`stateAt(doc, t, beat, loudnessAt)`) and the runtime do the same,
and `runtime.spec.ts` compares them with a synthetic beat at twenty times. In a piece the canvas of the Vector tab of `motion-edit` shows them with the beats of the block the part was opened from
(`beatOfSlice` and `loudnessOfSlice` in `@lab/motion-editor` are the twins of the page's beat clock; a spec runs the page's clock against them).

A document whose only motion is a beat link counts as **moving** (`moves`), so a logo that only pulses can be sent. What the server's own check does with such a part (it draws it at two moments) is
in `ESTADO.md`.

## Parameters

A text's content (a drawn text or an imported `<text>`), a node's fill or stroke, a shape's or image's `width` or `height` and a text's `fontSize` can be parameters of the part.
Text and paints go to the manifest as a `string` (with `max_length`, default 40; a paint's description says it is a colour), the sizes as a `number` with the `min` and `max` the person
gives. They are applied from `window.__params` before the first frame: a paint value that is not `#rgb` or `#rrggbb` is ignored, a number is kept inside its limits and a value
that is not a number is ignored. A property that is a parameter has no track, and the editor refuses to give it one (and the other way round).

## Fonts

A text's `font` is `display` or `body`, which the fragment writes as `font-family: var(--display)` / `var(--body)` (the page's own stacks, with the studio's heavy and grotesque
stacks as the fallback where no page defines them: the canvas, a still SVG), one of the six names the server knows (`grotesk`, `heavy`, `mono`, `serif`, `rounded`, `condensed`: system
stacks, copied from `@lab/motion-editor` so the libraries stay independent, the server's `Fonts` is the origin), or any other name, drawn with that family and a generic fallback. A web
font cannot be loaded: the page's CSP allows `font-src data:` only. **Text metrics differ** between the machine you edit on and the server's Chrome (same stacks, possibly different
installed fonts); `text-anchor` does not depend on them, but the width of a text does, so leave room.

## Images

An image node holds its picture as a `data:` URL read from a PNG, JPEG, WebP or SVG file of up to 2 MB (a bigger one is refused; over 300 KB the editor warns that the part will be heavy, see Sizes). It is fitted to half the artboard when it is larger and never enlarged. The CSP allows `img-src data:` only, so nothing is fetched. There are no
effects on pictures; `preserve` crops by the box only.

## What the server checks

The part must draw, must **move** (two moments must not look the same) and cannot declare an `animatable` parameter. `toPart` refuses a document where nothing changes
over time and that has no parameters with `{ problems: ['the part does not move'] }`, before the server does. The server's own `422` is shown as it comes for the rest.

**Text in a part.** The server draws the part with sample words on top and refuses one whose text overlaps them ("the texts … and … overlap at 4.0s: separate them so each one can be read"): a part with text must keep it out of the middle of the frame, or have none (a logo's name can be a separate caption). The example has no text for this reason.

## Sizes

**The server takes 8 MiB of request** for a part sent as text (`maxDraftJSON` in its draft handler, `x-max-body-bytes: 8388608` in the contract; the error names the limit). It was **64 KiB** until
2026-11-11: found on the real server by sending 65 000 bytes (accepted) and 70 000 (`invalid JSON body: http: request body too large`), when a composed part with a 53 KB photo (162 KB) could not be sent;
`docs/server-request-part-draft-size.md` asked for the change and the server made it (commit `2f43a598`). `PUT /part-drafts/{id}` takes 1 MiB. The editor's own caps (2 MB for an imported SVG, 2 MB for a picture) leave
room, but not for everything at once: the SVG is in the fragment twice (as markup and inside the JSON model), and so is a picture's `data:` URL, which base64 makes a third bigger, plus about 12 KB of runtime.

`toPart` returns `bodyBytes` (the request as the server counts it) and `SERVER_BODY_LIMIT`; the send dialog says "the part is about N MB and the server does not take requests over 8 MB" **before** sending,
disables Send and names the cause (a picture counts twice). An import over 2 MB is refused and one over 300 KB warns, as does a picture over 300 KB (the part goes into every page of the script); `bytes` is the fragment's size.

## Outside this repository

`toAnimatedSvg(doc)` is one self-contained `.svg` (drawing, model, runtime and a driver that loops over `duration` on animation frames) that opens in a browser, and
`toSvg(doc, t)` is a still at a time with no script. Neither is for the server.
