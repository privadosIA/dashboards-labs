import { resultLink } from './result-link';

const run = (state: string) => ({ state: state as never, project: 'demo' });

describe('resultLink', () => {
  it('video runs link to the video artifact', () => {
    expect(resultLink(run('succeeded'), 'out/demo.mp4')).toEqual({ kind: 'video', artifact: 'out/demo.mp4' });
  });

  it('images runs (manifest artifact) link to the gallery of the project', () => {
    expect(resultLink(run('succeeded'), 'out/demo/manifest.json')).toEqual({ kind: 'gallery', project: 'demo' });
  });

  it('runs that did not succeed have no link', () => {
    for (const s of ['failed', 'cancelled', 'running', 'queued', 'interrupted']) {
      expect(resultLink(run(s), 'out/demo.mp4')).toBeNull();
    }
  });

  it('succeeded runs without a usable artifact have no link', () => {
    expect(resultLink(run('succeeded'), undefined)).toBeNull();
    expect(resultLink(run('succeeded'), 'out/other.bin')).toBeNull();
  });

  it('an explicit live state overrides the stored one', () => {
    expect(resultLink(run('running'), 'out/demo.mp4', 'succeeded')).not.toBeNull();
  });
});

describe('resultLink: music', () => {
  const run = { state: 'succeeded' as const, project: 'songs' };

  it('sends the manifest of a music project to the studio, not the gallery', () => {
    expect(resultLink(run, 'out/songs/manifest.json', 'succeeded', 'music')).toEqual({ kind: 'music', project: 'songs' });
  });

  it('keeps sending images manifests to the gallery, whatever the mode is or whether it is known', () => {
    expect(resultLink(run, 'out/songs/manifest.json', 'succeeded', 'images')).toEqual({ kind: 'gallery', project: 'songs' });
    expect(resultLink(run, 'out/songs/manifest.json')).toEqual({ kind: 'gallery', project: 'songs' });
  });

  it('still needs a succeeded run', () => {
    expect(resultLink({ state: 'failed', project: 'songs' }, 'out/songs/manifest.json', 'failed', 'music')).toBeNull();
  });
});

describe('resultLink: a run whose result is gone', () => {
  it('has no link, however its artifact looks', () => {
    const gone = { state: 'succeeded' as never, project: 'demo', result_available: false };
    expect(resultLink(gone, 'out/demo.mp4')).toBeNull();
    expect(resultLink(gone, 'out/demo/manifest.json')).toBeNull();
  });

  it('keeps the link when the server says the result exists, or says nothing', () => {
    expect(resultLink({ state: 'succeeded' as never, project: 'demo', result_available: true }, 'out/demo.mp4')).not.toBeNull();
    expect(resultLink({ state: 'succeeded' as never, project: 'demo' }, 'out/demo.mp4')).not.toBeNull();
  });

  it('a run that is still going ignores the flag the server computed while it ran', () => {
    expect(resultLink({ state: 'running' as never, project: 'demo', result_available: false }, 'out/demo.mp4', 'succeeded')).not.toBeNull();
  });
});
