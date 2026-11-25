/**
 * The file name of an export: the one the server gives in `Content-Disposition` (`attachment; filename="x.zip"` or the
 * `filename*=UTF-8''x.zip` form), or `veritmo-data-<yyyy-mm-dd>.zip` when the page cannot read that header (a page on
 * another origin only sees it if the server exposes it) or it has no usable name.
 */
export function exportName(disposition: string | null | undefined, today = new Date()): string {
  const named = nameIn(disposition ?? '');
  return named ?? `veritmo-data-${today.toISOString().slice(0, 10)}.zip`;
}

function nameIn(header: string): string | null {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  const plain = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/.exec(header);
  let name = star ? safeDecode(star[1].trim()) : (plain?.[1] ?? plain?.[2] ?? '').trim();
  // a name is a file name, never a path
  name = name.split(/[\\/]/).pop() ?? '';
  return /^[\w.\- ()]+$/.test(name) && name.length > 0 ? name : null;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
