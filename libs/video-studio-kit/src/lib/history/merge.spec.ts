import type { VideoEdit } from '../video-edit/model';
import { DEFAULT_SETTINGS, type Generation } from '../video/model';
import { mergeHistory } from './merge';

const gen = (id: string, createdAt?: string): Generation => ({ id, settings: DEFAULT_SETTINGS, state: 'done', progress: 100, ...(createdAt ? { createdAt } : {}) });
const edit = (id: string, createdAt: string): VideoEdit => ({ id, tool: 'scale', settings: {}, state: 'done', progress: 100, createdAt });
const ids = (items: ReturnType<typeof mergeHistory>) => items.map((i) => i.id);

describe('mergeHistory', () => {
  it('interleaves both lists by creation time, newest first', () => {
    const items = mergeHistory([gen('g2', '2026-11-07T10:03:00Z'), gen('g1', '2026-11-07T10:01:00Z')], [edit('e2', '2026-11-07T10:04:00Z'), edit('e1', '2026-11-07T10:02:00Z')]);
    expect(ids(items)).toEqual(['e2', 'g2', 'e1', 'g1']);
    expect(items.map((i) => i.kind)).toEqual(['edit', 'generation', 'edit', 'generation']);
  });

  it('works when one list is empty', () => {
    expect(ids(mergeHistory([gen('g1', '2026-11-07T10:01:00Z')], []))).toEqual(['g1']);
    expect(ids(mergeHistory([], [edit('e1', '2026-11-07T10:01:00Z')]))).toEqual(['e1']);
    expect(mergeHistory([], [])).toEqual([]);
  });

  it('puts a generation without a date after the dated ones, in its own order', () => {
    expect(ids(mergeHistory([gen('old2'), gen('old1')], [edit('e1', '2026-11-07T10:01:00Z')]))).toEqual(['e1', 'old2', 'old1']);
  });

  it('puts the generation first on a tie', () => {
    expect(ids(mergeHistory([gen('g', '2026-11-07T10:00:00Z')], [edit('e', '2026-11-07T10:00:00Z')]))).toEqual(['g', 'e']);
  });
});
