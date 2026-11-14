import { TEMPLATE_GROUPS, StyleTemplate, isChosen, toggleTemplate } from './style-templates';

const all = TEMPLATE_GROUPS.flatMap((g) => g.templates);
const tpl = (id: string): StyleTemplate => all.find((t) => t.id === id)!;

describe('style templates', () => {
  it('has unique ids and texts, in English, with a Spanish label', () => {
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    expect(new Set(all.map((t) => t.text)).size).toBe(all.length);
    for (const t of all) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.text.split(' ').length).toBeGreaterThanOrEqual(6);
      expect(t.text).not.toContain(','.repeat(2));
    }
  });

  it('no text contains another, so choosing one never marks a second', () => {
    for (const a of all) for (const b of all) if (a !== b) expect(a.text.toLowerCase()).not.toContain(b.text.toLowerCase());
  });

  it('sets an empty style to the text alone', () => {
    expect(toggleTemplate('', tpl('soundtrack'))).toBe(tpl('soundtrack').text);
    expect(toggleTemplate('   ', tpl('soundtrack'))).toBe(tpl('soundtrack').text);
  });

  it('adds after the existing style with a comma, dropping a trailing separator', () => {
    expect(toggleTemplate('slow guitar', tpl('rock'))).toBe(`slow guitar, ${tpl('rock').text}`);
    expect(toggleTemplate('slow guitar,', tpl('rock'))).toBe(`slow guitar, ${tpl('rock').text}`);
    expect(toggleTemplate('slow guitar. ', tpl('rock'))).toBe(`slow guitar, ${tpl('rock').text}`);
  });

  it('removes a chosen template with one separator and leaves the rest untouched', () => {
    const rock = tpl('rock').text;
    const amb = tpl('ambient').text;
    expect(toggleTemplate(`slow guitar, ${rock}`, tpl('rock'))).toBe('slow guitar');
    expect(toggleTemplate(rock, tpl('rock'))).toBe('');
    expect(toggleTemplate(`${rock}, slow guitar`, tpl('rock'))).toBe('slow guitar');
    expect(toggleTemplate(`a, ${rock}, ${amb}`, tpl('rock'))).toBe(`a, ${amb}`);
  });

  it('adding then removing returns the original', () => {
    for (const base of ['', 'slow guitar', 'warm vocals, sad mood']) {
      const added = toggleTemplate(base, tpl('jazz'));
      expect(isChosen(added, tpl('jazz'))).toBe(true);
      expect(toggleTemplate(added, tpl('jazz'))).toBe(base);
    }
  });

  it('several templates coexist', () => {
    let s = toggleTemplate('', tpl('rock'));
    s = toggleTemplate(s, tpl('ambient'));
    expect(isChosen(s, tpl('rock'))).toBe(true);
    expect(isChosen(s, tpl('ambient'))).toBe(true);
    expect(s).toBe(`${tpl('rock').text}, ${tpl('ambient').text}`);
  });

  it('is released when the text is edited by hand, and ignores case', () => {
    const t = tpl('rock');
    expect(isChosen(t.text.replace('crunchy', 'clean'), t)).toBe(false);
    expect(isChosen(t.text.toUpperCase(), t)).toBe(true);
    expect(toggleTemplate(t.text.toUpperCase(), t)).toBe('');
  });
});
