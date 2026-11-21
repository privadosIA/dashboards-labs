import { ProjectSummary } from '../../core/api.models';
import { detailsOf, patchOf } from './project-details';

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({ id: 'demo', name: 'Demo', mode: 'video', scene_count: 1, client: 'embedded', ...over });

describe('detailsOf', () => {
  it('shows the name, the client the person typed, and the label as text', () => {
    expect(detailsOf(project({ client: 'dashboard-full', adult: false }))).toEqual({ name: 'Demo', client: 'dashboard-full', adult: 'false' });
    expect(detailsOf(project({ adult: true })).adult).toBe('true');
    expect(detailsOf(project()).adult).toBe('');
  });

  it('leaves the client empty for the ones the server makes up', () => {
    expect(detailsOf(project({ client: 'embedded' })).client).toBe('');
    expect(detailsOf(project({ client: 'unknown' })).client).toBe('');
    expect(detailsOf(project({ client: undefined })).client).toBe('');
  });
});

describe('patchOf', () => {
  const from = detailsOf(project({ client: 'dashboard-full', adult: false }));

  it('sends nothing when nothing changed, whitespace included', () => {
    expect(patchOf(from, { ...from })).toEqual({});
    expect(patchOf(from, { ...from, name: '  Demo ' })).toEqual({});
  });

  it('sends only the fields that changed', () => {
    expect(patchOf(from, { ...from, name: 'Renamed' })).toEqual({ name: 'Renamed' });
    expect(patchOf(from, { ...from, client: 'another-dashboard' })).toEqual({ client: 'another-dashboard' });
    expect(patchOf(from, { ...from, adult: 'true' })).toEqual({ adult: true });
  });

  it('an emptied client is null and «not reviewed» is adult null', () => {
    expect(patchOf(from, { ...from, client: '   ' })).toEqual({ client: null });
    expect(patchOf(from, { ...from, adult: '' })).toEqual({ adult: null });
  });

  it('a client typed where there was none is sent as it is', () => {
    expect(patchOf(detailsOf(project()), { name: 'Demo', client: ' studio ', adult: '' })).toEqual({ client: 'studio' });
  });

  it('several changes go in one patch', () => {
    expect(patchOf(from, { name: 'New', client: '', adult: '' })).toEqual({ name: 'New', client: null, adult: null });
  });
});
