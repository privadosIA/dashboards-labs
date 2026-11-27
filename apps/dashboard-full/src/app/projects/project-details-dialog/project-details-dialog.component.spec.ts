import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ProjectSummary } from '../../core/api.models';
import { ClientLabelsStore } from '../../core/client-labels.store';
import { EnvironmentStore } from '../../core/environment.store';
import { ProjectsStore } from '../../core/projects.store';
import { provideAppDynamicForms } from '../../shared/dynamic/dynamic-forms.providers';
import { ProjectDetailsDialogComponent } from './project-details-dialog.component';

const PROJECT: ProjectSummary = { id: 'demo', name: 'Demo', mode: 'video', scene_count: 2, client: 'dashboard-full', adult: false };
const refusal = (status: number, message: string) => Promise.reject(new HttpErrorResponse({ status, error: { error: { code: 'x', message } } }));

describe('ProjectDetailsDialogComponent', () => {
  let fixture: ComponentFixture<ProjectDetailsDialogComponent>;
  let store: { patch: ReturnType<typeof vi.fn> };
  let ref: { close: ReturnType<typeof vi.fn> };
  let hidesAdult = false;
  const labels = { labels: signal<unknown[]>([]) };

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const settle = async () => {
    await fixture.whenStable();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const type = async (id: string, value: string) => {
    const input = (q(id)!.matches('input') ? q(id) : q(id)!.querySelector('input')) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const save = async () => {
    q<HTMLButtonElement>('details-save')!.click();
    await settle();
  };

  async function open(project: ProjectSummary = PROJECT) {
    store = { patch: vi.fn((id: string, body: object) => Promise.resolve({ ...project, ...body })) };
    ref = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ProjectDetailsDialogComponent],
      providers: [
        provideAppDynamicForms(),
        { provide: MAT_DIALOG_DATA, useValue: { project } },
        { provide: MatDialogRef, useValue: ref },
        { provide: ProjectsStore, useValue: store },
        { provide: EnvironmentStore, useValue: { hidesAdult: () => hidesAdult } },
        { provide: ClientLabelsStore, useValue: labels },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProjectDetailsDialogComponent);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    hidesAdult = false;
    labels.labels.set([]);
  });

  it('shows the project as it is now: its id, name and client', async () => {
    await open();
    expect(q('details-id')!.textContent).toContain('demo');
    expect((q('details-name')!.matches('input') ? q('details-name') : q('details-name')!.querySelector('input')) as HTMLInputElement).toHaveProperty('value', 'Demo');
    expect((q('details-client')!.matches('input') ? q('details-client') : q('details-client')!.querySelector('input')) as HTMLInputElement).toHaveProperty('value', 'dashboard-full');
  });

  it('renaming sends the name and no other field, and closes with the project the server answers', async () => {
    await open();
    await type('details-name', 'Renamed');
    await save();
    expect(store.patch).toHaveBeenCalledTimes(1);
    expect(store.patch).toHaveBeenCalledWith('demo', { name: 'Renamed' }, undefined);
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo', name: 'Renamed' }));
  });

  it('an emptied client is sent as null', async () => {
    await open();
    await type('details-client', '');
    await save();
    expect(store.patch).toHaveBeenCalledWith('demo', { client: null }, undefined);
  });

  it('sends nothing when nothing changed, and closes', async () => {
    await open();
    await save();
    expect(store.patch).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(undefined);
  });

  it('an empty name is not sent: the form says so', async () => {
    await open();
    await type('details-name', '   ');
    await save();
    expect(store.patch).not.toHaveBeenCalled();
    expect(q('details-problem')).not.toBeNull();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('a 409 (a run is active) shows the server\'s reason and keeps the dialog open with what was typed', async () => {
    await open();
    store.patch.mockImplementationOnce(() => refusal(409, 'project has an active run'));
    await type('details-name', 'Renamed');
    await save();
    expect(q('details-problem')!.textContent).toContain('project has an active run');
    expect(ref.close).not.toHaveBeenCalled();
    expect(q<HTMLButtonElement>('details-save')!.disabled).toBe(false);
    // the person can try again with the same input
    await save();
    expect(store.patch).toHaveBeenCalledTimes(2);
    expect(store.patch).toHaveBeenLastCalledWith('demo', { name: 'Renamed' }, undefined);
    expect(ref.close).toHaveBeenCalled();
  });

  it('a 422 or a 404 are shown in the server\'s words too', async () => {
    await open();
    store.patch.mockImplementationOnce(() => refusal(422, 'config: project "bad name" is not valid'));
    await type('details-name', 'bad name');
    await save();
    expect(q('details-problem')!.textContent).toContain('is not valid');
    store.patch.mockImplementationOnce(() => refusal(404, 'project "demo" not found'));
    await save();
    expect(q('details-problem')!.textContent).toContain('not found');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('sends a new label, or an existing one, as the client of the project', async () => {
    await open();
    await type('details-client', 'claude-test');
    await save();
    expect(store.patch).toHaveBeenCalledWith('demo', { client: 'claude-test' }, undefined);
  });

  it('tells the store what the item is, so an animation is relabelled by its own route', async () => {
    await open({ ...PROJECT, id: 'sample-piece', name: 'Sample', kind: 'music_motion' });
    await type('details-client', 'other-app');
    await save();
    expect(store.patch).toHaveBeenCalledWith('sample-piece', { client: 'other-app' }, 'music_motion');
  });

  it('does not send a label with capitals, spaces or more than 32 characters, and says what a label may contain', async () => {
    await open();
    for (const bad of ['Not Valid', 'a'.repeat(33), 'Claude']) {
      await type('details-client', bad);
      await save();
      expect(q('details-problem')!.textContent).toMatch(/32|minúsculas/);
    }
    expect(store.patch).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('offers the labels the server knows while the client is typed', async () => {
    labels.labels.set([{ name: 'other-app' }, { name: 'claude-test' }]);
    await open();
    const options = Array.from(el().querySelectorAll('datalist#details-client-labels option')).map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['other-app', 'claude-test']);
    const input = (q('details-client')!.matches('input') ? q('details-client') : q('details-client')!.querySelector('input')) as HTMLInputElement;
    expect(input.getAttribute('list')).toBe('details-client-labels');
  });

  it('a 409 on a label change (the item runs) shows the server\'s reason and leaves the dialog open', async () => {
    await open();
    store.patch.mockImplementationOnce(() => refusal(409, 'generation "api-gen-1" has an active run'));
    await type('details-client', 'claude-test');
    await save();
    expect(q('details-problem')!.textContent).toContain('has an active run');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('works for a project that cannot be read: the server decides', async () => {
    await open({ id: 'broken', name: '', mode: '', scene_count: 0, invalid: true, error: 'yaml: line 3', client: 'embedded' });
    await type('details-name', 'Fixed name');
    await save();
    expect(store.patch).toHaveBeenCalledWith('broken', { name: 'Fixed name' }, undefined);
  });

  it('a server that hides adult content does not offer the label for people over 18', async () => {
    hidesAdult = true;
    await open();
    const adult = fixture.componentInstance['schema']().fields.find((f) => (f as { key?: string }).key === 'adult') as { options: unknown[] };
    expect(adult.options).toEqual([
      { value: '', label: 'Sin revisar' },
      { value: 'false', label: 'Apto para todos' },
    ]);
  });
});
