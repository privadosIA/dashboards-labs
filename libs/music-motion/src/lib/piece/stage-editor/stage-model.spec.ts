import { CATALOG } from '../../animation/fixtures';
import type { Catalog, Stage } from '@lab/animation-core';
import { addCharacter, charKey, fromStageModel, removeCharacter, sameStage, toStageModel } from './stage-model';

const stage = (): Stage => ({ background: 'stage', characters: [{ character: 'bot', pose: 'wave', expression: 'happy', action: 'bounce', x: 30, y: 78, size: 42 }] });

describe('the stage as the fields of a form', () => {
  it('has the background and, for each character, its choices and its place', () => {
    expect(toStageModel(stage())).toEqual({ background: 'stage', [charKey(0, 'character')]: 'bot', [charKey(0, 'pose')]: 'wave', [charKey(0, 'expression')]: 'happy', [charKey(0, 'action')]: 'bounce', [charKey(0, 'x')]: 30, [charKey(0, 'y')]: 78, [charKey(0, 'size')]: 42 });
    expect(toStageModel(undefined)).toEqual({ background: '' });
  });

  it('comes back as the same stage', () => {
    expect(fromStageModel(toStageModel(stage()), stage(), CATALOG)).toEqual(stage());
  });

  it('keeps the place inside the frame, and a size of at least 1', () => {
    const model = { ...toStageModel(stage()), [charKey(0, 'x')]: 150, [charKey(0, 'y')]: -4, [charKey(0, 'size')]: 0 };
    expect(fromStageModel(model, stage(), CATALOG).characters![0]).toMatchObject({ x: 100, y: 0, size: 1 });
  });

  it('keeps the old figure for a number that is empty or not one', () => {
    const model = { ...toStageModel(stage()), [charKey(0, 'x')]: '', [charKey(0, 'y')]: 'abc', [charKey(0, 'size')]: null };
    expect(fromStageModel(model, stage(), CATALOG).characters![0]).toMatchObject({ x: 30, y: 78, size: 42 });
  });

  it('takes the new character\'s first pose and expression when the character changes', () => {
    const other: Catalog = { ...CATALOG, characters: [...CATALOG.characters, { name: 'cat', description: 'A cat', poses: ['sit', 'jump'], expressions: ['calm'] }] };
    const model = { ...toStageModel(stage()), [charKey(0, 'character')]: 'cat' };
    expect(fromStageModel(model, stage(), other).characters![0]).toMatchObject({ character: 'cat', pose: 'sit', expression: 'calm' });
  });

  it('takes away an action when none is chosen, and a background when none is', () => {
    const model = { ...toStageModel(stage()), background: '', [charKey(0, 'action')]: '' };
    const next = fromStageModel(model, stage(), CATALOG);
    expect(next.background).toBeUndefined();
    expect(next.characters![0].action).toBeUndefined();
  });

  it('keeps a character that is not in the catalog as it is, for the server to say', () => {
    const odd: Stage = { characters: [{ character: 'ghost', pose: 'float', x: 10, y: 10, size: 10 }] };
    expect(fromStageModel(toStageModel(odd), odd, CATALOG).characters![0]).toMatchObject({ character: 'ghost', pose: 'float' });
  });
});

describe('adding and removing characters', () => {
  it('adds the catalog\'s first character in its first pose and expression, in the middle low', () => {
    expect(addCharacter(undefined, CATALOG)).toEqual({ characters: [{ character: 'bot', pose: 'idle', expression: 'neutral', x: 50, y: 85, size: 40 }] });
    expect(addCharacter(stage(), CATALOG).characters).toHaveLength(2);
    expect(addCharacter(stage(), CATALOG).background).toBe('stage');
  });

  it('adds nothing when the catalog has no characters', () => {
    expect(addCharacter(undefined, { ...CATALOG, characters: [] })).toEqual({});
  });

  it('removes a character, keeps the background, and leaves no stage when nothing is left', () => {
    expect(removeCharacter(addCharacter(stage(), CATALOG), 0)!.characters).toHaveLength(1);
    expect(removeCharacter(stage(), 0)).toEqual({ background: 'stage' });
    expect(removeCharacter({ characters: stage().characters }, 0)).toBeNull();
  });

  it('compares two stages by what they say', () => {
    expect(sameStage(stage(), stage())).toBe(true);
    expect(sameStage(undefined, {})).toBe(true);
    expect(sameStage(stage(), addCharacter(stage(), CATALOG))).toBe(false);
  });
});
