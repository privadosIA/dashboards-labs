import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { ImportPreview } from '../../core/api.models';
import { ImportWizardComponent } from './import-wizard.component';

const PREVIEW: ImportPreview = {
  yaml: 'project: web-import\nscenes:\n  - id: intro\n',
  report: 'Imported 2 scenes',
  entries: [
    { id: 'intro', mapped: ['tts_text ← Dialogue'], discarded: ['Camera/style: pan left'] },
    { id: 'roto', mapped: [], discarded: [], rejected: 'unresolved placeholder' },
  ],
  imported: 2,
  silent: 1,
  rejected: 1,
};

type WizardApi = {
  onFile(input: { files: File[] }): Promise<void>;
  runPreview(): Promise<void>;
  setMode(mode: 'video' | 'motion' | 'music'): void;
  toConfirm(): void;
  confirm(): Promise<void>;
};

describe('ImportWizardComponent', () => {
  const close = vi.fn();
  let http: HttpTestingController;
  let fixture: ComponentFixture<ImportWizardComponent>;
  let cmp: WizardApi;

  beforeEach(async () => {
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [ImportWizardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportWizardComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as WizardApi;
  });

  afterEach(() => http.verify());

  async function uploadAndPreview(): Promise<void> {
    const file = new File(['[["intro","t","","prompt"]]'], 'dataset.json', {
      type: 'application/json',
    });
    await cmp.onFile({ files: [file] });
    const done = cmp.runPreview();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/import/preview' });
    expect(req.request.body.content).toContain('intro');
    expect(req.request.body.project).toBe('dataset');
    req.flush(PREVIEW);
    await done;
    fixture.detectChanges();
  }

  it('previews the mapping report before creating anything', async () => {
    await uploadAndPreview();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Importadas: 2');
    expect(text).toContain('rechazadas: 1');
    expect(text).toContain('tts_text ← Dialogue');
    expect(text).toContain('descartado: Camera/style: pan left');
    expect(text).toContain('unresolved placeholder');
    expect(text).toContain('project: web-import');
    http.expectNone({ method: 'POST', url: '/api/import/confirm' });
  });

  it('surfaces the server import error and creates nothing', async () => {
    const file = new File(['<html>no data</html>'], 'bad.html');
    await cmp.onFile({ files: [file] });
    const done = cmp.runPreview().catch(() => 'rejected');
    await Promise.resolve();
    http
      .expectOne({ method: 'POST', url: '/api/import/preview' })
      .flush(
        { error: { code: 'validation_failed', message: 'import: no scene dataset found' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(await done).toBe('rejected');
    http.expectNone({ method: 'POST', url: '/api/import/confirm' });
  });

  it('confirm sends the previewed YAML verbatim and closes with the id and the mode', async () => {
    await uploadAndPreview();
    cmp.toConfirm();
    const done = cmp.confirm();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/import/confirm' });
    expect(req.request.body).toEqual({ id: 'dataset', yaml: PREVIEW.yaml });
    req.flush({ id: 'dataset' }, { status: 201, statusText: 'Created' });
    await done;
    expect(close).toHaveBeenCalledWith({ id: 'dataset', mode: 'video' });
  });

  it('a music import asks the server for tracks and closes with the music mode', async () => {
    cmp.setMode('music');
    await cmp.onFile({ files: [new File(['[["a","t","","Folk"]]'], 'songs.json')] });
    const done = cmp.runPreview();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/import/preview' });
    expect(req.request.body.mode).toBe('music');
    req.flush({ ...PREVIEW, instrumental: 1 });
    await done;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('instrumentales: 1');
    cmp.toConfirm();
    const confirm = cmp.confirm();
    await Promise.resolve();
    http.expectOne({ method: 'POST', url: '/api/import/confirm' }).flush({ id: 'songs' }, { status: 201, statusText: 'Created' });
    await confirm;
    expect(close).toHaveBeenCalledWith({ id: 'songs', mode: 'music' });
  });

  it('a graphics import asks the server for animated graphics, shows its hint and opens the scene editor', async () => {
    cmp.setMode('motion');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="motion-hint"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="music-hint"]')).toBeNull();
    await cmp.onFile({ files: [new File(['[["a","t","","A bar chart\\nDuration: 3"]]'], 'graphics.json')] });
    const done = cmp.runPreview();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/import/preview' });
    expect(req.request.body.mode).toBe('motion');
    req.flush(PREVIEW);
    await done;
    cmp.toConfirm();
    const confirm = cmp.confirm();
    await Promise.resolve();
    http.expectOne({ method: 'POST', url: '/api/import/confirm' }).flush({ id: 'graphics' }, { status: 201, statusText: 'Created' });
    await confirm;
    expect(close).toHaveBeenCalledWith({ id: 'graphics', mode: 'motion' });
  });
});
