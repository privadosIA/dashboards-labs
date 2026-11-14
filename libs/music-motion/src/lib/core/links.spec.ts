import { TestBed } from '@angular/core/testing';

import { MUSIC_MOTION_BASE, injectLink, linkUnder } from './links';
import { MUSIC_MOTION_SECTIONS } from './sections';
import { textsFor } from './texts';

describe('linkUnder', () => {
  it('is the address at the root of the host when there is no base', () => {
    expect(linkUnder('', 'new')).toBe('/new');
    expect(linkUnder('', 'pieces', 'a1')).toBe('/pieces/a1');
  });

  it('puts the base in front of the screen, however the slashes are written', () => {
    expect(linkUnder('/animation', 'pieces', 'a1')).toBe('/animation/pieces/a1');
    expect(linkUnder('/animation/', '/songs/')).toBe('/animation/songs');
  });
});

describe('injectLink', () => {
  it('makes the links with the base the route was mounted under', () => {
    TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_BASE, useValue: '/animation' }] });
    const link = TestBed.runInInjectionContext(() => injectLink());
    expect(link('parts', 'd1')).toBe('/animation/parts/d1');
  });
});

describe('MUSIC_MOTION_SECTIONS', () => {
  it('names every section in both languages', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const s of MUSIC_MOTION_SECTIONS) expect(textsFor(lang).nav[s.key], `${lang} ${s.key}`).toBeTruthy();
    }
  });
});
