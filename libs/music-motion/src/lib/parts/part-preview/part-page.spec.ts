import { PartPageError, buildPartPage, paramsOf, type PartLook } from './part-page';

const look: PartLook = { bg: 'Canvas', fg: 'CanvasText', accent: 'Highlight', display: 'serif', body: 'sans-serif' };
const manifest = (extra: object = {}) => JSON.stringify({ name: 'bars', params: [{ name: 'bars', type: 'int', default: 7 }, { name: 'gain', type: 'number', default: 1.5 }, { name: 'label', type: 'string', default: 'hi' }, { name: 'on', type: 'bool', default: 'true' }], ...extra });

describe('paramsOf', () => {
  it('reads each parameter as the part receives it: numbers as numbers, bool as bool, text as text', () => {
    expect(paramsOf(JSON.parse(manifest()))).toEqual({ bars: 7, gain: 1.5, label: 'hi', on: true });
  });

  it('starts a number with no default at its minimum, a text at empty and a bool at false, and skips what has no name', () => {
    expect(paramsOf({ params: [{ name: 'n', type: 'int', min: 3 }, { name: 's', type: 'enum' }, { name: 'b', type: 'bool' }, { type: 'int' }, 5] })).toEqual({ n: 3, s: '', b: false });
    expect(paramsOf({})).toEqual({});
  });
});

describe('buildPartPage', () => {
  it('builds a complete document: the look, the parameters first, the fragment and the clock', () => {
    const page = buildPartPage(manifest(), '<div id="x">{{label}}</div><script>window.__partSeek=function(){};</script>', look);
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('--accent:Highlight');
    expect(page).toContain('window.__params={"bars":7,"gain":1.5,"label":"hi","on":true}');
    expect(page.indexOf('window.__params')).toBeLessThan(page.indexOf('id="x"'));
    expect(page).toContain('<div id="x">hi</div>');
    expect(page).toContain('window.__partSeek(t, beat(t))');
    expect(page).toContain("default-src 'none'");
  });

  it('keeps a value from closing the script it sits in', () => {
    const page = buildPartPage(manifest({ params: [{ name: 'label', type: 'string', default: '</script><b>' }] }), '<i></i>', look);
    expect(page).not.toContain('</script><b>');
    expect(page).toContain('\\u003c/script\\u003e');
  });

  it('says what is wrong instead of building a page: a manifest that is not JSON, one that is not an object, an empty fragment, a slot with no parameter', () => {
    expect(() => buildPartPage('not json', '<i></i>', look)).toThrow(PartPageError);
    expect(() => buildPartPage('not json', '<i></i>', look)).toThrow(/manifest\.json: it is not valid JSON/);
    expect(() => buildPartPage('[]', '<i></i>', look)).toThrow(/must be a JSON object/);
    expect(() => buildPartPage(manifest(), '  ', look)).toThrow(/part\.html: it is empty/);
    expect(() => buildPartPage(manifest(), '<i>{{nope}}</i>', look)).toThrow(/not a parameter/);
  });
});
