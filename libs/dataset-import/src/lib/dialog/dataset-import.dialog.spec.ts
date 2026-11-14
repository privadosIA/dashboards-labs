import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, map, of, throwError } from 'rxjs';

import { InMemoryDataset } from '../in-memory.adapter';
import type { DatasetMode } from '../model';
import { DatasetFailed, type DatasetPort } from '../port';
import { DATASET_ENTRY_SINK, DATASET_IMPORT_OPTIONS, DATASET_PORT } from '../tokens';
import { DatasetImportDialog } from './dataset-import.dialog';

const close = vi.fn();

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
  }
  fixture.detectChanges();
}

async function draw(options: { lang?: 'es' | 'en'; mode?: DatasetMode; port?: DatasetPort; sink?: (entry: unknown) => void } = {}) {
  close.mockClear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DATASET_IMPORT_OPTIONS, useValue: { lang: options.lang ?? 'en', mode: options.mode ?? 'music' } },
      { provide: DATASET_PORT, useValue: options.port ?? new InMemoryDataset() },
      { provide: MatDialogRef, useValue: { close } },
      ...(options.sink ? [{ provide: DATASET_ENTRY_SINK, useValue: options.sink }] : []),
    ],
  });
  const fixture = TestBed.createComponent(DatasetImportDialog);
  await settle(fixture);
  return fixture;
}

const q = <T extends HTMLElement>(f: ComponentFixture<unknown>, sel: string) => (f.nativeElement as HTMLElement).querySelector<T>(sel);

async function chooseFile(fixture: ComponentFixture<unknown>, name = 'canciones de verano.json', content = '{"a":1}\n{"b":2}\n{"c":3}\n{"d":4}') {
  const input = q<HTMLInputElement>(fixture, '[data-testid=dataset-file]')!;
  Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-error]') || q(fixture, '[data-testid=dataset-counts]')).toBeTruthy());
  await settle(fixture);
}

async function type(fixture: ComponentFixture<unknown>, value: string) {
  const input = q<HTMLInputElement>(fixture, '[data-testid=dataset-name]')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('DatasetImportDialog', () => {
  it('starts asking for a file, with the words of its mode', async () => {
    const fixture = await draw();
    expect(q(fixture, 'h2')!.textContent).toContain('Import a dataset');
    expect(q(fixture, '.lead')!.textContent).toContain('songs');
    expect(q<HTMLInputElement>(fixture, '[data-testid=dataset-file]')!.accept).toContain('.json');
    expect(q(fixture, '[data-testid=dataset-counts]')).toBeNull();
  });

  it('talks about scenes for a video', async () => {
    const fixture = await draw({ mode: 'video' });
    expect(q(fixture, '.lead')!.textContent).toContain('scenes');
  });

  it('is in Spanish when the dashboard is', async () => {
    const fixture = await draw({ lang: 'es' });
    expect(q(fixture, 'h2')!.textContent).toContain('Importar un dataset');
  });

  describe('once a file is chosen', () => {
    it('shows the server\'s counts before anything is created, and suggests a name from the file', async () => {
      const fixture = await draw();
      await chooseFile(fixture);
      const counts = q(fixture, '[data-testid=dataset-counts]')!.textContent!;
      expect(counts).toContain('4');
      expect(counts).toContain('Entries');
      expect(counts).toContain('Instrumental');
      expect(q(fixture, '[data-testid=dataset-report]')!.textContent).toContain('Read 4 entries');
      expect(q<HTMLInputElement>(fixture, '[data-testid=dataset-name]')!.value).toBe('canciones-de-verano');
      expect(q(fixture, '[data-testid=dataset-created]')).toBeNull();
    });

    it('calls the quiet entries silent for a video', async () => {
      const fixture = await draw({ mode: 'video' });
      await chooseFile(fixture);
      expect(q(fixture, '[data-testid=dataset-counts]')!.textContent).toContain('Silent');
    });

    it('cannot create the project with a name the server would not take', async () => {
      const fixture = await draw();
      await chooseFile(fixture);
      await type(fixture, 'mi proyecto');
      expect(q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.disabled).toBe(true);
      expect(q(fixture, '.bad')).toBeTruthy();
      await type(fixture, 'mi-proyecto');
      expect(q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.disabled).toBe(false);
    });

    it('creates the project and says which one, and Done closes with its id', async () => {
      const fixture = await draw();
      await chooseFile(fixture);
      q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.click();
      await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-created]')).toBeTruthy());
      await settle(fixture);
      expect(q(fixture, '[data-testid=dataset-created]')!.textContent).toContain('4 songs were created in the project canciones-de-verano');
      q<HTMLButtonElement>(fixture, '[data-testid=dataset-done]')!.click();
      expect(close).toHaveBeenCalledWith('canciones-de-verano');
    });

    describe('taking the first entry into a form', () => {
      const withYaml = (yaml: string): DatasetPort => {
        const ok = new InMemoryDataset();
        return { preview: (c, m) => ok.preview(c, m).pipe(map((p) => ({ ...p, yaml }))), confirm: (id) => ok.confirm(id) };
      };
      const yaml = 'tracks:\n  - id: "1"\n    prompt: Synthpop de los 80\n    lyrics: Luces de neón\n';

      it('hands it to the dashboard once the project is created, and says so', async () => {
        const sink = vi.fn();
        const fixture = await draw({ port: withYaml(yaml), sink });
        await chooseFile(fixture);
        q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.click();
        await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-filled]')).toBeTruthy());
        expect(sink).toHaveBeenCalledWith({ title: '', style: 'Synthpop de los 80', tags: '', lyrics: 'Luces de neón' });
        expect(q(fixture, '[data-testid=dataset-filled]')!.textContent).toContain('Custom form has been filled');
      });

      it('hands over nothing, and says nothing, when the dashboard has no form to fill', async () => {
        const fixture = await draw({ port: withYaml(yaml) });
        await chooseFile(fixture);
        q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.click();
        await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-created]')).toBeTruthy());
        expect(q(fixture, '[data-testid=dataset-filled]')).toBeNull();
      });

      it('leaves the form as it was when the file gave no usable entry', async () => {
        const sink = vi.fn();
        const fixture = await draw({ sink });
        await chooseFile(fixture);
        q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.click();
        await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-created]')).toBeTruthy());
        expect(sink).not.toHaveBeenCalled();
      });
    });

    it('lets another file be chosen', async () => {
      const fixture = await draw();
      await chooseFile(fixture);
      q<HTMLButtonElement>(fixture, '[data-testid=dataset-again]')!.click();
      await settle(fixture);
      expect(q(fixture, '[data-testid=dataset-counts]')).toBeNull();
      expect(q(fixture, '[data-testid=dataset-choose]')).toBeTruthy();
    });
  });

  describe('when something goes wrong', () => {
    const failing = (kind: DatasetFailed['kind'], on: 'preview' | 'confirm'): DatasetPort => {
      const ok = new InMemoryDataset();
      return {
        preview: (c, m): Observable<never> | ReturnType<InMemoryDataset['preview']> => (on === 'preview' ? throwError(() => new DatasetFailed(kind)) : ok.preview(c, m)),
        confirm: (id): Observable<string> => (on === 'confirm' ? throwError(() => new DatasetFailed(kind)) : of(id)),
      };
    };

    it('says a file the server cannot read was rejected and keeps the file step open', async () => {
      const fixture = await draw({ port: failing('rejected', 'preview') });
      await chooseFile(fixture);
      expect(q(fixture, '[data-testid=dataset-error]')!.textContent).toContain('could not read');
      expect(q(fixture, '[data-testid=dataset-choose]')).toBeTruthy();
    });

    it('shows the server\'s own reason when it refuses the file, so that the person knows what to change', async () => {
      const ok = new InMemoryDataset();
      const port: DatasetPort = { preview: (c, m) => ok.preview(c, m), confirm: () => throwError(() => new DatasetFailed('rejected', 'config: scene "1" has animate: true but defaults.animate is not set')) };
      const fixture = await draw({ port });
      await chooseFile(fixture);
      q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.click();
      await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-error]')).toBeTruthy());
      await settle(fixture);
      expect(q(fixture, '[data-testid=dataset-reason]')!.textContent).toContain('defaults.animate is not set');
      expect(q(fixture, '[data-testid=dataset-name]')).toBeTruthy();
    });

    it('says a name that is taken and keeps the report so that another can be written', async () => {
      const fixture = await draw({ port: failing('taken', 'confirm') });
      await chooseFile(fixture);
      q<HTMLButtonElement>(fixture, '[data-testid=dataset-confirm]')!.click();
      await vi.waitFor(() => expect(q(fixture, '[data-testid=dataset-error]')).toBeTruthy());
      await settle(fixture);
      expect(q(fixture, '[data-testid=dataset-error]')!.textContent).toContain('already a project');
      expect(q(fixture, '[data-testid=dataset-name]')).toBeTruthy();
    });

    it('says the server cannot be reached', async () => {
      const fixture = await draw({ lang: 'es', port: failing('unreachable', 'preview') });
      await chooseFile(fixture);
      expect(q(fixture, '[data-testid=dataset-error]')!.textContent).toContain('No se llega al servidor');
    });
  });

  it('closes without a project from the cross', async () => {
    const fixture = await draw();
    q<HTMLButtonElement>(fixture, '[data-testid=dataset-close]')!.click();
    expect(close).toHaveBeenCalledWith(undefined);
  });
});
