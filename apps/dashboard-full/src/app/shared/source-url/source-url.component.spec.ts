import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SourceUrlComponent } from './source-url.component';

describe('SourceUrlComponent', () => {
  let fixture: ComponentFixture<SourceUrlComponent>;
  let http: HttpTestingController;
  let added: string[];
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector<T>(`[data-testid=${id}]`);
  const URL_OK = 'https://youtu.be/dQw4w9WgXcQ';
  const ENDPOINT = '/api/projects/songs/sources/from-url';

  async function type(value: string): Promise<void> {
    const input = q<HTMLInputElement>('source-url-input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SourceUrlComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SourceUrlComponent);
    fixture.componentRef.setInput('projectId', 'songs');
    added = [];
    fixture.componentInstance.added.subscribe((n: string) => added.push(n));
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('keeps Añadir off until something is typed and reminds about the rights', async () => {
    expect(q<HTMLButtonElement>('source-url-add')!.disabled).toBe(true);
    expect(el().textContent).toContain('material del que tengas derechos');
    await type(URL_OK);
    expect(q<HTMLButtonElement>('source-url-add')!.disabled).toBe(false);
  });

  it('posts the address, shows the wait and emits the stored name', async () => {
    await type(`  ${URL_OK}  `);
    q('source-url-add')!.click();
    fixture.detectChanges();
    const req = http.expectOne(ENDPOINT);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ url: URL_OK });
    expect(q('source-url-wait')).not.toBeNull();
    expect(q('source-url-add')).toBeNull();
    req.flush({ name: 'mi-cancion.mp3' }, { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(added).toEqual(['mi-cancion.mp3']);
    expect(q('source-url-wait')).toBeNull();
    expect(q<HTMLInputElement>('source-url-input')!.value).toBe('');
  });

  it('explains a refusal next to the field with the server message and keeps the address', async () => {
    await type(URL_OK);
    q('source-url-add')!.click();
    http.expectOne(ENDPOINT).flush(
      { error: { code: 'validation_failed', message: 'YouTube asks for a sign-in for this video' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    fixture.detectChanges();
    expect(q('source-url-error')!.textContent).toContain('asks for a sign-in');
    expect(added).toEqual([]);
    expect(q<HTMLInputElement>('source-url-input')!.value).toBe(URL_OK);
    await type(URL_OK + 'x');
    expect(q('source-url-error')).toBeNull(); // typing again clears it
  });

  it('cancelling aborts the request and makes the field usable again', async () => {
    await type(URL_OK);
    q('source-url-add')!.click();
    fixture.detectChanges();
    const req = http.expectOne(ENDPOINT);
    q('source-url-cancel')!.click();
    fixture.detectChanges();
    expect(req.cancelled).toBe(true);
    expect(q('source-url-wait')).toBeNull();
    expect(q<HTMLButtonElement>('source-url-add')!.disabled).toBe(false);
    expect(added).toEqual([]);
  });

  it('Enter in the field adds it, and a second add while waiting is ignored', async () => {
    await type(URL_OK);
    q('source-url-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    http.expectOne(ENDPOINT);
    fixture.componentInstance['add']();
    http.expectNone(ENDPOINT);
  });
});
