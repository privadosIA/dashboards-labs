import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../testing/memory-storage';
import { SongDraftStore } from '../song/draft.store';
import { InMemorySongs, type InMemoryOptions } from '../song/in-memory.adapter';
import { SONGS } from '../song/tokens';
import { CustomForm } from './custom-form';

async function draw(options: InMemoryOptions = {}): Promise<{ fixture: ComponentFixture<CustomForm>; store: SongDraftStore }> {
  stubStorage();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: SONGS, useValue: new InMemorySongs({ pace: 10, ...options }) }] });
  const fixture = TestBed.createComponent(CustomForm);
  const store = TestBed.inject(SongDraftStore);
  await settle(fixture);
  return { fixture, store };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const el = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;
const q = <T extends HTMLElement>(fixture: ComponentFixture<unknown>, sel: string) => el(fixture).querySelector<T>(sel);
const click = async (fixture: ComponentFixture<unknown>, sel: string) => {
  q<HTMLButtonElement>(fixture, sel)!.click();
  await settle(fixture);
};

async function type(fixture: ComponentFixture<unknown>, sel: string, value: string): Promise<void> {
  const field = q<HTMLTextAreaElement>(fixture, sel)!;
  field.value = value;
  field.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('CustomForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the title, the lyrics, the style and the vocal gender, with the title counter at 0/80', async () => {
    const { fixture } = await draw();
    for (const id of ['title', 'lyrics', 'style']) expect(q(fixture, `textarea[data-testid=${id}]`), id).toBeTruthy();
    expect(el(fixture).textContent).toContain('Vocal Gender');
    expect(q(fixture, '[data-testid=title-count]')!.textContent?.trim()).toBe('0/80');
  });

  it('puts what is typed in the draft, and the title counter follows', async () => {
    const { fixture, store } = await draw();
    await type(fixture, '[data-testid=title]', 'Night drive');
    await type(fixture, '[data-testid=lyrics]', '[verse]\nla la');
    expect(store.title()).toBe('Night drive');
    expect(store.lyrics()).toBe('[verse]\nla la');
    expect(q(fixture, '[data-testid=title-count]')!.textContent?.trim()).toBe('11/80');
  });

  it('stops the title at 80 characters', async () => {
    const { fixture } = await draw();
    expect(q<HTMLTextAreaElement>(fixture, '[data-testid=title]')!.getAttribute('maxlength')).toBe('80');
  });

  describe('structure tags', () => {
    it('inserts the chosen tag on its own line where the cursor is', async () => {
      const { fixture, store } = await draw();
      await type(fixture, '[data-testid=lyrics]', 'la la');
      const area = q<HTMLTextAreaElement>(fixture, '[data-testid=lyrics]')!;
      area.setSelectionRange(5, 5);
      await click(fixture, '[data-testid=structure-tags]');
      document.querySelector<HTMLButtonElement>('[data-testid=section-chorus]')!.click();
      await settle(fixture);
      expect(store.lyrics()).toBe('la la\n[chorus]\n');
      expect(area.value).toBe('la la\n[chorus]\n');
    });
  });

  describe('AI Generator', () => {
    const dialog = (sel: string) => document.querySelector<HTMLElement>(sel);
    async function openDialog(fixture: ComponentFixture<unknown>): Promise<void> {
      await click(fixture, '[data-testid=ai-generator]');
      await vi.waitFor(() => expect(dialog('[data-testid=ai-prompt]')).toBeTruthy());
      await settle(fixture);
    }
    async function typeInDialog(fixture: ComponentFixture<unknown>, value: string): Promise<void> {
      const field = dialog('[data-testid=ai-prompt]') as HTMLTextAreaElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      await settle(fixture);
    }
    const submit = () => dialog('[data-testid=ai-submit]') as HTMLButtonElement;
    afterEach(() => TestBed.inject(MatDialog).closeAll());

    it('opens a dialog to describe the lyrics, starting from the title, and cannot write from nothing', async () => {
      const { fixture } = await draw();
      await openDialog(fixture);
      expect(dialog('.ai h2')!.textContent).toContain('AI Lyrics Generator');
      expect(submit().disabled).toBe(true);
      await typeInDialog(fixture, 'A heartbreak song about summer rain');
      expect(submit().disabled).toBe(false);
    });

    it('says how much the description can hold, and the counter follows what is typed', async () => {
      const { fixture } = await draw();
      await openDialog(fixture);
      expect(dialog('[data-testid=ai-prompt-count]')!.textContent).toContain('0/2000');
      await typeInDialog(fixture, 'A heartbreak song');
      expect(dialog('[data-testid=ai-prompt-count]')!.textContent).toContain('17/2000');
    });

    it('starts the description with the title that was already written', async () => {
      const { fixture } = await draw();
      await type(fixture, '[data-testid=title]', 'Night drive');
      await openDialog(fixture);
      expect((dialog('[data-testid=ai-prompt]') as HTMLTextAreaElement).value).toBe('Night drive');
    });

    it('writes the lyrics into the form, fills an empty style, keeps the title and closes', async () => {
      const { fixture, store } = await draw();
      await type(fixture, '[data-testid=title]', 'Mine');
      await openDialog(fixture);
      await typeInDialog(fixture, 'A soothing piano melody with gentle rain');
      submit().click();
      await vi.waitFor(() => expect(store.lyrics()).toMatch(/\[verse\]/));
      await vi.waitFor(() => expect(dialog('app-ai-dialog')).toBeNull());
      await settle(fixture);
      expect(store.style()).toContain('piano');
      expect(store.title()).toBe('Mine');
      expect(q<HTMLTextAreaElement>(fixture, '[data-testid=lyrics]')!.value).toMatch(/\[verse\]/);
    });

    it('says the lyrics there will be replaced, and leaves a style that was written alone', async () => {
      const { fixture, store } = await draw();
      await type(fixture, '[data-testid=lyrics]', 'my own words');
      await type(fixture, '[data-testid=style]', 'blues');
      await openDialog(fixture);
      expect(dialog('[data-testid=ai-replaces]')).toBeTruthy();
      await typeInDialog(fixture, 'A soothing piano melody');
      submit().click();
      await vi.waitFor(() => expect(store.lyrics()).toMatch(/\[verse\]/));
      expect(store.style()).toBe('blues');
    });

    it('closes without touching the form', async () => {
      const { fixture, store } = await draw();
      await type(fixture, '[data-testid=lyrics]', 'my own words');
      await openDialog(fixture);
      dialog('[data-testid=ai-close]')!.click();
      await vi.waitFor(() => expect(dialog('app-ai-dialog')).toBeNull());
      expect(store.lyrics()).toBe('my own words');
    });

    it('explains inside the dialog why the assistant cannot, and leaves the form as it was', async () => {
      const { fixture, store } = await draw({ assistant: 'unavailable' });
      await openDialog(fixture);
      await typeInDialog(fixture, 'A soothing piano melody');
      submit().click();
      await vi.waitFor(() => expect(dialog('[data-testid=ai-error]')!.textContent).toContain('not available'));
      expect(dialog('app-ai-dialog')).toBeTruthy();
      expect(store.lyrics()).toBe('');
    });
  });

  describe('the style', () => {
    it('shows a style set from outside in the box', async () => {
      const { fixture, store } = await draw();
      store.setStyle('pop');
      await settle(fixture);
      expect(q<HTMLTextAreaElement>(fixture, '[data-testid=style]')!.value).toBe('pop');
    });

    /** The tags are in a dialog of their own: its content is in the overlay, outside the fixture. */
    const dlg = (sel: string) => document.querySelector<HTMLElement>(sel);
    async function openTags(fixture: ComponentFixture<unknown>): Promise<void> {
      await click(fixture, '[data-testid=tags-open]');
      await vi.waitFor(() => expect(dlg('[data-testid=tags-done]')).toBeTruthy());
      await settle(fixture);
    }
    const clickIn = async (fixture: ComponentFixture<unknown>, sel: string) => {
      dlg(sel)!.click();
      await settle(fixture);
    };
    afterEach(() => TestBed.inject(MatDialog).closeAll());

    it('offers the tags in a dialog, not under the style box', async () => {
      const { fixture } = await draw();
      expect(q(fixture, '[data-testid=category-genre]')).toBeNull();
      expect(q(fixture, '[data-testid=tags-open]')).toBeTruthy();
      await openTags(fixture);
      expect(dlg('[data-testid=category-genre]')).toBeTruthy();
    });

    it('adds and removes a tag of a category, which shows as picked', async () => {
      const { fixture, store } = await draw();
      await openTags(fixture);
      await clickIn(fixture, '[data-testid=category-genre]');
      await clickIn(fixture, '[data-testid=tag-pop]');
      expect(store.style()).toBe('pop');
      expect(dlg('[data-testid=tag-pop]')!.getAttribute('aria-pressed')).toBe('true');
      expect(dlg('[data-testid=tags-current]')!.textContent).toContain('pop');
      expect(q<HTMLTextAreaElement>(fixture, '[data-testid=style]')!.value).toBe('pop');
      await clickIn(fixture, '[data-testid=tag-pop]');
      expect(store.style()).toBe('');
    });

    it('opens on the popular combinations and shows the tags of the category that is chosen', async () => {
      const { fixture } = await draw();
      await openTags(fixture);
      expect(dlg('[data-testid=combos]')).toBeTruthy();
      await clickIn(fixture, '[data-testid=category-genre]');
      expect(dlg('[data-testid=tag-pop]')).toBeTruthy();
      await clickIn(fixture, '[data-testid=category-mood]');
      expect(dlg('[data-testid=tag-happy]')).toBeTruthy();
      expect(dlg('[data-testid=tag-pop]')).toBeNull();
    });

    it('adds every tag of a popular combination', async () => {
      const { fixture, store } = await draw();
      await openTags(fixture);
      await clickIn(fixture, '[data-testid=combo-jazz-cafe]');
      expect(store.style()).toBe('jazz, piano, saxophone, calm');
    });

    it('takes the tags of a combination out when it is pressed again', async () => {
      const { fixture, store } = await draw();
      await openTags(fixture);
      await clickIn(fixture, '[data-testid=combo-jazz-cafe]');
      expect(dlg('[data-testid=combo-jazz-cafe]')!.getAttribute('aria-pressed')).toBe('true');
      await clickIn(fixture, '[data-testid=combo-jazz-cafe]');
      expect(store.style()).toBe('');
      expect(dlg('[data-testid=combo-jazz-cafe]')!.getAttribute('aria-pressed')).toBe('false');
    });

    it('closes with Done and keeps what was picked', async () => {
      const { fixture, store } = await draw();
      await openTags(fixture);
      await clickIn(fixture, '[data-testid=combo-jazz-cafe]');
      await clickIn(fixture, '[data-testid=tags-done]');
      await vi.waitFor(() => expect(dlg('[data-testid=tags-done]')).toBeNull());
      expect(store.style()).toBe('jazz, piano, saxophone, calm');
    });

    it('shows a voice tag as the gender and the gender as a voice tag', async () => {
      const { fixture, store } = await draw();
      await type(fixture, '[data-testid=style]', 'pop, female vocal');
      expect(store.gender()).toBe('female');
      store.setGender('male');
      await settle(fixture);
      expect(q<HTMLTextAreaElement>(fixture, '[data-testid=style]')!.value).toBe('pop, male vocal');
    });

    it('reads the voice tags from the vocabulary of the server', async () => {
      const { store } = await draw({ vocabulary: { categories: [{ id: 'vocal', tags: ['woman voice', 'man voice'] }], combos: [] } });
      store.setGender('female');
      // the vocabulary has no female/male tag by those names: the style is left alone
      expect(store.style()).toBe('');
    });

    it('keeps the tags button and the gender whichever generator is chosen, so they do not come and go while the server answers', async () => {
      const { fixture, store } = await draw();
      for (const generator of ['ace-step', 'diffrhythm2', 'heartmula'] as const) {
        store.setGenerator(generator);
        await settle(fixture);
        expect(q(fixture, '[data-testid=tags-open]'), generator).toBeTruthy();
        expect(el(fixture).textContent, generator).toContain('Vocal Gender');
      }
    });
  });
});
