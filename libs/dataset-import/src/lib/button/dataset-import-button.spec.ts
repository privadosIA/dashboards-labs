import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { InMemoryDataset } from '../in-memory.adapter';
import { DATASET_IMPORT_OPTIONS, DATASET_PORT } from '../tokens';
import { DatasetImportButton } from './dataset-import-button';

function setup(lang: 'es' | 'en') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DATASET_IMPORT_OPTIONS, useValue: { lang, mode: 'music' } },
      { provide: DATASET_PORT, useValue: new InMemoryDataset() },
    ],
  });
  const fixture = TestBed.createComponent(DatasetImportButton);
  fixture.detectChanges();
  return fixture;
}

describe('DatasetImportButton', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('says Import dataset in the dashboard\'s language', () => {
    expect(setup('en').nativeElement.textContent).toContain('Import dataset');
    expect(setup('es').nativeElement.textContent).toContain('Importar dataset');
  });

  it('opens the import dialog', async () => {
    const fixture = setup('en');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=dataset-open]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid=dataset-choose]')).toBeTruthy());
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });
});
