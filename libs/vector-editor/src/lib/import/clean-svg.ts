export const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

/** What the cleaning took out, by kind, so the person can be told. */
export type Removed = Record<'scripts' | 'handlers' | 'foreignObjects' | 'externalRefs' | 'metadata' | 'comments' | 'namespaces' | 'fonts', number>;

export const emptyRemoved = (): Removed => ({ scripts: 0, handlers: 0, foreignObjects: 0, externalRefs: 0, metadata: 0, comments: 0, namespaces: 0, fonts: 0 });

export interface Cleaned {
  /** The document's root `<svg>`, cleaned in place. */
  root: SVGSVGElement;
  removed: Removed;
}

/** Parses SVG text. A text that is not XML, or whose root is not `<svg>`, comes back as a problem in a sentence. */
export function parseSvg(text: string): { root: SVGSVGElement } | { problem: string } {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch (e) {
    return { problem: `It is not an SVG: ${(e as Error).message}` };
  }
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) return { problem: `It is not an SVG: ${(error.textContent ?? '').trim().split('\n')[0]}` };
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return { problem: 'It is not an SVG: the root element is not <svg>.' };
  return { root: root as unknown as SVGSVGElement };
}

const EXTERNAL_URL = /url\(\s*['"]?(?!#|data:)/i;

function cleanStyle(style: Element, removed: Removed): void {
  const before = style.textContent ?? '';
  const after = before
    .replace(/@import[^;]*;/gi, () => {
      removed.fonts++;
      return '';
    })
    .replace(/@font-face\s*{[^}]*}/gi, (rule) => {
      if (!EXTERNAL_URL.test(rule)) return rule;
      removed.fonts++;
      return '';
    });
  if (after !== before) style.textContent = after;
}

/**
 * Takes out of a parsed SVG what the page must not run or fetch: scripts, event attributes, `foreignObject`, metadata, comments, the
 * editor's namespaces (Inkscape, Sodipodi, RDF…), every `href` that is not `#id` or `data:`, external fonts and imports in `<style>`.
 * `<style>`, `<title>` and `<desc>` stay.
 */
export function cleanSvg(root: SVGSVGElement): Cleaned {
  const removed = emptyRemoved();
  const doomed: Node[] = [];
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) {
        removed.comments++;
        doomed.push(child);
      } else if (child.nodeType === 1) {
        const el = child as Element;
        if (el.namespaceURI !== SVG_NS) {
          removed.namespaces++;
          doomed.push(el);
          continue;
        }
        const name = el.localName;
        if (name === 'script') removed.scripts++;
        else if (name === 'foreignObject') removed.foreignObjects++;
        else if (name === 'metadata') removed.metadata++;
        if (name === 'script' || name === 'foreignObject' || name === 'metadata') {
          doomed.push(el);
          continue;
        }
        if (name === 'style') cleanStyle(el, removed);
        cleanAttributes(el, removed);
        if (name === 'image' && !el.hasAttribute('href') && !el.hasAttributeNS(XLINK_NS, 'href')) {
          doomed.push(el);
          continue;
        }
        visit(el);
      }
    }
  };
  cleanAttributes(root, removed);
  visit(root);
  for (const node of doomed) node.parentNode?.removeChild(node);
  return { root, removed };
}

function cleanAttributes(el: Element, removed: Removed): void {
  for (const attr of Array.from(el.attributes)) {
    const ns = attr.namespaceURI;
    if (ns === XMLNS_NS) {
      if (attr.localName !== 'xlink') {
        // The plain declaration of the SVG namespace is what every SVG has: taking it off (it is written again) is not something to report.
        if (!(attr.localName === 'xmlns' && attr.value === SVG_NS)) removed.namespaces++;
        el.removeAttributeNode(attr);
      }
    } else if (ns !== null && ns !== XLINK_NS && ns !== 'http://www.w3.org/XML/1998/namespace') {
      removed.namespaces++;
      el.removeAttributeNode(attr);
    } else if (/^on/i.test(attr.localName)) {
      removed.handlers++;
      el.removeAttributeNode(attr);
    } else if (attr.localName === 'href') {
      const value = attr.value.trim();
      if (!value.startsWith('#') && !/^data:/i.test(value)) {
        removed.externalRefs++;
        el.removeAttributeNode(attr);
      }
    } else if (EXTERNAL_URL.test(attr.value)) {
      removed.externalRefs++;
      el.removeAttributeNode(attr);
    }
  }
}

/**
 * The inside of the root as markup, with the namespace declarations taken off (the page is HTML, where `xlink:href` needs none). The root is
 * serialised whole so that its prefixes are the ones the children use.
 */
export function innerMarkup(root: Element): string {
  const whole = new XMLSerializer().serializeToString(root);
  const open = whole.indexOf('>');
  if (whole[open - 1] === '/') return '';
  return whole
    .slice(open + 1, whole.lastIndexOf('</'))
    .replace(/ xmlns(?::xlink)?="[^"]*"/g, '')
    .trim();
}

/** The ids of the elements whose fill or stroke a stylesheet or a `style` attribute decides: the editor cannot change those. */
export function styledByCss(root: Element): string[] {
  const hit = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll('[style]'))) if (/(^|;|\s)(fill|stroke)\s*:/i.test(el.getAttribute('style') ?? '')) hit.add(el);
  for (const style of Array.from(root.getElementsByTagName('style'))) {
    const css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!/(^|;|\s)(fill|stroke)\s*:/i.test(body)) continue;
      for (const part of selector.split(',')) {
        try {
          for (const el of Array.from(root.querySelectorAll(part.trim()))) hit.add(el);
        } catch {
          // A selector the parser does not know cannot be matched; the element simply stays "as the SVG has it".
        }
      }
    }
  }
  return [...hit].map((el) => el.id).filter((id) => id !== '');
}
