import { cleanSvg, innerMarkup, parseSvg, styledByCss } from './clean-svg';

const wrap = (inner: string, attrs = ''): string => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${inner}</svg>`;

function clean(inner: string, attrs = '') {
  const parsed = parseSvg(wrap(inner, attrs));
  if ('problem' in parsed) throw new Error(parsed.problem);
  const { root, removed } = cleanSvg(parsed.root);
  return { root, removed, markup: innerMarkup(root) };
}

describe('parseSvg', () => {
  it('refuses what is not XML, with the message, and what is not an <svg>', () => {
    expect(parseSvg('<svg><g></svg>')).toEqual({ problem: expect.stringMatching(/^It is not an SVG: /) });
    expect(parseSvg('<html xmlns="http://www.w3.org/1999/xhtml"></html>')).toEqual({ problem: expect.stringContaining('root element is not <svg>') });
  });
});

describe('cleanSvg', () => {
  it('takes out a script, an event attribute and an external image, and says what it removed', () => {
    const { markup, removed } = clean('<script>alert(1)</script><rect id="r" width="5" height="5" onclick="x()"/><image href="https://example.com/a.png"/>');
    expect(markup).not.toMatch(/script|onclick|https|<image/);
    expect(markup).toContain('id="r"');
    expect(removed).toMatchObject({ scripts: 1, handlers: 1, externalRefs: 1 });
  });

  it('reports nothing for a clean SVG: the ordinary xmlns is not something that was removed', () => {
    const { removed } = clean('<circle id="c" cx="5" cy="5" r="3" fill="#0a0"/>');
    expect(Object.values(removed).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('keeps an internal reference and a data: image, and takes out an external xlink:href', () => {
    const { markup } = clean('<use xlink:href="#a"/><image id="i" xlink:href="data:image/png;base64,AAAA"/><image id="j" xlink:href="http://x/y.png"/>');
    expect(markup).toContain('xlink:href="#a"');
    expect(markup).toContain('data:image/png');
    expect(markup).not.toContain('http://x');
    expect(markup).not.toContain('id="j"');
  });

  it('takes out foreignObject, metadata, comments and the editor’s namespaces, and keeps title, desc and style', () => {
    const { markup, removed } = clean(
      '<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata><!-- note --><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>' +
        '<sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"/>' +
        '<title>Logo</title><desc>A logo</desc><style>.a{fill:red}</style><g id="g" inkscape:label="Layer" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"/>',
    );
    expect(markup).not.toMatch(/metadata|foreignObject|note|sodipodi|inkscape|rdf/);
    expect(markup).toContain('<title>Logo</title>');
    expect(markup).toContain('<desc>A logo</desc>');
    expect(markup).toContain('.a{fill:red}');
    expect(removed).toMatchObject({ metadata: 1, foreignObjects: 1, comments: 1 });
    expect(removed.namespaces).toBeGreaterThan(0);
  });

  it('takes external fonts and imports out of a stylesheet and keeps the data: ones', () => {
    const { markup, removed } = clean(
      '<style>@import url(https://fonts.example/a.css);@font-face{font-family:A;src:url(https://x/a.woff)}@font-face{font-family:B;src:url(data:font/woff;base64,AA)}.t{fill:red}</style>',
    );
    expect(markup).not.toContain('https');
    expect(markup).toContain('font-family:B');
    expect(markup).toContain('.t{fill:red}');
    expect(removed.fonts).toBe(2);
  });

  it('does not repeat the namespace declarations in the markup', () => {
    expect(clean('<g id="g"><use xlink:href="#a"/></g>').markup).toBe('<g id="g"><use xlink:href="#a"/></g>');
  });
});

describe('styledByCss', () => {
  it('lists the elements whose fill or stroke a stylesheet or a style attribute sets', () => {
    const { root } = clean('<style>.t{fill:red}.u{opacity:1}</style><rect id="a" class="t"/><rect id="b" class="u"/><rect id="c" style="stroke:#000"/><rect id="d"/>');
    expect(styledByCss(root).sort()).toEqual(['a', 'c']);
  });
});
