import { environment as tutorial } from '../../environments/environment.tutorial';
import { environment } from '../../environments/environment';
import { SectionLinksService } from './section-links.service';

function answer(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

describe('SectionLinksService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows every button in the default environment', () => {
    const links = new SectionLinksService();
    for (const l of Object.keys(environment.sectionLinks) as (keyof typeof environment.sectionLinks)[]) expect(links.shown(l)).toBe(true);
  });

  it('the tutorial environment has the same buttons, every one hidden', () => {
    expect(Object.keys(tutorial.sectionLinks).sort()).toEqual(Object.keys(environment.sectionLinks).sort());
    expect(Object.values(tutorial.sectionLinks).every((shown) => shown === false)).toBe(true);
  });

  it('lets the sections of config.json overrule the environment button by button', async () => {
    answer({ server: 'http://x', sections: { animation: false, dataset: false, video: true, music: 'no' } });
    const links = new SectionLinksService();
    await links.load();
    expect(links.shown('animation')).toBe(false);
    expect(links.shown('dataset')).toBe(false);
    expect(links.shown('video')).toBe(true);
    expect(links.shown('music')).toBe(environment.sectionLinks.music);
    expect(links.shown('flow')).toBe(environment.sectionLinks.flow);
  });

  it('ignores a config.json that is missing, is not JSON or has no sections', async () => {
    for (const setup of [() => answer({}, false), () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x'))), () => answer({ sections: 'no' }), () => answer({ sections: null })]) {
      setup();
      const links = new SectionLinksService();
      await links.load();
      expect(links.shown('animation')).toBe(environment.sectionLinks.animation);
    }
  });
});
