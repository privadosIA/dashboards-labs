/** The elements a person can select on the canvas. */
export const SELECTABLE = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use']);

/** What is only ever referred to, never drawn where it stands: nothing inside is selectable. */
export const NOT_DRAWN = new Set(['defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter', 'style', 'title', 'desc']);

/** The deepest level of elements that become nodes of their own (the import's children are level 1). */
export const MAX_DEPTH = 6;

/**
 * Gives every element an id that nobody else has: an element with none gets `v-<n>`, a repeated id becomes `a-2`, `a-3`…, and an id taken
 * by `taken` (another import of the same document) counts as repeated. Returns the ids it changed or made, in document order.
 */
export function identify(root: Element, taken: Iterable<string> = []): { made: string[]; renamed: Array<{ from: string; to: string }> } {
  const used = new Set<string>(taken);
  const made: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  const free = (base: string): string => {
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  };
  let counter = 0;
  const visit = (el: Element): void => {
    if (el !== root) {
      const id = el.getAttribute('id') ?? '';
      if (id !== '' && !used.has(id)) used.add(id);
      else if (id !== '') {
        const next = free(id);
        el.setAttribute('id', next);
        used.add(next);
        renamed.push({ from: id, to: next });
      } else if (SELECTABLE.has(el.localName)) {
        let next: string;
        do next = `v-${++counter}`;
        while (used.has(next));
        el.setAttribute('id', next);
        used.add(next);
        made.push(next);
      }
    }
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  return { made, renamed };
}

const REFERENCE = /(url\(\s*['"]?#)([^)'"\s]+)/g;

/**
 * Puts `<prefix>-` in front of every id under `root` and of every reference to one (`url(#a)`, `href="#a"`), so that two imports that both
 * have a `#logo` or a `#grad` do not collide in the tree or in the fragment. Returns how many ids it changed.
 */
export function namespaceIds(root: Element, prefix: string): number {
  const own = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) own.add(el.getAttribute('id')!);
  const rename = (id: string): string => (own.has(id) ? `${prefix}-${id}` : id);
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id' && el !== root) attr.value = rename(attr.value);
      else if (attr.name === 'href' || attr.name === 'xlink:href') {
        if (attr.value.startsWith('#')) attr.value = `#${rename(attr.value.slice(1))}`;
      } else if (REFERENCE.test(attr.value)) {
        REFERENCE.lastIndex = 0;
        attr.value = attr.value.replace(REFERENCE, (_, head: string, id: string) => `${head}${rename(id)}`);
      }
      REFERENCE.lastIndex = 0;
    }
  }
  return own.size;
}
