import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { Catalog } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import type { Doc } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { InMemoryAnimation, MUSIC_MOTION_OPTIONS } from '@lab/music-motion';

import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { Inspector } from './inspector';

/** The inspector on a piece of the in-memory adapter whose catalog lists, or not, the scene feature; `sceneOf` turns the part of the first block into a scene part. */
async function setup(features: readonly string[], sceneOf?: string) {
  stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, features });
  await firstValueFrom(port.loadSample());
  const piece = await firstValueFrom(port.piece('sample-piece'));
  const listed: Catalog = await firstValueFrom(port.catalog());
  const first = piece.script.pieces[0].part;
  const catalog: Catalog = sceneOf ? { ...listed, parts: listed.parts.map((p) => (p.name === first ? { ...p, scene: { piece: piece.id, scriptPiece: 'p1' } } : p)) } : listed;
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } }, { provide: MUSIC_MOTION_OPTIONS, useValue: { lang: 'en', client: 'motion-edit' } }, provideLabForms({ lang: 'en' }), provideMotionParts({ lang: 'en' })] });
  const fixture = TestBed.createComponent(Inspector);
  fixture.componentRef.setInput('doc', { design: piece.design.design, script: piece.script } satisfies Doc);
  fixture.componentRef.setInput('piece', piece);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('selection', { piece: 'p1' });
  const written: string[] = [];
  const edited: { piece: string; part: string }[] = [];
  fixture.componentInstance.writeScene.subscribe((id) => written.push(id));
  fixture.componentInstance.editScene.subscribe((e) => edited.push(e));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, written, edited, q: (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`), first };
}

describe('Inspector, scenes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers Scene… on a block when the server writes scenes, and asks for it for that piece', async () => {
    const { q, written } = await setup(['scene']);
    q('scene-write')!.click();
    expect(written).toEqual(['p1']);
    expect(q('scene-badge')).toBeNull();
    expect(q('scene-edit')).toBeNull();
  });

  it('shows no Scene button, badge or edit when the catalog lacks the scene feature', async () => {
    const { q } = await setup(['animate', 'layers'], 'scene');
    expect(q('scene-write')).toBeNull();
    expect(q('scene-badge')).toBeNull();
    expect(q('scene-edit')).toBeNull();
  });

  it('marks a block whose part is a scene with a badge and Edit scene…, which names the part', async () => {
    const { q, edited, first } = await setup(['scene'], 'scene');
    expect(q('scene-badge')!.textContent).toContain('scene');
    q('scene-edit')!.click();
    expect(edited).toEqual([{ piece: 'p1', part: first }]);
  });
});
