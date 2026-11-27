import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { GENERATION_RELABEL, type Generation, type GenerationRelabel } from '@lab/model-library-kit';
import { of } from 'rxjs';

import { ClientLabelDialogComponent } from '../shared/client-label-dialog/client-label-dialog.component';
import { ClientLabelsStore } from './client-labels.store';
import { provideGenerationRelabel } from './generation-relabel';

const GENERATION = { id: 'api-m3d-1', name: 'wooden-chest', client: 'other-app' } as Generation;

describe('provideGenerationRelabel', () => {
  let result: unknown;
  const open = vi.fn(() => ({ afterClosed: () => of(result) }));
  const labels = { loaded: () => true, load: vi.fn(), colorOf: (name: string) => (name === 'other-app' ? '#aa3355' : '#336699') };
  let host: GenerationRelabel;

  beforeEach(() => {
    open.mockClear();
    TestBed.configureTestingModule({ providers: [provideGenerationRelabel(), { provide: MatDialog, useValue: { open } }, { provide: ClientLabelsStore, useValue: labels }] });
    host = TestBed.inject(GENERATION_RELABEL);
  });

  it('gives the colour the store has for a label', () => {
    expect(host.colorOf('other-app')).toBe('#aa3355');
    expect(host.colorOf('claude-test')).toBe('#336699');
  });

  it('opens the label form for the generation and says the label changed when the form closes with true', async () => {
    result = true;
    expect(await host.relabel(GENERATION)).toBe(true);
    expect(open).toHaveBeenCalledWith(ClientLabelDialogComponent, expect.objectContaining({ data: { id: 'api-m3d-1', name: 'wooden-chest', client: 'other-app' } }));
  });

  it('says nothing changed when the form is cancelled or closed with nothing', async () => {
    result = false;
    expect(await host.relabel(GENERATION)).toBe(false);
    result = undefined;
    expect(await host.relabel(GENERATION)).toBe(false);
  });

  it('reads the labels when the store has not', () => {
    TestBed.resetTestingModule();
    labels.load.mockClear();
    TestBed.configureTestingModule({ providers: [provideGenerationRelabel(), { provide: MatDialog, useValue: { open } }, { provide: ClientLabelsStore, useValue: { ...labels, loaded: () => false } }] });
    TestBed.inject(GENERATION_RELABEL);
    expect(labels.load).toHaveBeenCalledTimes(1);
  });
});
