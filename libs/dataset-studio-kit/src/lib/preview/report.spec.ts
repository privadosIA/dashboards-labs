import { reportRows } from './report';

describe('reportRows', () => {
  it('reads one row per entry from the report text, with the reason of a refused one', () => {
    const rows = reportRows('[s01]\n  mapped: prompt ← 12 chars\n  mapped: dialogue ← "hi"\n[s02]\n  rejected: Dialogue line without quoted text\nimported 1, silent 0, rejected 1\n');
    expect(rows).toEqual([
      { id: 's01', mapped: ['prompt ← 12 chars', 'dialogue ← "hi"'] },
      { id: 's02', mapped: [], rejected: 'Dialogue line without quoted text' },
    ]);
  });

  it('reads a report that is a JSON object with an entries list', () => {
    const rows = reportRows(JSON.stringify({ entries: [{ id: 'a', mapped: ['x'], discarded: null }, { id: 'b', mapped: [], discarded: ['empty prompt'] }] }));
    expect(rows).toEqual([{ id: 'a', mapped: ['x'] }, { id: 'b', mapped: [], rejected: 'empty prompt' }]);
  });

  it('gives no rows for a report it cannot read', () => {
    expect(reportRows('imported 3')).toEqual([]);
    expect(reportRows('{ not json')).toEqual([]);
  });
});
