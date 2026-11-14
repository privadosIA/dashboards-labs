/** What the server's report says about one entry: the words it mapped and, when it refused the entry, why. */
export interface ReportRow {
  readonly id: string;
  readonly mapped: readonly string[];
  readonly rejected?: string;
}

/**
 * Reads the server's import report into one row per entry. The report is text: a `[id]` line, then `  mapped: …` lines or one `  rejected: <reason>` line, per entry, then a summary line; a report that is a JSON object
 * with an `entries` list (`id`, `mapped`, `discarded`) is read too. What cannot be read gives no rows: the report text is still shown whole.
 */
export function reportRows(report: string): ReportRow[] {
  const text = report.trim();
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text) as { entries?: { id?: unknown; mapped?: unknown; discarded?: unknown; rejected?: unknown; reason?: unknown }[] };
      if (Array.isArray(data.entries)) {
        return data.entries.flatMap((e) => {
          if (typeof e.id !== 'string') return [];
          const why = Array.isArray(e.discarded) && e.discarded.length ? e.discarded.map(String).join('; ') : typeof e.rejected === 'string' ? e.rejected : typeof e.reason === 'string' ? e.reason : undefined;
          return [{ id: e.id, mapped: Array.isArray(e.mapped) ? e.mapped.map(String) : [], ...(why ? { rejected: why } : {}) }];
        });
      }
    } catch {
      /* not JSON after all: read it as text */
    }
  }
  const rows: { id: string; mapped: string[]; rejected?: string }[] = [];
  let current: { id: string; mapped: string[]; rejected?: string } | null = null;
  for (const line of report.split('\n')) {
    const head = /^\[(.+)\]\s*$/.exec(line.trim());
    if (head) {
      current = { id: head[1], mapped: [] };
      rows.push(current);
      continue;
    }
    const detail = /^\s+(mapped|rejected)\s*:\s*(.*)$/i.exec(line);
    if (current && detail) {
      if (detail[1].toLowerCase() === 'rejected') current.rejected = detail[2].trim();
      else current.mapped.push(detail[2].trim());
    }
  }
  return rows;
}
