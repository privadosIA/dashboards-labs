import { CATALOG } from '../../animation/fixtures';
import type { Script, ScriptPiece } from '@lab/animation-core';
import { applyRow, keywordKey, toRowModel, unchanged } from './row-model';

const piece = (id: string, start: number, end: number, extra: Partial<ScriptPiece> = {}): ScriptPiece => ({ id, start, end, part: 'toggle', params: { label: 'allow', on: true }, ...extra });
const script = (): Script => ({
  version: 1,
  pieces: [piece('p1', 0, 10, { lines: [{ line: 0, text: 'the quiet town', keyword: 'quiet' }, { line: 1, text: 'lights come down' }] }), piece('p2', 10, 30, { mode: 'light' }), piece('p3', 30, 48)],
});

describe('a piece as the fields of its form', () => {
  it('has its part, mode (the design\'s when it has none), times, a keyword for each line and the hit', () => {
    expect(toRowModel(script().pieces[0], 'dark')).toEqual({ part: 'toggle', mode: 'dark', start: 0, end: 10, hitWord: '', hitAt: 0, hitLength: 1, [keywordKey(0)]: 'quiet', [keywordKey(1)]: '' });
    expect(toRowModel(script().pieces[1], 'dark')).toMatchObject({ mode: 'light' });
    expect(toRowModel(piece('h', 5, 9, { hit: { word: 'quiet', at: 6, length: 0.8 } }), 'dark')).toMatchObject({ hitWord: 'quiet', hitAt: 6, hitLength: 0.8 });
  });

  it('says whether the fields say what the piece says', () => {
    const p = script().pieces[0];
    expect(unchanged(toRowModel(p, 'dark'), p, 'dark')).toBe(true);
    expect(unchanged({ ...toRowModel(p, 'dark'), end: '12' }, p, 'dark')).toBe(false);
    expect(unchanged({ ...toRowModel(p, 'dark'), end: '10' }, p, 'dark')).toBe(true);
  });
});

describe('applying a form to the script', () => {
  const apply = (i: number, change: Record<string, unknown>) => {
    const s = script();
    return applyRow(s, i, { ...toRowModel(s.pieces[i], 'dark'), ...change }, CATALOG, 'dark');
  };

  it('changes nothing when nothing changed', () => {
    const s = script();
    expect(applyRow(s, 0, toRowModel(s.pieces[0], 'dark'), CATALOG, 'dark')).toBe(s);
  });

  it('changes the part with its defaults', () => {
    expect(apply(1, { part: 'counter' }).pieces[1]).toMatchObject({ part: 'counter', params: { to: 100, speed: 1.5 } });
  });

  it('changes the mode', () => {
    expect(apply(0, { mode: 'light' }).pieces[0].mode).toBe('light');
  });

  it('moves the cuts and the neighbours with them, so the song stays covered', () => {
    expect(apply(0, { end: '12' }).pieces.map((p) => [p.start, p.end])).toEqual([[0, 12], [12, 30], [30, 48]]);
    expect(apply(2, { start: 25 }).pieces.map((p) => [p.start, p.end])).toEqual([[0, 10], [10, 25], [25, 48]]);
  });

  it('ignores an empty time while it is being typed', () => {
    const s = script();
    expect(applyRow(s, 0, { ...toRowModel(s.pieces[0], 'dark'), end: '' }, CATALOG, 'dark')).toBe(s);
    expect(applyRow(s, 0, { ...toRowModel(s.pieces[0], 'dark'), end: null }, CATALOG, 'dark')).toBe(s);
  });

  it('changes a keyword to a word of its line or takes it away', () => {
    expect(apply(0, { [keywordKey(0)]: 'town' }).pieces[0].lines![0].keyword).toBe('town');
    expect('keyword' in apply(0, { [keywordKey(0)]: '' }).pieces[0].lines![0]).toBe(false);
    expect(apply(0, { [keywordKey(1)]: 'down' }).pieces[0].lines![1].keyword).toBe('down');
  });

  it('puts a word hit on a word of the piece and takes it away', () => {
    const withHit = apply(0, { hitWord: 'town', hitAt: 4, hitLength: 0.8 });
    expect(withHit.pieces[0].hit).toEqual({ word: 'town', at: 4, length: 0.8 });
    const s = withHit;
    const without = applyRow(s, 0, { ...toRowModel(s.pieces[0], 'dark'), hitWord: '' }, CATALOG, 'dark');
    expect('hit' in without.pieces[0]).toBe(false);
  });

  it('moves the hit when only its time or length changed, and does not accept a word the piece has not', () => {
    const s = apply(0, { hitWord: 'town', hitAt: 4, hitLength: 0.8 });
    const moved = applyRow(s, 0, { ...toRowModel(s.pieces[0], 'dark'), hitAt: 5 }, CATALOG, 'dark');
    expect(moved.pieces[0].hit).toEqual({ word: 'town', at: 5, length: 0.8 });
    expect(apply(0, { hitWord: 'moon' }).pieces[0].hit).toBeUndefined();
  });

  it('is left alone for a piece that is not there', () => {
    const s = script();
    expect(applyRow(s, 9, {}, CATALOG, 'dark')).toBe(s);
  });
});
