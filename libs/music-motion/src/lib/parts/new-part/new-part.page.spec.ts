import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { draft } from '../parts.page.spec';
import { NewPartPage } from './new-part.page';
import { PART_TEMPLATE } from './template';
import { assistTestProviders } from '../../../testing/assist';

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(overrides: Partial<AnimationPort> = {}, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const createDraftFromText = vi.fn((t: { manifest: string; fragment: string }) => of(draft('made', { name: 'bars', ...t })));
  const port = { createDraftFromText, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({ providers: [ ...assistTestProviders(),{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port }] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(NewPartPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, createDraftFromText, navigate };
}
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const boxes = (el: HTMLElement) => el.querySelectorAll<HTMLTextAreaElement>('textarea');

describe('NewPartPage', () => {
  it('starts from the template, with the two texts to write', async () => {
    const { el } = await create();
    expect(boxes(el)).toHaveLength(2);
    expect(boxes(el)[0].value).toBe(PART_TEMPLATE.manifest);
    expect(boxes(el)[1].value).toBe(PART_TEMPLATE.fragment);
    expect(el.querySelector('h1')!.textContent).toContain('New part from scratch');
  });

  it('makes a draft of what was written, with no sentence, and opens it', async () => {
    const { fixture, el, createDraftFromText, navigate } = await create();
    const box = boxes(el)[1];
    box.value = '<div>mine</div>';
    box.dispatchEvent(new Event('input'));
    await settle(fixture);
    (get(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(createDraftFromText).toHaveBeenCalledWith({ manifest: PART_TEMPLATE.manifest, fragment: '<div>mine</div>' });
    expect(navigate).toHaveBeenCalledWith(['/parts/made']);
  });

  it('opens the draft that failed too, which is where its problems are shown and the text is fixed', async () => {
    const failed = draft('bad', { state: 'failed', request: '', name: undefined, problems: ['manifest.json: name is missing'] });
    const { fixture, el, navigate } = await create({ createDraftFromText: () => of(failed) });
    (get(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/parts/bad']);
  });

  it('shows what the server refuses in its own words, keeps what was written and opens nothing', async () => {
    const { fixture, el, navigate } = await create({ createDraftFromText: () => throwError(() => new AnimationFailure('unavailable', 'Chrome is not installed on this machine')) });
    const box = boxes(el)[1];
    box.value = '<p>typed</p>';
    box.dispatchEvent(new Event('input'));
    await settle(fixture);
    (get(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'refused')!.textContent).toContain('Chrome is not installed');
    expect(boxes(el)[1].value).toBe('<p>typed</p>');
    expect(navigate).not.toHaveBeenCalled();
    expect((get(el, 'create') as HTMLButtonElement).disabled).toBe(false);
  });

  it('is in Spanish when the host is', async () => {
    const { el } = await create({}, 'es');
    expect(el.querySelector('h1')!.textContent).toContain('Nueva parte desde cero');
    expect(get(el, 'create')!.textContent).toContain('Crear el borrador');
  });
});
