# The script dialect: grammar

The code of the Code tab is **valid TypeScript** restricted to this grammar, so Monaco's TypeScript service gives types, errors and completion,
and the editor's own parser (`parse.ts`) reads it for mapping. Anything outside the grammar is reported as `not representable: <what>` at its
line and column and the document does not change. The reference for people is `docs/MOTION_SCRIPT_CODE.md`.

```
File     := Import? Const* Export
Import   := 'import' '{' Ident (',' Ident)* '}' 'from' "'@motion/script'" ';'?
Const    := 'const' Ident '=' Expr ';'?
Export   := 'export' 'default' 'script' '(' Array ( ',' Array )? ')' ';'?
Expr     := String | Number | '-' Number | 'true' | 'false' | Array | Object | Call | Member | Ident
Array    := '[' ( Expr (',' Expr)* ','? )? ']'
Object   := '{' ( Prop (',' Prop)* ','? )? '}'
Prop     := (Ident | String) ':' Expr
Call     := ('piece' | 'layer' | 'item' | 'beat' | 'section' | 'line' | 'kf' | 'parts' '.' Ident) '(' ( Expr (',' Expr)* ','? )? ')'
Member   := (Call | Ident) '.' ('start' | 'end')
```

- Line (`// ...`) and block (`/* ... */`) comments are allowed anywhere.
- `Ident` refers to a top-level `const` defined **before** it is used, or is `song` (`song.end`).
- Strings use single or double quotes and the escapes `\n \r \t \b \f \v \0 \\ \' \" \xNN \uNNNN`.
- `Member` is `section(...).start`, `section(...).end`, `<constant>.start|end` (the constant holds a `section(...)`) and `song.end`.

## What is refused

Each is `not representable: <name>` at its position: arrow function, `function`, template literal, arithmetic (`+ - * / % **`),
comparison and logical operators, conditional (`?:`), unary operator, spread (`...x`), computed key (`[k]: v`), shorthand property
(`{ a }`), method, numeric key, `new`, a call of anything but the calls above, other member access (`.map`), computed member access (`a[0]`),
optional chaining (`?.`), parenthesised expression, another import (a second one, or from a module other than `@motion/script`), and any
other statement.

## The shape of a script

```ts
import { script, piece, parts, beat, section, line, song } from '@motion/script';

const chorus = section('chorus');

export default script([
  piece({
    id: 'p1',
    from: 0,
    to: chorus.start,
    part: parts.glassCard({ title: 'Neon Pulse', count: 3 }),
    mode: 'dark',
    lines: [line(3, { keyword: 'neon' })],
  }),
  piece({
    id: 'p2',
    to: beat(48),
    part: parts.toggle({ label: 'allow', count: 4 }),
    with: [parts.timelineStrip({ marks: '1980|1990|2000' })],
    hit: { word: 'pulse', at: beat(40, 0.5), length: 1 },
  }),
  piece({
    id: 'p3',
    to: song.end,
    part: parts.stamp({ word: 'END' }),
    section: 'outro',
    stage: { background: 'night-sky', characters: [{ character: 'bot', pose: 'wave', x: 30, y: 78, size: 42 }] },
    design: { accent: '#ff00aa', verseStyle: 'karaoke' },
    extra: { x_editor: { colour: 'red' } },
  }),
]);
```

### `piece({...})`

| Key | Meaning |
| --- | --- |
| `id` | Required text, unique in the script. |
| `from` | A time. Required on the first piece; the others start where the one before ends unless they say `from`. |
| `to` | Required time, after the start. |
| `part` | Required: `parts.<camelName>(params?, animate?)`. The part's catalog name is camel-cased (`glass-card` → `glassCard`). The second argument is the parameters that change over the piece (see *Animated parameters*). |
| `mode` | `'dark'` or `'light'`. |
| `section` | A text (the section tag the piece belongs to). |
| `with` | A list of `parts.x(...)` drawn beside the main part (at most three, none repeated: a warning). |
| `lines` | A list of `line(n)`, `line(n, { keyword })` or free lines `{ text, from, to, keyword?, line? }`. |
| `hit` | `{ word, at, length }`, `at` a time. |
| `stage` | `{ background?, characters? }` as the script JSON has it. |
| `design` | The song design's override for this piece: `dark`, `light`, `accent`, `display`, `body`, `verseStyle`, `hitStyle` (camelCase in code; `verse_style` and `hit_style` in the JSON). |
| `extra` | A bag whose keys are unfolded to the piece's top level in the JSON: this is how fields the editor does not know travel through the code. A key that is one of the piece's own is an error. |

Parameters keep their names. A parameter left out is left out of the JSON too (the server applies its default): the mapper never fills one.

### Times

A time is one of:

- a **number**: seconds, kept to three decimals;
- `beat(n)`: the start of beat `n` as the song numbers its beats (`beats[n - beatBase]`); `beat(n, f)` goes `f` (from 0 up to, not including, 1)
  of the way to the next beat;
- `section(tag)` or `section(tag, k)` followed by `.start` or `.end`: the `k`-th section (from 1, the first by default) whose tag is `tag`.
  Tags are the song map's tags in lowercase;
- `song.end`: the song's duration.

### Animated parameters

The second argument of a part's call is an object from parameter names to lists of keyframes, and it works the same for the main part and
for each of `with`:

```ts
parts.counter({ from: 0 }, { from: [kf(0, 0, 'in'), kf(beat(8), 1000, 'out'), kf(song.end, 100)] })
parts.pulseRing(undefined, { weight: [kf(0, 1), kf(2, 3)] })   // `undefined`: no parameters of its own
```

`kf(t, value, ease?)` is the value of the parameter at second `t` **of its piece** (a number is seconds from the piece's start; `beat(n)`,
`section(...)` and `song.end` are the song's times, and the mapper takes where the piece starts away). `ease` is how the value goes from this
keyframe to the **next one**: `'linear'` (also when left out), `'in'`, `'out'`, `'in-out'` or `'step'`. Only the parameters the catalog marks
`animatable` are accepted, each with values of its own type and within its limits; the times are inside the piece and increase. A server whose
catalog does not say `animate` takes none of this: the declarations leave `kf` and the second argument out, and the mapper says so.

### Layers

The second argument of `script` is the list of layers, each a lane of items drawn over every piece they touch (the last layer is on top):

```ts
export default script([
  piece({ ... }),
], [
  layer('strip', [
    item(parts.timelineStrip({ marks: '1980|1990' }), beat(8), section('chorus').start),
    item(parts.pulseRing(undefined, { weight: [kf(0, 1), kf(4, 3, 'out')] }), 40, song.end),
  ]),
  layer('empty', []),
]);
```

`layer(id, items)`: `id` is lower case letters, digits and dashes, up to 24 characters, unique. `item(part, from, to)`: a `parts.x(params?, animate?)`
drawn from `from` to `to`, both song times (a number of seconds, `beat(n)`, `section(...).start|end` or `song.end`); its keyframes are in seconds **from the
item's own start** (an anchor is the song's time and the mapper takes the item's start away). The mapper reports, positioned on the item, what the server
would refuse in the words it uses: items of a lane that overlap or lie outside the song, a part drawn twice on a page (the main part, an extra and the items
that touch the piece), more than eight parts on a page, more than 4 layers or 32 items in a layer. A server whose catalog does not say `layers` takes none
of this: the declarations leave `layer`, `item` and the second argument out, and the mapper says so. An empty list leaves no `layers` in the script.

### Generation (script → code)

The generated code is canonical: pieces in the order of the script, each key of a piece on its own line in the order of the table above,
two-space indentation, single quotes, trailing commas. A time that falls (within a millisecond) on the end of the song, the start of a
section, the end of a section or the start of a beat is written as `song.end`, `section('tag'[, k]).start|end` or `beat(n)` (in that
order of preference); any other as seconds. `from` is written on the first piece and wherever a piece does not start where the one before
ended. Unknown piece fields go under `extra`; keyframes are the second argument of their part, a time that lands on an anchor is written as it in the piece's own seconds (never `0`, which stays `0`), and `ease` is written only where the script has it. Layers are the second argument, after the pieces, one item per line, each time written as an anchor where it lands on the song. The import line lists only the names used. Mapping what was generated gives back a script equal to
the one generated from.
