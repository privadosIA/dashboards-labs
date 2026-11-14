// JSON Schema lets an object carry fields it does not declare. For a mock that is a trap: a dashboard would come to
// depend on a field the real server never sends. So the tests close the objects: one with declared fields (and no
// `additionalProperties` of its own) accepts no others, which is also what the server's own test checks.
export function closeObjects(node) {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = closeObjects(v);
  if (out.properties && typeof out.properties === 'object' && out.additionalProperties === undefined && (out.type === 'object' || out.type === undefined)) {
    out.additionalProperties = false;
  }
  return out;
}
