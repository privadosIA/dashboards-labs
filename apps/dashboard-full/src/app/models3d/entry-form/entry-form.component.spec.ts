import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import type { ModelEntry, SourceInfo } from '../../core/api.models';
import type { EntryProblems } from '../models3d-validators';
import { EntryFormComponent } from './entry-form.component';

const NONE: EntryProblems = { id: '', source: '', prompt: '', variants: '' };
const PICTURES: SourceInfo[] = [{ name: 'gato.png', kind: 'image', size: 1, modified: '' }, { name: 'perro.jpg', kind: 'image', size: 1, modified: '' }];

describe('EntryFormComponent (in Spanish: the app’s translation is loaded)', () => {
  let fixture: ComponentFixture<EntryFormComponent>;
  let changes: ModelEntry[];
  let uploads: File[];
  let events: string[];
  const q = (id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  async function settle(ms = 0): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, ms));
    TestBed.tick();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(entry: ModelEntry, extra: { problems?: EntryProblems; refusal?: string } = {}): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'es' })] });
    fixture = TestBed.createComponent(EntryFormComponent);
    changes = [];
    uploads = [];
    events = [];
    fixture.componentInstance.changed.subscribe((e) => changes.push(e));
    fixture.componentInstance.upload.subscribe((f) => uploads.push(f));
    fixture.componentInstance.remove.subscribe(() => events.push('remove'));
    fixture.componentInstance.duplicate.subscribe(() => events.push('duplicate'));
    fixture.componentInstance.makeOne.subscribe(() => events.push('make'));
    fixture.componentRef.setInput('entry', entry);
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('problems', extra.problems ?? NONE);
    fixture.componentRef.setInput('pictures', PICTURES);
    fixture.componentRef.setInput('refusal', extra.refusal ?? '');
    fixture.detectChanges();
    await settle(5);
  }

  function field(id: string): HTMLInputElement {
    const host = q(id) as HTMLElement;
    return (host.matches('input,textarea') ? host : host.querySelector('input,textarea')) as HTMLInputElement;
  }

  async function type(id: string, value: string): Promise<void> {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('blur'));
    await settle();
  }

  it('shows a text entry with its fields, and no picture choice', async () => {
    await open({ id: 'patin', prompt: 'a retro roller skate', variants: 2, seed: 7 });
    expect(field('entry-id').value).toBe('patin');
    expect(field('entry-prompt').value).toBe('a retro roller skate');
    expect(q('entry-image')).toBeNull();
    expect(q('entry-variants')).not.toBeNull();
  });

  it('hands over the whole entry when something changes, trimmed, with only what was set', async () => {
    await open({ id: 'patin', prompt: 'x' });
    await type('entry-id', '  copa ');
    await type('entry-prompt', 'a golden trophy');
    const last = changes.at(-1) as ModelEntry;
    expect(last).toEqual({ id: 'copa', prompt: 'a golden trophy' });
  });

  it('shows a picture entry with the project’s pictures and no text nor variants', async () => {
    await open({ id: 'gato', image: 'gato.png' });
    expect(q('entry-prompt')).toBeNull();
    expect(q('entry-variants')).toBeNull();
    const options = [...(q('entry-image') as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toEqual(['', 'gato.png', 'perro.jpg']);
    expect((q('entry-image') as HTMLSelectElement).value).toBe('gato.png');
  });

  it('keeps one of the text and the picture: changing the source drops the other', async () => {
    await open({ id: 'patin', prompt: 'a retro roller skate', variants: 3 });
    (q('entry-source-picture') as HTMLElement).querySelector('button')?.click();
    await settle(5);
    expect(changes.at(-1)).toEqual({ id: 'patin', image: '', prompt: undefined, variants: undefined });
    expect(q('entry-image')).not.toBeNull();
    (q('entry-source-text') as HTMLElement).querySelector('button')?.click();
    await settle(5);
    expect(changes.at(-1)?.image).toBeUndefined();
  });

  it('chooses a picture of the project and drops the text', async () => {
    await open({ id: 'gato', image: '' });
    const select = q('entry-image') as HTMLSelectElement;
    select.value = 'perro.jpg';
    select.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual({ id: 'gato', image: 'perro.jpg', prompt: undefined, variants: undefined });
  });

  it('asks for the upload of a picture to the project', async () => {
    await open({ id: 'gato', image: '' });
    const input = q('entry-upload') as HTMLInputElement;
    const file = new File(['x'], 'nuevo.png');
    Object.defineProperty(input, 'files', { value: { item: () => file, length: 1 }, configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(uploads).toEqual([file]);
  });

  it('shows the problems of the entry in words and a refusal of the server as it came', async () => {
    await open({ id: 'Bad', prompt: '' }, { problems: { id: 'Letras minúsculas…', source: 'Escribe el texto…', prompt: '', variants: '' }, refusal: 'config: models[0].id: …' });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="entry-problem"]').length).toBe(2);
    expect(q('entry-refusal')?.textContent).toContain('models[0].id');
  });

  it('says what it wants done with it: make this one, duplicate, remove', async () => {
    await open({ id: 'patin', prompt: 'x' });
    (q('entry-make') as HTMLElement).click();
    (q('entry-duplicate') as HTMLElement).click();
    (q('entry-remove') as HTMLElement).click();
    expect(events).toEqual(['make', 'duplicate', 'remove']);
  });

  it('shows what the project holds when it changes under the form (a duplicate shifts the entries)', async () => {
    await open({ id: 'patin', prompt: 'a retro roller skate' });
    fixture.componentRef.setInput('entry', { id: 'copa', prompt: 'a golden trophy' });
    fixture.detectChanges();
    await settle(5);
    expect(field('entry-id').value).toBe('copa');
    expect(changes).toEqual([]);
  });

  it('stays a picture entry while the picture is not chosen yet, when the page hands the entry back', async () => {
    await open({ id: 'patin', prompt: 'x' });
    (q('entry-source-picture') as HTMLElement).querySelector('button')?.click();
    await settle(5);
    fixture.componentRef.setInput('entry', changes.at(-1) as ModelEntry);
    fixture.detectChanges();
    await settle(5);
    expect(q('entry-image')).not.toBeNull();
    expect(q('entry-prompt')).toBeNull();
  });
});
