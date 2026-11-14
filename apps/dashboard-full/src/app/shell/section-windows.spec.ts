import { isEditorAddress, sectionWindowFor, sectionWindows, usesFullWidth } from './section-windows';

describe('section windows', () => {
  it('lists Animation, Video, Music and Dataset with their addresses and icons', () => {
    expect(sectionWindows().map((s) => [s.path, s.icon])).toEqual([
      ['/animation', 'animation'],
      ['/video', 'movie'],
      ['/music', 'music_note'],
      ['/dataset', 'dataset'],
    ]);
  });

  it('names each section in the language of the app', () => {
    expect(sectionWindows().map((s) => s.title)).toEqual(['Animación', 'Vídeo', 'Música', 'Dataset']);
  });

  it('knows the section of an address, a sub-address, one with a query or a fragment', () => {
    expect(sectionWindowFor('/animation')?.path).toBe('/animation');
    expect(sectionWindowFor('/animation/motion-edit/pieces')?.path).toBe('/animation');
    expect(sectionWindowFor('/video?tab=edit')?.path).toBe('/video');
    expect(sectionWindowFor('/music#engines')?.path).toBe('/music');
    expect(sectionWindowFor('/dataset/presets')?.path).toBe('/dataset');
  });

  it('does not take other addresses for a section', () => {
    expect(sectionWindowFor('/music-x')).toBeUndefined();
    expect(sectionWindowFor('/projects/p1/music')).toBeUndefined();
    expect(sectionWindowFor('/projects?mode=music')).toBeUndefined();
    expect(sectionWindowFor('/library')).toBeUndefined();
    expect(sectionWindowFor('/motion-edit')).toBeUndefined();
    expect(sectionWindowFor('/')).toBeUndefined();
  });
});

describe('editor addresses', () => {
  it('knows the editors: a piece in Motion Edit, the Vector editor and the editor of a project', () => {
    expect(isEditorAddress('/animation/motion-edit/pieces/api-mm-1')).toBe(true);
    expect(isEditorAddress('/animation/motion-edit/pieces/api-mm-1?t=4')).toBe(true);
    expect(isEditorAddress('/animation/vector/editor')).toBe(true);
    expect(isEditorAddress('/animation/vector/editor?part=x')).toBe(true);
    expect(isEditorAddress('/projects/p1/editor')).toBe(true);
  });

  it('does not take the lists and the other screens for editors', () => {
    expect(isEditorAddress('/animation/motion-edit/pieces')).toBe(false);
    expect(isEditorAddress('/animation/motion-edit/flow')).toBe(false);
    expect(isEditorAddress('/animation/vector/catalog')).toBe(false);
    expect(isEditorAddress('/dataset/studio')).toBe(false);
    expect(isEditorAddress('/projects')).toBe(false);
    expect(isEditorAddress('/projects/p1/review')).toBe(false);
  });
});

describe('pages that take the whole width', () => {
  it('are the editors and every page of Animation', () => {
    for (const url of ['/animation', '/animation/pieces', '/animation/songs', '/animation/references', '/animation/motion-edit/pieces/p1', '/animation/vector/editor', '/projects/p1/editor']) expect(usesFullWidth(url)).toBe(true);
  });

  it('are not the other sections or the pages with the side navigation', () => {
    for (const url of ['/dataset/studio', '/video', '/music', '/projects', '/library']) expect(usesFullWidth(url)).toBe(false);
  });
});
