import { parseSvg } from './clean-svg';
import { identify } from './identify';

const root = (inner: string): Element => {
  const parsed = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
  if ('problem' in parsed) throw new Error(parsed.problem);
  return parsed.root;
};

describe('identify', () => {
  it('gives an id to every selectable element that has none, and not to the rest', () => {
    const svg = root('<g><path d="M0 0"/><circle/></g><defs><linearGradient/></defs>');
    const { made } = identify(svg);
    expect(made).toEqual(['v-1', 'v-2', 'v-3']);
    expect(svg.querySelector('linearGradient')!.hasAttribute('id')).toBe(false);
  });

  it('makes a repeated id unique: the second a becomes a-2, then a-3', () => {
    const svg = root('<path id="a"/><path id="a"/><path id="a"/>');
    const { renamed } = identify(svg);
    expect(Array.from(svg.children).map((c) => c.id)).toEqual(['a', 'a-2', 'a-3']);
    expect(renamed).toEqual([
      { from: 'a', to: 'a-2' },
      { from: 'a', to: 'a-3' },
    ]);
  });

  it('does not make an id that is already used, and respects the ids taken by another import', () => {
    const svg = root('<path id="v-1"/><path/><path id="a"/>');
    identify(svg, ['a']);
    expect(Array.from(svg.children).map((c) => c.id)).toEqual(['v-1', 'v-2', 'a-2']);
  });
});
