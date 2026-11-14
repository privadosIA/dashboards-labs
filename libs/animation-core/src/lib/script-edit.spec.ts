import { CATALOG } from '../testing/catalog';
import type { Script, ScriptPiece } from './model';
import { BLANK_PART, moveExtra, addExtra, emptyPiece, isEmptyPiece, covers, extraChoices, hitWords, partsOf, removeExtra, setExtraParams, setExtraPart, setPieceDesign, moveBlock, moveCut, moveEnd, moveStart, pieceOf, setHit, setKeyword, setMode, setPart, setParams, setStage, wordsOf } from './script-edit';

const piece = (id: string, start: number, end: number, extra: Partial<ScriptPiece> = {}): ScriptPiece => ({ id, start, end, part: 'toggle', params: { label: 'allow', on: true }, ...extra });
const script = (): Script => ({
  version: 1,
  pieces: [
    piece('p1', 0, 10, { lines: [{ line: 0, text: 'Walking through, the quiet town!', start: 0, end: 5, keyword: 'quiet' }] }),
    piece('p2', 10, 30),
    piece('p3', 30, 48),
  ],
});

describe('moving a cut', () => {
  it('moves the end of a piece and the start of the next one together, so the song stays covered', () => {
    const next = moveEnd(script(), 0, 12);
    expect(next.pieces.map((p) => [p.start, p.end])).toEqual([[0, 12], [12, 30], [30, 48]]);
    expect(covers(next, 48)).toBe(true);
  });

  it('moving a start moves the end of the piece before', () => {
    const next = moveStart(script(), 2, 25);
    expect(next.pieces.map((p) => [p.start, p.end])).toEqual([[0, 10], [10, 25], [25, 48]]);
    expect(covers(next, 48)).toBe(true);
  });

  it('keeps a piece at least half a second long on both sides of the cut', () => {
    expect(moveCut(script(), 0, -5).pieces[0].end).toBe(0.5);
    expect(moveCut(script(), 0, 99).pieces[1].start).toBe(29.5);
    expect(moveCut(script(), 1, 99).pieces[2].start).toBe(47.5);
    expect(moveCut(script(), 1, 5).pieces[1].end).toBe(10.5);
  });

  it('does not move the song\'s own start or end, nor a number that is not one', () => {
    const s = script();
    expect(moveStart(s, 0, 3)).toBe(s);
    expect(moveEnd(s, 2, 40)).toBe(s);
    expect(moveCut(s, 0, NaN)).toBe(s);
    expect(moveCut(s, 7, 1)).toBe(s);
  });

  it('leaves the script alone when the cut is already there, and does not change the one it was given', () => {
    const s = script();
    expect(moveCut(s, 0, 10)).toBe(s);
    moveCut(s, 0, 12);
    expect(s.pieces[0].end).toBe(10);
  });

  it('rounds to hundredths', () => {
    expect(moveCut(script(), 0, 10.123456).pieces[0].end).toBe(10.12);
  });
});

describe('moving a block', () => {
  it('shifts both of its cuts by the same amount and keeps its length', () => {
    const next = moveBlock(script(), 1, 14);
    expect(next.pieces.map((p) => [p.start, p.end])).toEqual([[0, 14], [14, 34], [34, 48]]);
    expect(covers(next, 48)).toBe(true);
  });

  it('is cut short where a neighbour would be left under half a second', () => {
    const next = moveBlock(script(), 1, 40);
    expect(next.pieces.map((p) => [p.start, p.end])).toEqual([[0, 27.5], [27.5, 47.5], [47.5, 48]]);
  });

  it('moves the only cut the first and the last piece have, and never the song\'s own ends', () => {
    const first = moveBlock(script(), 0, 4);
    expect(first.pieces.map((p) => [p.start, p.end])).toEqual([[0, 14], [14, 30], [30, 48]]);
    const last = moveBlock(script(), 2, 20);
    expect(last.pieces.map((p) => [p.start, p.end])).toEqual([[0, 10], [10, 20], [20, 48]]);
  });

  it('leaves the script alone for a lone piece, a piece that is not there, and a move to where it already is', () => {
    const lone: Script = { version: 1, pieces: [piece('p1', 0, 48)] };
    expect(moveBlock(lone, 0, 5)).toBe(lone);
    const s = script();
    expect(moveBlock(s, 9, 5)).toBe(s);
    expect(moveBlock(s, 1, 10)).toBe(s);
  });
});

describe('covers', () => {
  it('is true for no gap, no overlap, from 0 to the end of the song', () => {
    expect(covers(script(), 48)).toBe(true);
  });

  it('is false for a gap, an overlap, a short song or a late start', () => {
    const s = script();
    expect(covers({ ...s, pieces: [s.pieces[0], { ...s.pieces[1], start: 11 }, s.pieces[2]] }, 48)).toBe(false);
    expect(covers({ ...s, pieces: [s.pieces[0], { ...s.pieces[1], start: 9 }, s.pieces[2]] }, 48)).toBe(false);
    expect(covers(s, 60)).toBe(false);
    expect(covers({ ...s, pieces: [{ ...s.pieces[0], start: 1 }, ...s.pieces.slice(1)] }, 48)).toBe(false);
    expect(covers({ version: 1, pieces: [] }, 48)).toBe(false);
  });
});

describe('the part of a piece', () => {
  it('changes with the new part\'s defaults, because the old parameters belong to the old part', () => {
    const next = setPart(script(), 1, 'parallax-cards', CATALOG);
    expect(next.pieces[1]).toMatchObject({ part: 'parallax-cards', params: { count: 3, align: 'left' } });
    expect(next.pieces[0]).toEqual(script().pieces[0]);
    expect(next.pieces[2]).toEqual(script().pieces[2]);
  });

  it('is left alone for the same part or one that is not in the catalog', () => {
    const s = script();
    expect(setPart(s, 1, 'toggle', CATALOG)).toBe(s);
    expect(setPart(s, 1, 'nope', CATALOG)).toBe(s);
  });

  it('takes the parameters it is given', () => {
    expect(setParams(script(), 0, { label: 'hola' }).pieces[0].params).toEqual({ label: 'hola' });
  });
});

describe('the mode of a piece', () => {
  it('is set, and taken away when none is given', () => {
    const s = script();
    expect(setMode(s, 0, 'light').pieces[0].mode).toBe('light');
    const withMode = setMode(s, 0, 'light');
    expect('mode' in setMode(withMode, 0, undefined).pieces[0]).toBe(false);
    expect(setMode(withMode, 0, 'light')).toBe(withMode);
  });
});

describe('the keyword of a line', () => {
  it('reads the words of a line without the marks around them', () => {
    expect(wordsOf({ text: 'Walking through, the quiet town!' })).toEqual(['Walking', 'through', 'the', 'quiet', 'town']);
    expect(wordsOf({})).toEqual([]);
  });

  it('is set to a word of the line and taken away when empty', () => {
    const s = setKeyword(script(), 0, 0, 'town');
    expect(s.pieces[0].lines![0].keyword).toBe('town');
    expect('keyword' in setKeyword(s, 0, 0, '').pieces[0].lines![0]).toBe(false);
  });

  it('does not accept a word that is not in the line, nor a line that is not there', () => {
    const s = script();
    expect(setKeyword(s, 0, 0, 'moon')).toBe(s);
    expect(setKeyword(s, 0, 5, 'town')).toBe(s);
    expect(setKeyword(s, 1, 0, 'town')).toBe(s);
  });
});

describe('the word hit of a piece', () => {
  it('is set inside the piece and taken away with null', () => {
    const s = setHit(script(), 0, { word: 'quiet', at: 3, length: 0.8 });
    expect(s.pieces[0].hit).toEqual({ word: 'quiet', at: 3, length: 0.8 });
    expect('hit' in setHit(s, 0, null).pieces[0]).toBe(false);
  });

  it('is kept inside the piece, whatever time and length are asked', () => {
    const early = setHit(script(), 1, { word: 'x', at: 2, length: 1 });
    expect(early.pieces[1].hit!.at).toBe(10);
    const late = setHit(script(), 1, { word: 'x', at: 99, length: 5 });
    expect(late.pieces[1].hit!.at).toBe(29.5);
    expect(late.pieces[1].hit!.at + late.pieces[1].hit!.length).toBeLessThanOrEqual(30);
    expect(setHit(script(), 1, { word: 'x', at: 12, length: 0 }).pieces[1].hit!.length).toBe(0.1);
  });

  it('can name the words of the lines of its piece, once each', () => {
    const p = piece('p', 0, 10, { lines: [{ text: 'the quiet town' }, { text: 'quiet the night' }] });
    expect(hitWords(p)).toEqual(['the', 'quiet', 'town', 'night']);
    expect(hitWords(piece('q', 0, 1))).toEqual([]);
  });
});

describe('the stage of a piece', () => {
  it('is set and taken away with null', () => {
    const stage = { background: 'stage', characters: [{ character: 'bot', x: 50, y: 85, size: 40 }] };
    const s = setStage(script(), 1, stage);
    expect(s.pieces[1].stage).toEqual(stage);
    expect('stage' in setStage(s, 1, null).pieces[1]).toBe(false);
    expect(setStage(script(), 9, stage).pieces).toHaveLength(3);
  });
});

describe('pieceOf', () => {
  it('names the piece a server reason starts with', () => {
    expect(pieceOf('piece p2: part "nope" is not in the catalog')).toBe('p2');
    expect(pieceOf('piece "p1" (#1): the part "x" is not in the catalog')).toBe('p1');
    expect(pieceOf('Piece p10: it ends before it starts')).toBe('p10');
  });

  it('is nothing for another reason', () => {
    expect(pieceOf('the pieces end at 40 seconds and the song at 48')).toBeNull();
    expect(pieceOf('')).toBeNull();
  });
});

describe('the extra parts of a piece', () => {
  const withStrip = () => addExtra(script(), 1, 'counter', CATALOG);

  it('adds an extra with that part\'s defaults and keeps the main part and everything else', () => {
    const next = withStrip();
    expect(next.pieces[1].with).toEqual([{ part: 'counter', params: { to: 100, speed: 1.5 } }]);
    expect(next.pieces[1].part).toBe('toggle');
    expect(next.pieces[0]).toBe(script().pieces[0] ? next.pieces[0] : null);
  });

  it('does not add the main part, a part twice, a part the catalog lacks, or a fourth extra', () => {
    const one = withStrip();
    expect(addExtra(one, 1, 'toggle', CATALOG)).toBe(one);
    expect(addExtra(one, 1, 'counter', CATALOG)).toBe(one);
    expect(addExtra(one, 1, 'nope', CATALOG)).toBe(one);
    let full = one;
    for (const name of ['parallax-cards', 'wire-sphere']) full = addExtra(full, 1, name, CATALOG);
    expect(full.pieces[1].with).toHaveLength(3);
    expect(addExtra(full, 1, 'blank', CATALOG)).toBe(full);
  });

  it('offers the parts the piece does not draw yet, letting the one being changed stay', () => {
    const one = withStrip();
    const names = (except?: string) => extraChoices(one.pieces[1], CATALOG, except);
    expect(names()).not.toContain('toggle');
    expect(names()).not.toContain('counter');
    expect(names('counter')).toContain('counter');
    expect(partsOf(one.pieces[1])).toEqual(['toggle', 'counter']);
  });

  it('changes the part of an extra to another one with its defaults, and the parameters of an extra', () => {
    const changed = setExtraPart(withStrip(), 1, 0, 'wire-sphere', CATALOG);
    expect(changed.pieces[1].with).toEqual([{ part: 'wire-sphere', params: { detail: 12 } }]);
    expect(setExtraPart(withStrip(), 1, 0, 'toggle', CATALOG).pieces[1].with![0].part).toBe('counter');
    expect(setExtraParams(withStrip(), 1, 0, { to: 5 }).pieces[1].with).toEqual([{ part: 'counter', params: { to: 5 } }]);
  });

  it('removes an extra, and the field itself when none is left', () => {
    const next = removeExtra(withStrip(), 1, 0);
    expect('with' in next.pieces[1]).toBe(false);
    expect(removeExtra(next, 1, 0)).toBe(next);
  });

  it('refuses a main part that is among the extras', () => {
    const one = withStrip();
    expect(setPart(one, 1, 'counter', CATALOG)).toBe(one);
  });
});

describe('the design of a piece', () => {
  it('keeps only the fields that have a value, and none left is the song\'s design', () => {
    const own = setPieceDesign(script(), 2, { accent: '#00ff00', dark: '', verse_style: 'glow' });
    expect(own.pieces[2].design).toEqual({ accent: '#00ff00', verse_style: 'glow' });
    expect('design' in setPieceDesign(own, 2, {}).pieces[2]).toBe(false);
    expect('design' in setPieceDesign(own, 2, null).pieces[2]).toBe(false);
  });

  it('leaves the other pieces alone and a missing piece as it is', () => {
    const base = script();
    expect(setPieceDesign(base, 9, { accent: '#fff' })).toBe(base);
    expect(setPieceDesign(base, 0, { accent: '#00ff00' }).pieces[1]).toBe(base.pieces[1] ? setPieceDesign(base, 0, { accent: '#00ff00' }).pieces[1] : null);
  });
});

// ---- lines, split, remove, swap -----------------------------------------------------------------------------------------------------------

import { addLine, availableLines, hitWordsIn, lineText, newPieceId, removeLine, removePiece, setLineKeyword, setLineText, setLineTimes, splitPiece, swapContents, wordsOfText } from './script-edit';

const MAP = {
  words: [
    { text: 'Hello,', start: 31, end: 31.4, line: 0 },
    { text: 'quiet', start: 31.5, end: 32, line: 0 },
    { text: 'town', start: 32, end: 32.6, line: 0 },
    { text: 'Lights', start: 35, end: 35.5, line: 1 },
    { text: 'down', start: 35.5, end: 36, line: 1 },
  ],
};

const piece4 = (extra: Partial<ScriptPiece> = {}): ScriptPiece => ({ id: 'p4', start: 30, end: 38, part: 'toggle', params: { label: 'x' }, mode: 'light', with: [{ part: 'counter' }], lines: [{ line: 0 }, { line: 1, keyword: 'Lights' }], hit: { word: 'quiet', at: 31.5, length: 1 }, ...extra });
const doc = (...pieces: ScriptPiece[]): Script => ({ version: 1, pieces });
const filler = (id: string, start: number, end: number): ScriptPiece => ({ id, start, end, part: 'blank' });

describe('lines', () => {
  it('reads the text of a line from the song map, or its own', () => {
    expect(lineText({ line: 0 }, MAP)).toBe('Hello, quiet town');
    expect(lineText({ text: 'free', start: 1, end: 2 }, MAP)).toBe('free');
    expect(wordsOfText('Hello,   quiet! town')).toEqual(['Hello', 'quiet', 'town']);
  });

  it('lists the lines of the song map that fall inside a piece and it does not have yet', () => {
    const s = doc(piece4({ lines: [{ line: 0 }] }));
    expect(availableLines(s, 0, MAP)).toEqual([{ line: 1, text: 'Lights down', start: 35 }]);
  });

  it('adds a line from the song map or a free one, in time order, and refuses a free one with no text or no length', () => {
    const s = doc(piece4({ lines: [{ line: 1 }] }));
    const a = addLine(s, 0, { line: 0 }, MAP);
    expect(a.pieces[0].lines).toEqual([{ line: 0 }, { line: 1 }]);
    const b = addLine(s, 0, { text: 'My words', start: 33, end: 34.5 }, MAP);
    expect(b.pieces[0].lines!.map((l) => l.text ?? l.line)).toEqual(['My words', 1]);
    expect(addLine(s, 0, { text: '  ', start: 1, end: 2 }, MAP)).toBe(s);
    expect(addLine(s, 0, { text: 'x', start: 2, end: 2 }, MAP)).toBe(s);
  });

  it('edits the text of a line: it becomes a free line with the same times, and keeps the keyword only while it is a word', () => {
    const s = doc(piece4());
    const e = setLineText(s, 0, 1, 'Lights  out', MAP);
    expect(e.pieces[0].lines![1]).toEqual({ text: 'Lights out', start: 35, end: 36, keyword: 'Lights' });
    const dropped = setLineText(s, 0, 1, 'No more', MAP);
    expect(dropped.pieces[0].lines![1]).toEqual({ text: 'No more', start: 35, end: 36 });
    expect(setLineText(s, 0, 1, '   ', MAP)).toBe(s);
  });

  it('drops the hit when no line has its word any more', () => {
    const s = doc(piece4());
    expect(setLineText(s, 0, 0, 'Something else', MAP).pieces[0].hit).toBeUndefined();
    expect(setLineText(s, 0, 0, 'A quiet place', MAP).pieces[0].hit).toEqual({ word: 'quiet', at: 31.5, length: 1 });
  });

  it('removes a line, and the hit with it when it was its only word', () => {
    const s = doc(piece4());
    const r = removeLine(s, 0, 0, MAP);
    expect(r.pieces[0].lines).toEqual([{ line: 1, keyword: 'Lights' }]);
    expect(r.pieces[0].hit).toBeUndefined();
    const none = removeLine(removeLine(s, 0, 0, MAP), 0, 0, MAP);
    expect(none.pieces[0].lines).toBeUndefined();
  });

  it('changes when a line is on screen, turning it into a free line', () => {
    const t = setLineTimes(doc(piece4()), 0, 0, 31, 33.5, MAP);
    expect(t.pieces[0].lines![0]).toEqual({ text: 'Hello, quiet town', start: 31, end: 33.5 });
    expect(setLineTimes(doc(piece4()), 0, 0, 33, 33, MAP).pieces[0].lines![0]).toEqual({ line: 0 });
  });

  it('sets the keyword from the words the line really has, also for a line of the song map', () => {
    const s = doc(piece4({ lines: [{ line: 0 }] }));
    expect(setLineKeyword(s, 0, 0, 'town', MAP).pieces[0].lines![0]).toEqual({ line: 0, keyword: 'town' });
    expect(setLineKeyword(s, 0, 0, 'nope', MAP)).toBe(s);
    expect(setLineKeyword(doc(piece4()), 0, 1, '', MAP).pieces[0].lines![1]).toEqual({ line: 1 });
    expect(hitWordsIn(piece4(), MAP)).toEqual(['Hello', 'quiet', 'town', 'Lights', 'down']);
  });
});

describe('splitPiece', () => {
  it('splits at the playhead: the first line stays, the second goes to the new piece, which copies the part and parameters', () => {
    const s = splitPiece(doc(filler('p1', 0, 30), piece4(), filler('p5', 38, 50)), 1, 34, 'p6', MAP);
    expect(s.pieces.map((p) => [p.id, p.start, p.end])).toEqual([['p1', 0, 30], ['p4', 30, 34], ['p6', 34, 38], ['p5', 38, 50]]);
    expect(s.pieces[1].lines).toEqual([{ line: 0 }]);
    expect(s.pieces[2].lines).toEqual([{ line: 1, keyword: 'Lights' }]);
    expect(s.pieces[2]).toMatchObject({ part: 'toggle', params: { label: 'x' }, mode: 'light', with: [{ part: 'counter' }] });
    expect(s.pieces[1].hit).toEqual({ word: 'quiet', at: 31.5, length: 1 });
    expect(s.pieces[2].hit).toBeUndefined();
  });

  it('sends the hit to the half that holds its time', () => {
    const s = splitPiece(doc(piece4({ hit: { word: 'Lights', at: 35, length: 0.5 } })), 0, 34, 'p6', MAP);
    expect(s.pieces[0].hit).toBeUndefined();
    expect(s.pieces[1].hit).toEqual({ word: 'Lights', at: 35, length: 0.5 });
  });

  it('refuses a half shorter than the minimum, an id that is taken and a piece that is not there', () => {
    const s = doc(piece4());
    expect(splitPiece(s, 0, 30.2, 'p6', MAP)).toBe(s);
    expect(splitPiece(s, 0, 37.8, 'p6', MAP)).toBe(s);
    expect(splitPiece(s, 0, 34, 'p4', MAP)).toBe(s);
    expect(splitPiece(s, 3, 34, 'p6', MAP)).toBe(s);
  });

  it('does not share the extras of the copy with the original', () => {
    const s = splitPiece(doc(piece4()), 0, 34, 'p6', MAP);
    expect(s.pieces[1].with).not.toBe(s.pieces[0].with);
  });

  it('gives a new id nobody uses', () => {
    expect(newPieceId(doc(filler('p1', 0, 5), filler('p3', 5, 9)))).toBe('p3' === 'p3' ? 'p4' : 'p4');
    expect(newPieceId(doc(filler('p1', 0, 5)))).toBe('p2');
  });
});

describe('removePiece', () => {
  const three = (): Script => doc(filler('p1', 0, 20), filler('p2', 20, 25), filler('p3', 25, 40));

  it('gives the time to the previous piece (the script still covers the song)', () => {
    const r = removePiece(three(), 1);
    expect(r.pieces.map((p) => [p.id, p.start, p.end])).toEqual([['p1', 0, 25], ['p3', 25, 40]]);
  });

  it('gives the time of the first piece to the next one, and of the last to the one before', () => {
    expect(removePiece(three(), 0).pieces.map((p) => [p.id, p.start, p.end])).toEqual([['p2', 0, 25], ['p3', 25, 40]]);
    expect(removePiece(three(), 2).pieces.map((p) => [p.id, p.start, p.end])).toEqual([['p1', 0, 20], ['p2', 20, 40]]);
  });

  it('does not remove the last remaining piece', () => {
    const s = doc(filler('p1', 0, 40));
    expect(removePiece(s, 0)).toBe(s);
  });
});

describe('swapContents', () => {
  it('exchanges the part, parameters, extras, stage and design and keeps ids, times, sections, lines and hits', () => {
    const a: ScriptPiece = { id: 'p2', start: 5, end: 10, section: 'verse', part: 'toggle', params: { label: 'a' }, lines: [{ line: 0 }], hit: { word: 'quiet', at: 6, length: 1 }, with: [{ part: 'counter' }] };
    const b: ScriptPiece = { id: 'p5', start: 20, end: 30, section: 'chorus', part: 'stamp', mode: 'light', design: { accent: '#ff0000' }, lines: [{ line: 1 }] };
    const s = swapContents(doc(a, b), 0, 1);
    expect(s.pieces[0]).toEqual({ id: 'p2', start: 5, end: 10, section: 'verse', part: 'stamp', mode: 'light', design: { accent: '#ff0000' }, lines: [{ line: 0 }], hit: { word: 'quiet', at: 6, length: 1 } });
    expect(s.pieces[1]).toEqual({ id: 'p5', start: 20, end: 30, section: 'chorus', part: 'toggle', params: { label: 'a' }, with: [{ part: 'counter' }], lines: [{ line: 1 }] });
  });

  it('leaves the script alone for the same piece twice or one that is not there', () => {
    const s = doc(filler('p1', 0, 5), filler('p2', 5, 9));
    expect(swapContents(s, 0, 0)).toBe(s);
    expect(swapContents(s, 0, 7)).toBe(s);
  });
});

describe('emptying a piece', () => {
  it('leaves the slot: same id, times and section, the blank part and nothing else', () => {
    const s: Script = { version: 1, pieces: [piece('p1', 0, 10, { section: 'verse', mode: 'light', with: [{ part: 'counter' }], lines: [{ line: 0 }], hit: { word: 'go', at: 2, length: 1 }, stage: { background: 'x' } as never }), piece('p2', 10, 30)] };
    const next = emptyPiece(s, 0, CATALOG);
    expect(next.pieces[0]).toEqual({ id: 'p1', start: 0, end: 10, section: 'verse', part: BLANK_PART, params: {} });
    expect(next.pieces[1]).toBe(s.pieces[1]);
    expect(covers(next, 30)).toBe(true);
    expect(isEmptyPiece(next.pieces[0])).toBe(true);
  });

  it('leaves the script alone for a piece that is already empty, one that is not there, and a catalog with no blank part', () => {
    const once = emptyPiece(script(), 1, CATALOG);
    expect(emptyPiece(once, 1, CATALOG)).toBe(once);
    const s = script();
    expect(emptyPiece(s, 9, CATALOG)).toBe(s);
    expect(emptyPiece(s, 0, { ...CATALOG, parts: CATALOG.parts.filter((p) => p.name !== BLANK_PART) })).toBe(s);
  });
});

describe('reordering extras', () => {
  const three = (): Script => ({ version: 1, pieces: [piece('p1', 0, 10, { with: [{ part: 'a' }, { part: 'b' }, { part: 'c' }] })] });
  const order = (s: Script) => s.pieces[0].with!.map((x) => x.part);

  it('moves an extra to another position and keeps the rest in order', () => {
    expect(order(moveExtra(three(), 0, 2, 0))).toEqual(['c', 'a', 'b']);
    expect(order(moveExtra(three(), 0, 0, 2))).toEqual(['b', 'c', 'a']);
  });

  it('leaves the script alone for the same position, one out of range, or an extra that is not there', () => {
    const s = three();
    expect(moveExtra(s, 0, 1, 1)).toBe(s);
    expect(moveExtra(s, 0, 1, 3)).toBe(s);
    expect(moveExtra(s, 0, 5, 0)).toBe(s);
    expect(moveExtra(s, 4, 0, 1)).toBe(s);
  });
});
