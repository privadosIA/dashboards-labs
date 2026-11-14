import type { EngineCard } from '../engines/model';
import { LOOKS, applyLook, isStyleLine, lookInBrief, recommendedModel, sceneLines, styleWordsOf } from './looks';

const card = (id: string, name: string, description = '', state: EngineCard['state'] = 'ready'): EngineCard => ({ id, name, description, state, source: 'none' });

describe('looks', () => {
  it('appends the look\'s words as a last style line, visibly', () => {
    const out = applyLook('a bee on a flower\nthe hive at dawn', 'illustration');
    expect(out.split('\n')).toEqual(['a bee on a flower', 'the hive at dawn', `style: ${LOOKS[1].words}`]);
    expect(lookInBrief(out)).toBe('illustration');
  });

  it('replaces the kit\'s line when the look changes, takes it away with none, and never touches a line of the person\'s own', () => {
    const own = 'style: my own words';
    const a = applyLook(`one\n${own}`, 'realistic');
    expect(a.split('\n')).toEqual(['one', own, `style: ${LOOKS[0].words}`]);
    const b = applyLook(a, 'illustration');
    expect(b.split('\n')).toEqual(['one', own, `style: ${LOOKS[1].words}`]);
    expect(applyLook(b, '')).toBe(`one\n${own}`);
  });

  it('starts a brief that is empty with the style line alone, without a blank line before it', () => {
    expect(applyLook('', 'realistic')).toBe(`style: ${LOOKS[0].words}`);
    expect(applyLook('', '')).toBe('');
  });

  it('does not count a style line as a scene and reads its words', () => {
    const brief = 'one\n\ntwo\nStyle: soft light\n- three';
    expect(sceneLines(brief)).toEqual(['one', 'two', '- three']);
    expect(styleWordsOf(brief)).toBe('soft light');
    expect(isStyleLine('  style: x')).toBe(true);
    expect(isStyleLine('a style: x')).toBe(false);
  });

  it('recommends by the catalog\'s style tags, the best ranked first, and does not guess from words when the catalog tags its models', () => {
    const cards: EngineCard[] = [
      { ...card('a', 'Plain', 'general model'), styles: ['general'], rank: 2 },
      { ...card('b', 'Photo one', ''), styles: ['photo'], rank: 1 },
      { ...card('c', 'Photo best', ''), styles: ['photo'], rank: 3 },
      { ...card('d', 'Anime', ''), styles: ['anime'], rank: 1 },
      { ...card('e', 'Photo off', '', 'unavailable'), styles: ['photo'], rank: 9 },
    ];
    expect(recommendedModel('realistic', cards)?.id).toBe('c');
    expect(recommendedModel('illustration', cards)?.id).toBe('d');
    // tagged catalog, nothing tagged for the look: no recommendation, even if a description says "illustration"
    expect(recommendedModel('illustration', cards.slice(0, 3).map((c) => ({ ...c, description: 'an illustration model' })))).toBeUndefined();
  });

  it('recommends an installed model whose catalog words suit the look, and none when nothing does', () => {
    const cards = [card('a', 'Stable Diffusion 1.5', 'Base model'), card('b', 'Juggernaut XL', 'Fotorrealista'), card('c', 'Toon', 'Anime illustration', 'unavailable'), card('d', 'Dream', 'illustration style')];
    expect(recommendedModel('realistic', cards)?.id).toBe('b');
    expect(recommendedModel('illustration', cards)?.id).toBe('d');
    expect(recommendedModel('illustration', [cards[0]])).toBeUndefined();
  });
});
