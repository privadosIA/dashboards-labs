import { DEFAULT_SETTINGS, type Generation, type GenerationState } from './model';
import { finished } from './finished';

const g = (id: string, state: GenerationState): Generation => ({ id, settings: DEFAULT_SETTINGS, state, progress: 0 });

describe('the generations that finished', () => {
  it('reports one that was running and is done now', () => {
    expect(finished([g('a', 'running')], [g('a', 'done')]).map((x) => x.id)).toEqual(['a']);
  });

  it('reports one that failed, and one that was still queued', () => {
    expect(finished([g('a', 'running'), g('b', 'queued')], [g('a', 'failed'), g('b', 'done')]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('reports each one once: a finished one that stays finished is not reported again', () => {
    expect(finished([g('a', 'done')], [g('a', 'done')])).toEqual([]);
  });

  it('does not report what is still in progress', () => {
    expect(finished([g('a', 'queued')], [g('a', 'running')])).toEqual([]);
  });

  it('does not report one the previous list did not hold (the first read, a restored history)', () => {
    expect(finished([], [g('a', 'done'), g('b', 'failed')])).toEqual([]);
  });

  it('ignores a generation that was deleted', () => {
    expect(finished([g('a', 'running')], [])).toEqual([]);
  });
});
