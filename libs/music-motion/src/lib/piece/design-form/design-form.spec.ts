import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { AnimationFailure, type AnimationPort, type PieceDetail } from '@lab/animation-core';
import { CATALOG } from '../../animation/fixtures';
import { ANIMATION } from '../../animation/tokens';
import { serverDetail } from '../../animation/server.fixture';
import { toDetail } from '../../animation/server-mapping';
import { stubStorage } from '../../../testing/memory-storage';
import { DesignForm } from './design-form';

const detail = (extra: Partial<PieceDetail> = {}): PieceDetail => ({
  ...toDetail(serverDetail()),
  songMap: { ...toDetail(serverDetail()).songMap, sections: [{ tag: 'Verse', start: 0, end: 10 }, { tag: 'Chorus', start: 10, end: 20 }] },
  ...extra,
});

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function create(piece: PieceDetail, saveDesign: () => unknown = () => of(piece), lang: 'es' | 'en' = 'en') {
  stubStorage();
  const save = vi.fn(saveDesign);
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideLabForms({ lang }), { provide: ANIMATION, useValue: { saveDesign: save } as unknown as AnimationPort }] });
  const fixture = TestBed.createComponent(DesignForm);
  fixture.componentRef.setInput('piece', piece);
  fixture.componentRef.setInput('catalog', CATALOG);
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, save, saved, text: () => el.textContent ?? '' };
}

const field = (el: HTMLElement, name: string) => el.querySelector<HTMLInputElement>(`input[id*="_input_${name}_"]`);
const saveButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="save-design"]')!;

async function write(fixture: ComponentFixture<unknown>, name: string, value: string): Promise<void> {
  const box = field(fixture.nativeElement as HTMLElement, name)!;
  box.value = value;
  box.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('DesignForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts from the piece\'s design, shows its colours and says where it came from', async () => {
    const { el, text } = await create(detail());
    expect(field(el, 'accent')!.value).toBe('#ff5a3c');
    expect(field(el, 'dark')!.value).toBe('#101018');
    expect(el.querySelectorAll('.swatch')).toHaveLength(3);
    expect(el.querySelector('[data-testid="origin"]')!.textContent).toBe('Proposed by the fixed rule');
    expect(text()).toContain('Accent colour');
  });

  it('offers a mode for each section of the song', async () => {
    const { text } = await create(detail());
    expect(text()).toContain('Mode of the section verse');
    expect(text()).toContain('Mode of the section chorus');
  });

  it('says it was edited by the person when it was', async () => {
    const piece = detail();
    const { el } = await create({ ...piece, design: { ...piece.design, edited: true, source: 'user' } });
    expect(el.querySelector('[data-testid="origin"]')!.textContent).toBe('Edited by you');
  });

  it('saves the design with the modes of the sections and hands over what the server saved', async () => {
    const piece = detail();
    const answer = { ...piece, design: { design: { ...piece.design.design, accent: '#00ff00' }, source: 'user' as const, edited: true } };
    const { fixture, el, save, saved } = await create(piece, () => of(answer));
    await write(fixture, 'accent', '#00ff00');
    saveButton(el).click();
    await settle(fixture);
    expect(save).toHaveBeenCalledWith('api-mm-1', { ...piece.design.design, accent: '#00ff00', modes: { verse: 'dark', chorus: 'light' } });
    expect(saved).toHaveBeenCalledWith(answer);
    expect(el.querySelector('[data-testid="saved"]')).not.toBeNull();
  });

  it('shows the verse and hit styles of the design and saves them back with the rest', async () => {
    const styled = detail({ design: { design: { ...detail().design.design, verseStyle: 'karaoke', hitStyle: 'glow' }, source: 'user', edited: true } });
    const { el, save, fixture, text } = await create(styled, () => of(styled));
    expect(text()).toContain('Karaoke');
    expect(text()).toContain('Glow');
    saveButton(el).click();
    await settle(fixture);
    expect(save).toHaveBeenCalledWith('api-mm-1', expect.objectContaining({ verseStyle: 'karaoke', hitStyle: 'glow' }));
  });

  it('shows glow for a piece that uses it and saves it back, and keeps a style it has no name for', async () => {
    const glowing = detail({ design: { design: { ...detail().design.design, verseStyle: 'glow' }, source: 'user', edited: true } });
    const a = await create(glowing, () => of(glowing));
    expect(a.text()).toContain('Soft glow');
    a.el.querySelector<HTMLButtonElement>('[data-testid="save-design"]')!.click();
    await settle(a.fixture);
    expect(a.save).toHaveBeenCalledWith('api-mm-1', expect.objectContaining({ verseStyle: 'glow' }));
    TestBed.resetTestingModule();
    const unknown = detail({ design: { design: { ...detail().design.design, verseStyle: 'neon' }, source: 'user', edited: true } });
    const b = await create(unknown, () => of(unknown));
    b.el.querySelector<HTMLButtonElement>('[data-testid="save-design"]')!.click();
    await settle(b.fixture);
    expect(b.save).toHaveBeenCalledWith('api-mm-1', expect.objectContaining({ verseStyle: 'neon' }));
  });

  it('shows plain for both styles when the design has neither', async () => {
    const { el, text } = await create(detail());
    expect(el.querySelectorAll('mat-select').length).toBeGreaterThanOrEqual(4);
    expect(text()).toContain('Plain');
  });

  it('shows the server\'s reason next to the accent and keeps what is on screen when it refuses the accent', async () => {
    const reason = 'accent #ff0000 has less than 3:1 contrast with the background of mode dark (#101018)';
    const { fixture, el, saved } = await create(detail(), () => throwError(() => new AnimationFailure('refused', reason)));
    await write(fixture, 'accent', '#ff0000');
    saveButton(el).click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="accent-problem"]')!.textContent).toContain(reason);
    expect(el.querySelector('[data-testid="problem"]')).toBeNull();
    expect(field(el, 'accent')!.value).toBe('#ff0000');
    expect(saved).not.toHaveBeenCalled();
    expect(saveButton(el).disabled).toBe(false);
  });

  it('shows a reason that is about no particular field below the form', async () => {
    const { fixture, el } = await create(detail(), () => throwError(() => new AnimationFailure('other', 'connection refused')));
    saveButton(el).click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="problem"]')!.textContent).toContain('connection refused');
    expect(el.querySelector('[data-testid="accent-problem"]')).toBeNull();
  });

  it('does not save a colour that is not hexadecimal', async () => {
    const { fixture, el, save } = await create(detail());
    await write(fixture, 'light', 'white');
    expect(saveButton(el).disabled).toBe(true);
    saveButton(el).click();
    expect(save).not.toHaveBeenCalled();
  });

  it('is locked while the piece is being drawn', async () => {
    const { el, save } = await create(detail({ state: 'running', progress: 20 }));
    expect(saveButton(el).disabled).toBe(true);
    expect(field(el, 'accent')!.disabled).toBe(true);
    saveButton(el).click();
    expect(save).not.toHaveBeenCalled();
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(detail(), undefined, 'es');
    expect(text()).toContain('Color de acento');
    expect(text()).toContain('Guardar diseño');
  });
});

