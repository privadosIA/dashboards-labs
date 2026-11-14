import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { firstValueFrom } from 'rxjs';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../../testing/memory-storage';
import { NewPartDialog } from './new-part-dialog';
import { PART_TEMPLATE } from './template';

/** The window on the in-memory adapter, whose drafts end as the sentence says (see `askDraft`) and are written in `writeMs`. */
async function create(lang: 'es' | 'en' = 'en') {
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ writeMs: 300, pollMs: 10 });
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, provideServerConnection({ lang }), { provide: ANIMATION, useValue: port }] });
  const fixture: ComponentFixture<NewPartDialog> = TestBed.createComponent(NewPartDialog);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const approved: string[] = [];
  fixture.componentInstance.approved.subscribe((n) => approved.push(n));
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = (check: () => void) =>
    vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 3000 },
    );
  const write = (id: string, value: string) => {
    const field = q(id) as HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const ask = async (sentence: string) => {
    write('new-part-request', sentence);
    q('new-part-ask')!.click();
    await settle(() => expect(q('draft')).not.toBeNull());
  };
  return { fixture, el, port, q, settle, write, ask, approved };
}

describe('NewPartDialog', () => {
  beforeAll(() => {
    // the test DOM has no modal dialogs: a dialog is open when it has the attribute
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks for a part, follows the draft while it is written and shows its pictures, manifest and fragment when it is ready', async () => {
    const { q, ask, settle, port } = await create();
    expect((q('new-part-ask') as HTMLButtonElement).disabled).toBe(true);
    await ask('a row of bars that jump on the beat');
    expect(q('draft-state')!.textContent).toContain('Being written');
    expect(q('draft-writing')!.textContent).toContain('it can take a minute');
    await settle(() => expect(q('draft-pictures')).not.toBeNull());
    expect(q('draft-state')!.textContent).toContain('Ready');
    expect((q('draft-manifest') as HTMLTextAreaElement).value).toContain('"name"');
    expect((q('draft-fragment') as HTMLTextAreaElement).value).not.toBe('');
    expect((await firstValueFrom(port.drafts())).map((d) => d.request)).toEqual(['a row of bars that jump on the beat']);
  });

  it('shows what the server refuses when asking, in its words, and creates nothing', async () => {
    const { q, write, settle, port } = await create();
    write('new-part-request', 'a busy sentence');
    q('new-part-ask')!.click();
    await settle(() => expect(q('new-part-refused')!.textContent).toContain('a run is active'));
    expect(q('draft')).toBeNull();
    expect(await firstValueFrom(port.drafts())).toEqual([]);
  });

  it('lists the drafts that exist and reopens one after the window was closed', async () => {
    const { fixture, q, el, ask, settle } = await create();
    await ask('a first part');
    q('new-part-back')!.click();
    fixture.detectChanges();
    await settle(() => expect(el.querySelectorAll('[data-testid="new-part-draft"]')).toHaveLength(1));
    expect(q('new-part-no-drafts')).toBeNull();
    (q('new-part-reopen') as HTMLElement).click();
    await settle(() => expect(q('draft')).not.toBeNull());
  });

  it('shows a failed draft with its error and tries again', async () => {
    const { q, ask, settle } = await create();
    await ask('this one will fail once');
    await settle(() => expect(q('draft-failed')).not.toBeNull());
    expect(q('draft-failed')!.textContent).toContain('could not write a part that passes the checks');
    q('draft-retry')!.click();
    await settle(() => expect(q('draft-pictures')).not.toBeNull());
  });

  it('shows the reason of a draft stopped by the age check, with a picture, and offers no way to approve it', async () => {
    const { fixture, q, write, settle } = await create();
    const input = q('new-part-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(q('new-part-file-name')!.textContent).toBe('p.png');
    write('new-part-request', 'a minor in the picture');
    q('new-part-ask')!.click();
    await settle(() => expect(q('draft-failed')!.textContent).toContain('shows a minor'));
    expect(q('draft-approve')).toBeNull();
  });

  it('keeps what the person wrote when the server refuses it, listing the problems, and takes a text that passes', async () => {
    const { q, ask, settle, write } = await create();
    await ask('a plain part');
    await settle(() => expect(q('draft-pictures')).not.toBeNull());
    expect((q('draft-save') as HTMLButtonElement).disabled).toBe(true);
    write('draft-manifest', '{ not json');
    expect((q('draft-save') as HTMLButtonElement).disabled).toBe(false);
    expect((q('draft-approve') as HTMLButtonElement).disabled).toBe(true);
    q('draft-save')!.click();
    await settle(() => expect(q('draft-problems')!.textContent).toContain('manifest.json: it is not valid JSON'));
    expect((q('draft-manifest') as HTMLTextAreaElement).value).toBe('{ not json');
    q('draft-template')!.click();
    q('draft-save')!.click();
    await settle(() => expect(q('draft-saved')).not.toBeNull());
    expect(q('draft-problems')).toBeNull();
    expect((q('draft-manifest') as HTMLTextAreaElement).value).toBe(PART_TEMPLATE.manifest);
    expect((q('draft-approve') as HTMLButtonElement).disabled).toBe(false);
  });

  it('approves a ready draft: the part is in the catalog, the window says which and closes, and the draft is gone', async () => {
    const { q, ask, settle, port, approved } = await create();
    await ask('a part to approve');
    await settle(() => expect(q('draft-pictures')).not.toBeNull());
    expect(q('draft-warning')!.textContent).toContain('cannot be edited or removed from here');
    const name = (JSON.parse((q('draft-manifest') as HTMLTextAreaElement).value) as { name: string }).name;
    q('draft-approve')!.click();
    await settle(() => expect(approved).toEqual([name]));
    expect((await firstValueFrom(port.catalog())).parts.map((p) => p.name)).toContain(name);
    expect(await firstValueFrom(port.drafts())).toEqual([]);
  });

  it('asks again before deleting a draft, and then deletes it from the server', async () => {
    const { q, ask, settle, port } = await create();
    await ask('a part to throw away');
    await settle(() => expect(q('draft-pictures')).not.toBeNull());
    q('draft-remove')!.click();
    await settle(() => expect(q('draft-remove')!.textContent).toContain('Delete this draft?'));
    expect(await firstValueFrom(port.drafts())).toHaveLength(1);
    q('draft-remove')!.click();
    await settle(() => expect(q('draft')).toBeNull());
    expect(await firstValueFrom(port.drafts())).toEqual([]);
  });

  it('has a short guide, and speaks Spanish', async () => {
    const en = await create();
    expect(en.q('new-part-guide')!.textContent).toContain('window.__partSeek');
    TestBed.resetTestingModule();
    const es = await create('es');
    expect(es.el.textContent).toContain('Qué tiene que dibujar');
    expect(es.q('new-part-guide')!.textContent).toContain('Cómo es una parte');
  });
});
