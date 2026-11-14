import { sampleDocument } from '../../testing/sample-document';
import { suggestName, textOf } from './param-text';

describe('textOf', () => {
  it('reads the text of an imported <text> from the markup of its import', () => {
    expect(textOf(sampleDocument(), 'label')).toBe('LOGO');
    expect(textOf(sampleDocument(), 'dot')).toBe('');
    expect(textOf(sampleDocument(), 'nope')).toBe('');
  });
});

describe('suggestName', () => {
  it('makes a name that passes: lower case, no spaces, starting with a letter, not one in use', () => {
    expect(suggestName('Logo Text', [])).toBe('logo_text');
    expect(suggestName('3D title', [])).toBe('p_3d_title');
    expect(suggestName('logo', ['logo'])).toBe('logo_2');
    expect(suggestName('***', [])).toBe('param');
  });
});
