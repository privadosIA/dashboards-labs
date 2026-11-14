import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort, type PartText } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { MUSIC_MOTION_LINKS } from '../../core/external-links';
import { stubStorage } from '../../../testing/memory-storage';
import { userPart } from '../parts.page.spec';
import { OwnPartPage } from './own-part.page';
import { assistTestProviders } from '../../../testing/assist';

const text: PartText = { name: 'bars', manifest: '{"name":"bars","description":"A bar"}', fragment: '<div>bars</div>' };

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(overrides: Partial<AnimationPort> = {}, name = 'bars', lang: 'es' | 'en' = 'en') {
  stubStorage();
  const replacePart = vi.fn((_n: string, t: { manifest: string; fragment: string }) => of(userPart('bars', { description: 'Better' })));
  const port = { catalog: () => of({ parts: [userPart('bars'), userPart('toggle', { source: 'builtin' })] }), partText: () => of(text), replacePart, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [ ...assistTestProviders(),{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port }, { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['name', name]]) } } }],
  });
  const fixture = TestBed.createComponent(OwnPartPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, replacePart };
}
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const boxes = (el: HTMLElement) => el.querySelectorAll<HTMLTextAreaElement>('textarea');
const typeFragment = async (fixture: ComponentFixture<unknown>, el: HTMLElement, value: string) => {
  boxes(el)[1].value = value;
  boxes(el)[1].dispatchEvent(new Event('input'));
  await settle(fixture);
};

describe('OwnPartPage', () => {
  it('shows the part\'s two texts, the manifest indented', async () => {
    const { el } = await create();
    expect(el.querySelector('h1')!.textContent).toContain('bars');
    expect(boxes(el)[0].value).toBe(JSON.stringify(JSON.parse(text.manifest), null, 2));
    expect(boxes(el)[1].value).toBe('<div>bars</div>');
  });

  it('saves both texts as a replace and says the catalog has the change', async () => {
    const { fixture, el, replacePart } = await create();
    await typeFragment(fixture, el, '<div>v2</div>');
    (get(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(replacePart).toHaveBeenCalledWith('bars', { manifest: JSON.stringify(JSON.parse(text.manifest), null, 2), fragment: '<div>v2</div>' });
    expect(get(el, 'saved')).not.toBeNull();
    expect(get(el, 'description')!.textContent).toContain('Better');
  });

  it('lists the problems the server finds, one to a line, and keeps what was typed', async () => {
    const { fixture, el } = await create({ replacePart: () => throwError(() => new AnimationFailure('refused', 'part.html: it is empty\nmanifest.json: the name must stay "bars"')) });
    await typeFragment(fixture, el, '<p>typed</p>');
    (get(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.querySelectorAll('[data-testid="problems"] li')).toHaveLength(2);
    expect(get(el, 'problems')!.textContent).toContain('must stay');
    expect(boxes(el)[1].value).toBe('<p>typed</p>');
    expect(get(el, 'saved')).toBeNull();
  });

  it('shows a refusal that is not about the text, such as Chrome missing, in its own words', async () => {
    const { fixture, el } = await create({ replacePart: () => throwError(() => new AnimationFailure('unavailable', 'Chrome is not installed')) });
    (get(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'refused')!.textContent).toContain('Chrome is not installed');
    expect(get(el, 'problems')).toBeNull();
  });

  it('says a part that does not exist, one that comes with the program, and one that could not be read, and offers no form', async () => {
    const gone = await create({}, 'nothing');
    expect(get(gone.el, 'unavailable')!.textContent).toContain('no longer exists');
    expect(boxes(gone.el)).toHaveLength(0);
    TestBed.resetTestingModule();
    const builtin = await create({}, 'toggle');
    expect(get(builtin.el, 'unavailable')!.textContent).toContain('comes with the program');
    TestBed.resetTestingModule();
    const broken = await create({ partText: () => throwError(() => new AnimationFailure('other', 'the server did not answer')) });
    expect(get(broken.el, 'unavailable')!.textContent).toContain('could not be read');
    expect(get(broken.el, 'reason')!.textContent).toContain('did not answer');
  });

  it('has the box to ask for a change, and none where there is no text to change', async () => {
    const { el } = await create();
    expect(get(el, 'ask-change')).not.toBeNull();
    TestBed.resetTestingModule();
    const gone = await create({}, 'nothing');
    expect(get(gone.el, 'ask-change')).toBeNull();
  });

  it('is in Spanish when the host is', async () => {
    const { el } = await create({}, 'bars', 'es');
    expect(el.querySelector('h1')!.textContent).toContain('Editar la parte');
    expect(get(el, 'save')!.textContent).toContain('Guardar la parte');
  });
});

describe('OwnPartPage, Open in Vector', () => {
  const place = (part: { name: string; manifest: string; fragment: string }) => (part.fragment.includes('vector-model') ? { path: '/animation/vector/editor', query: { part: part.name } } : null);

  it('opens a vector part in the Vector editor, with its name in the address', async () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { partInVector: place } });
    const { el } = await create({ partText: () => of({ ...text, fragment: '<svg><!-- vector-model --></svg>' }) });
    const link = get(el, 'open-in-vector')!;
    expect(link.getAttribute('href')).toBe('/animation/vector/editor?part=bars');
    expect(link.textContent).toBe('Open in Vector');
  });

  it('is not offered on a part that is not a vector part, nor when the host gave no place', async () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { partInVector: place } });
    expect(get((await create()).el, 'open-in-vector')).toBeNull();
    TestBed.resetTestingModule();
    expect(get((await create({ partText: () => of({ ...text, fragment: '<svg><!-- vector-model --></svg>' }) })).el, 'open-in-vector')).toBeNull();
  });

  it('says it in Spanish', async () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { partInVector: place } });
    const { el } = await create({ partText: () => of({ ...text, fragment: '<svg><!-- vector-model --></svg>' }) }, 'bars', 'es');
    expect(get(el, 'open-in-vector')!.textContent).toBe('Abrir en Vector');
  });
});
