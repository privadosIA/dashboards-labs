// The paging protocol of the lists of the API, applied once for every list: `limit`, `offset`, `sort` and `q`, and the
// headers `X-Total-Count` and `Link`. A handler applies the filters that belong to its list (`state`, `client`, `piece`, …)
// and hands the items here. The fields a list can be sorted by are read from the contract (the description of the `sort`
// parameter, or the one of the operation when the parameter is the shared one), so they cannot drift from it.

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const PARAMS = ['limit', 'offset', 'sort', 'q'];

const err = (status, code, message) => [status, { error: { code, message } }];

/** The parameters of an operation with their `$ref`s resolved. */
const parametersOf = (spec, op) => (op?.parameters ?? []).map((p) => (p.$ref ? p.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec) : p));

/** True when the operation declares the paging parameters. */
export const isPaged = (spec, op) => parametersOf(spec, op).some((p) => p.name === 'offset');

/**
 * The sort fields of an operation and the default one: `{ fields: ['name', 'updated_at'], def: 'name', desc: false }`.
 * The clause is the text that follows `sort` in the description of the parameter, or else in the one of the operation,
 * up to the end of the sentence or the next parameter; the fields are its backticked words.
 */
export function sortOf(spec, op) {
  const param = parametersOf(spec, op).find((p) => p.name === 'sort');
  for (const [text, own] of [[param?.description, true], [op?.description, false]]) {
    const clause = clauseOf(text ?? '', own);
    if (!clause) continue;
    const found = [...clause.matchAll(/`([a-z_]+)`(\s*\([^)]*\))?/g)].map((m) => ({ name: m[1], note: m[2] ?? '' })).filter((f) => f.name !== 'sort' && f.name !== 'limit' && f.name !== 'offset' && f.name !== 'q');
    if (!found.length) continue;
    // "(the default…)" or "(newest first by default)" marks the default; "newest first" or "most recent first" makes it descending.
    const marked = found.find((f) => /default/.test(f.note)) ?? (found.length === 1 ? found[0] : null);
    const desc = !!marked && /newest first|most recent first/.test(marked.note);
    return { fields: found.map((f) => f.name), def: marked?.name ?? null, desc };
  }
  return { fields: [], def: null, desc: false };
}

function clauseOf(text, own) {
  // The parameter says "`id` (the default), `name` or `updated_at`; a `-` before it…" (or the shared sentence that names no field); an operation says "`sort` is `a` (…) or `b`, and `limit`…" or "it sorts by `name` (…) or `updated_at` (…), `q` is…".
  let rest = text;
  if (!own || !/^\s*`/.test(text)) {
    const at = text.search(/`sort`\s*(?:is|=|\()|\bsorts by\b|`sort=/);
    if (at < 0) return '';
    rest = text.slice(at).replace(/^`sort`\s*/, '').replace(/^sorts by\s*/, '').replace(/^(?:is|=)\s*/, '');
  }
  // up to the first separator that starts another thing: "; ", ". ", ", and", or a comma followed by another parameter
  const end = rest.search(/;\s|\.\s|\.$|,\s*(?:and\b|`(?:limit|offset|q|state|sort)`)|\band `(?:limit|offset|q)`/);
  const clause = end < 0 ? rest : rest.slice(0, end);
  return clause.replace(/a `-` before it[^,;.)]*/g, '');
}

const CLIENT_RE = /^[a-z0-9-]{1,32}$/;
/** `client=a,b` as the server reads it: `{ keep }` is a test over an item's `client`; anything that is not a client name is a `{ error }` (400). */
export function clientFilter(query) {
  const c = query.get('client');
  if (c === null) return { keep: () => true };
  const names = c.split(',');
  if (!names.every((n) => CLIENT_RE.test(n))) return { error: err(400, 'invalid_request', 'client: a list of client names (or embedded, unknown) separated by commas') };
  const set = new Set(names);
  return { keep: (item) => set.has(item.client) };
}

const num = (v) => (v === null || v === '' ? Number.NaN : Number(v));
const compare = (a, b) => {
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
};

/**
 * Makes the function a handler calls. `ctx` carries what the request is: the contract, the operation and the URL.
 *   page(items, { search: ['name', 'description'], by: { duration: (s) => s.audio_seconds } })
 * `search` names the text fields `q` looks in (or a function of the item that answers its text); `by` maps a sort field
 * that is not a field of the item, and `wrap` names the key of a list the API answers inside an object (`{ drafts: […] }`), or is a function
 * `(page, total, matching) => body` for an object that carries more (`{ items, total }`).
 * `natural` keeps the order the handler gave when no `sort` is asked (the songs of a playlist come in its order).
 * `always` is for a list that is always a page (prompts: 50 unless `limit`, at most 200,
 * best match first with `q` through `rank`, else the `fallback` sort). Answers the whole `[status, body, type, headers]` tuple of the handler.
 */
export function pager(spec, op, url) {
  return (items, { search = [], by = {}, always = false, limitDefault = DEFAULT_LIMIT, limitMax = MAX_LIMIT, rank, fallback, wrap, natural = false } = {}) => {
    const query = url.searchParams;
    const asked = always || PARAMS.some((n) => query.has(n));
    const { fields, def, desc } = sortOf(spec, op);

    let limit;
    if (query.has('limit')) {
      limit = num(query.get('limit'));
      if (!Number.isInteger(limit) || limit < 1 || limit > limitMax) return err(400, 'invalid_request', `limit: a whole number from 1 to ${limitMax}`);
    }
    let offset = 0;
    if (query.has('offset')) {
      offset = num(query.get('offset'));
      if (!Number.isInteger(offset) || offset < 0) return err(400, 'invalid_request', 'offset: a whole number, 0 or more');
    }
    let sort = null;
    if (query.has('sort')) {
      const raw = query.get('sort');
      const reverse = raw.startsWith('-');
      const field = reverse ? raw.slice(1) : raw;
      if (fields.length && !fields.includes(field)) return err(400, 'invalid_request', `sort: "${field}" is not accepted; use ${fields.join(', ')}`);
      sort = { field, reverse };
    }

    let out = items;
    const text = query.get('q');
    if (text !== null && text !== '' && search.length) {
      const needle = text.toLowerCase();
      out = out.filter((it) => search.some((f) => String(typeof f === 'function' ? f(it) : it[f] ?? '').toLowerCase().includes(needle)));
    }

    const all = out;
    const body = (list, total) => (typeof wrap === 'function' ? wrap(list, total, all) : wrap ? { [wrap]: list } : list);
    if (!asked) return [200, body(out, out.length)];

    // Without `sort` a page keeps the default of the list; a list with none keeps its order.
    if (!sort && rank && text) out = [...out].sort((a, b) => rank(b, text.toLowerCase()) - rank(a, text.toLowerCase()));
    else if (!sort && !natural && (def || fallback)) sort = def ? { field: def, reverse: desc } : fallback;
    if (sort) {
      const get = by[sort.field] ?? ((it) => it[sort.field]);
      // an item with no value for the field (a song with no stars) goes last in either direction
      out = [...out].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        const gone = (v) => v === undefined || v === null;
        if (gone(x) || gone(y)) return gone(x) === gone(y) ? 0 : gone(x) ? 1 : -1;
        return (sort.reverse ? -1 : 1) * compare(x, y);
      });
    }

    const total = out.length;
    // A list that was only sorted or searched is not cut: `offset` alone, or a list that is always a page, uses the default limit.
    const size = limit ?? (query.has('offset') || always ? limitDefault : Infinity);
    const paged = out.slice(offset, offset + size);
    const headers = { 'X-Total-Count': String(total) };
    // `Link` is only sent by a list asked with `limit` or `offset` (not by one that was only sorted or searched).
    if (always || query.has('limit') || query.has('offset')) {
      const at = (o) => {
        const q = new URLSearchParams(query);
        q.set('offset', String(o));
        if (!q.has('limit')) q.set('limit', String(size));
        return `<${url.pathname}?${q}>`;
      };
      const links = [];
      if (offset + size < total) links.push(`${at(offset + size)}; rel="next"`);
      if (offset > 0) links.push(`${at(Math.max(0, offset - size))}; rel="prev"`);
      if (links.length) headers.Link = links.join(', ');
    }
    return [200, body(paged, total), 'application/json', headers];
  };
}
