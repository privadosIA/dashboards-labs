// JSON Schema lets an object carry fields it does not declare. For a mock that is a trap: a dashboard would come to
// depend on a field the real server never sends. So the tests close the objects: one with declared fields (and no
// `additionalProperties` of its own) accepts no others, which is also what the server's own test checks.
//
// `allOf` needs care: each branch declares only part of the object (`{ $ref: Base }` and `{ properties: { html } }`), so
// closing each branch alone would refuse the fields of the others. Each branch is closed over the fields of all of them
// together (a `$ref` branch is read from the document and inlined, with the other branches' fields allowed in it).
export function closeObjects(root) {
  const resolve = (node) => (node?.$ref ? node.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], root) : node);
  const namesOf = (branches, seen = new Set()) => {
    const names = new Set();
    for (const branch of branches ?? []) {
      const target = resolve(branch);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      for (const k of Object.keys(target.properties ?? {})) names.add(k);
      for (const k of namesOf(target.allOf, seen)) names.add(k);
    }
    return names;
  };

  const close = (node) => {
    if (Array.isArray(node)) return node.map(close);
    if (!node || typeof node !== 'object') return node;
    const out = /** @type {Record<string, any>} */ ({});
    for (const [k, v] of Object.entries(node)) out[k] = k === 'allOf' && Array.isArray(v) ? v.map((b) => widen(b, namesOf(v))) : close(v);
    if (out.properties && typeof out.properties === 'object' && out.additionalProperties === undefined && (out.type === 'object' || out.type === undefined)) {
      out.additionalProperties = false;
    }
    return out;
  };
  // a branch of an allOf, able to hold the fields of its siblings
  const widen = (branch, names) => {
    const target = resolve(branch);
    if (!target?.properties) return close(branch);
    const open = Object.fromEntries([...names].filter((n) => !(n in target.properties)).map((n) => [n, {}]));
    return close({ ...target, properties: { ...target.properties, ...open } });
  };
  return close(root);
}
