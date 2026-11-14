# Writing a script as code (Motion Edit, Code tab)

The editor's **Code** tab shows the same script as the **Visual** tab, written as typed code. Both are views of one document: edit either and
the other follows. The code is never saved or sent anywhere: what is saved is the script JSON the code maps to.

This page is the reference for the dialect. The exact grammar is in
[`libs/motion-editor/src/lib/code/grammar.md`](../libs/motion-editor/src/lib/code/grammar.md).

## Why code

- A part is a typed function: a wrong part name, a wrong parameter name, a value of the wrong type or an option that does not exist is red
  before you save, and `parts.` completes with the catalog and its descriptions.
- Times can be musical: `beat(48)`, `section('chorus', 2).start`, `song.end`.
- Constants and comments make a long script easier to read.

## A script

```ts
import { script, piece, parts, beat, section, line, song } from '@motion/script';

const chorus = section('chorus');

export default script([
  piece({
    id: 'p1',
    from: 0,
    to: chorus.start,
    part: parts.glassCard({ title: 'Neon Pulse', count: 3 }),
    lines: [line(3, { keyword: 'neon' })],
  }),
  piece({
    id: 'p2',
    to: song.end,
    part: parts.toggle({ label: 'allow', count: 4 }),
    with: [parts.timelineStrip({ marks: '1980|1990|2000' })],
    hit: { word: 'pulse', at: beat(40, 0.5), length: 1 },
  }),
]);
```

Each `piece({...})` is one block of the timeline. The first piece says where it starts with `from`; each of the others starts where the
previous one ends, unless it says `from` too (which leaves a gap, and the editor warns that the song is not covered).

## Pieces

| Key | What it is |
| --- | --- |
| `id` | The piece's name; no two pieces share one. |
| `from`, `to` | When it starts and ends (see *Times*). |
| `part` | `parts.<name>({ ...parameters })`. The name is the catalog's, camel-cased: `glass-card` is `glassCard`. |
| `mode`, `section` | `'dark'` or `'light'`; the section tag the piece belongs to. |
| `with` | Up to three more parts drawn beside the main one. |
| `lines` | The lyrics shown: `line(n)` for a line of the song (with `{ keyword: 'word' }` to highlight a word), or `{ text, from, to }` for a text of your own. |
| `hit` | A word that is hit: `{ word, at, length }`. |
| `stage` | The background and characters of the illustrated style. |
| `design` | Colours and styles for this piece alone: `accent`, `verseStyle`, `hitStyle`, ... |
| `extra` | Fields the editor does not know. They are kept as they are and written back to the script. |

Parameters you leave out are left out of the script too: the server fills in its defaults.

## Times

| Write | Means |
| --- | --- |
| `12.5` | Seconds (three decimals). |
| `beat(48)` | The start of beat 48, as the song numbers its beats. |
| `beat(40, 0.5)` | Half way from beat 40 to the next. |
| `section('chorus').start` | The start of the first chorus; `.end` is where it ends. |
| `section('chorus', 2).start` | The start of the second chorus. |
| `song.end` | The end of the song. |

Section tags are written in lowercase, whatever case the song map has.

## Animated parameters (keyframes)

Some parameters can change over the piece (the catalog marks them *animatable*, and the server says it takes keyframes). They go in the
**second argument** of the part's call, for the main part and for each extra:

```ts
piece({
  id: 'p4',
  to: section('chorus').start,
  part: parts.counter({ from: 0 }, { from: [kf(0, 0, 'in'), kf(beat(8), 1000, 'out'), kf(8, 100)], step: [kf(0, 1)] }),
  with: [parts.pulseRing(undefined, { weight: [kf(0, 1), kf(2, 3, 'step')] })],
}),
```

- `kf(t, value, ease?)`: the value of the parameter at second `t` of **the piece** (`kf(0, ...)` is the piece's start). An anchor such as `beat(8)` or
  `section('chorus').start` is the song's time: the editor takes the piece's start away.
- `ease` is how the value goes **to the next keyframe**: `'linear'` (the default), `'in'` (starts slowly), `'out'` (ends slowly), `'in-out'`, or
  `'step'` (holds until the next one). Text, switches and options always hold their value until the next keyframe.
- The times are inside the piece and each is after the one before; a whole-number parameter takes whole values; every value is within the
  parameter's limits. `parts.pulseRing(undefined, {...})` says the part has no parameters of its own: the keyframes are the second argument.
- Only animatable parameters are accepted (TypeScript marks any other name), with values of their own type (an option is one of its list).
- A server that does not take keyframes has no `kf` and no second argument: the mapper says "this server does not take animated parameters".

## Layers

When the server takes layers (it says `layers` in its catalog), the second argument of `script` is the list of layers: lanes of parts that are drawn **across
the cuts**, over every piece they touch, the last layer on top.

```ts
export default script([
  piece({ id: 'p1', from: 0, to: song.end, part: parts.glassCard({ title: 'Neon Pulse' }) }),
], [
  layer('strip', [
    item(parts.timelineStrip({ marks: '1980|1990' }), beat(8), section('chorus').start),
    item(parts.pulseRing(undefined, { weight: [kf(0, 1), kf(4, 3, 'out')] }), 40, song.end),
  ]),
]);
```

- `layer(id, items)`: the id is lower case letters, digits and dashes, up to 24 characters, and no two layers share one; up to 4 layers and 32 items in each.
- `item(part, from, to)`: the part is `parts.<name>(params?, keyframes?)` as in a piece; `from` and `to` are song times (seconds, `beat(n)`, `section(...)`, `song.end`).
  The items of a layer follow one another in order and never overlap.
- The keyframes of an item are in seconds from **the item's own start** (`kf(0, ...)` is where the item starts); they must be inside the item.
- A page draws a part once: an item cannot use a part that a piece it touches already draws (as its main part, an extra or another item), and a page draws at most eight parts.
- What the server would refuse is marked on the item, in the server's own words (they are not translated). A server without layers has no `layer` or `item` in the declarations.
- A layer or item field the dialect does not know cannot be written (the server has none today): editing in code replaces `layers`, so such a field would be lost.

## What is checked, and by whom

- **TypeScript** (red squiggles as you type): part names, parameter names, primitive types, the options of a choice, the section tags and
  line numbers of the song, the names of backgrounds, characters, poses and styles.
- **The editor's mapper** (marks in the same gutter, a few hundred milliseconds after you stop typing): ranges (`count` at most 5), text
  lengths, whole numbers, beats that exist, sections and lines that exist, the first piece having `from`, a piece ending after it starts,
  ids not repeated, `extra` not holding a key the piece has. TypeScript cannot express ranges or lengths, so these come from the mapper.
- **The editor's warnings**: the same ones as in the visual editor (the script does not cover the song, a part not drawn at the level,
  more than three extras...). They never stop a script from being applied.

## What the code cannot be

The dialect is declarative on purpose: **no** loops, functions, arrow functions, template strings, arithmetic, spreads, computed keys, other
imports or statements. `pieces.map(p => piece(p))` is reported as `not representable: arrow function` at its position. Constants (`const x = ...`)
are allowed and are replaced where they are used; define them before using them.

## The two views

- Entering **Code** shows the code generated from the document, unless the code you already had maps to the same document (then your
  comments and formatting stay).
- While the code has errors the document does not change: the timeline and the inspector are paused with a notice, and the preview keeps
  showing the last good document. When the code maps with no errors (300 ms after the last key) the document is updated as one step of the history.
- A change made in **Visual** while Code is hidden makes the code regenerate when you come back: comments and formatting you had written are
  replaced (the editor tells you once per session).
- Selecting a block highlights its `piece(...)`; putting the cursor in a `piece(...)` selects its block.
- **Undo**: with the cursor in the code, Ctrl+Z undoes text; anywhere else it undoes the document.
- **Save** with errors in the code asks first, and sends the last document that mapped.
