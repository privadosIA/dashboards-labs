import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectConfig } from '../../core/api.models';
import { EditorStore } from '../editor.store';
import { BgmPanelComponent } from './bgm-panel.component';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
};

describe('BgmPanelComponent', () => {
  let fixture: ComponentFixture<BgmPanelComponent>;
  let store: EditorStore;
  let http: HttpTestingController;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  async function open(bgm?: ProjectConfig['bgm']) {
    TestBed.configureTestingModule({
      imports: [BgmPanelComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: { ...structuredClone(CONFIG), bgm }, valid: true });
    await loading;
    fixture = TestBed.createComponent(BgmPanelComponent);
    fixture.detectChanges();
    // the panel is closed until opened
    (q('mat-expansion-panel-header') as HTMLElement).click();
    http.expectOne('/api/projects/demo/sources').flush({ sources: [{ name: 'theme.mp3', size: 1, modified: '' }] });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('shows nothing to set while there is no soundtrack', async () => {
    await open();
    expect(q('[data-testid=bgm-prompt]')).toBeNull();
    expect(q('[data-testid=bgm-file]')).toBeNull();
    expect(q('[data-testid=bgm-volume]')).toBeNull();
  });

  it('a generated soundtrack shows the prompt, the mix and the seed', async () => {
    await open({ prompt: 'calm piano' });
    expect((q('[data-testid=bgm-prompt]') as HTMLTextAreaElement).value).toBe('calm piano');
    for (const id of ['volume', 'fade', 'seed', 'ducking']) expect(q(`[data-testid=bgm-${id}]`), id).toBeTruthy();
    expect(q('[data-testid=bgm-file]')).toBeNull();
  });

  it('a file shows the source selector, the player and no seed', async () => {
    await open({ file: 'theme.mp3' });
    expect(q('[data-testid=bgm-file]')).toBeTruthy();
    expect(q('[data-testid=bgm-upload]')).toBeTruthy();
    expect(q('mo-audio-player')).toBeTruthy();
    expect(q('[data-testid=bgm-seed]')).toBeNull();
  });

  it('offers a YouTube address and the added audio becomes the soundtrack file', async () => {
    await open({ file: 'theme.mp3' });
    expect(q('[data-testid=source-url]')).toBeTruthy();
    const input = q('[data-testid=source-url-input]') as HTMLInputElement;
    input.value = 'https://youtu.be/dQw4w9WgXcQ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (q('[data-testid=source-url-add]') as HTMLButtonElement).click();
    http.expectOne('/api/projects/demo/sources/from-url').flush({ name: 'tema-nuevo.mp3' }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    http.expectOne('/api/projects/demo/sources').flush({ sources: [{ name: 'tema-nuevo.mp3', size: 1, modified: '' }] });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r)); // the parent patches after the list is refreshed
    expect(store.config()!.bgm?.file).toBe('tema-nuevo.mp3');
  });

  it('typing the prompt and the volume edits the project', async () => {
    await open({ prompt: '' });
    const prompt = q('[data-testid=bgm-prompt]') as HTMLTextAreaElement;
    prompt.value = 'rain and piano';
    prompt.dispatchEvent(new Event('change'));
    const volume = q('[data-testid=bgm-volume]') as HTMLInputElement;
    volume.value = '0.4';
    volume.dispatchEvent(new Event('change'));
    expect(store.config()!.bgm).toMatchObject({ prompt: 'rain and piano', volume: 0.4 });
  });

  it('unchecking the ducking writes false and checking it again leaves the default', async () => {
    await open({ prompt: 'p' });
    (q('[data-testid=bgm-ducking] input') as HTMLInputElement).click();
    expect(store.config()!.bgm?.ducking).toBe(false);
    (q('[data-testid=bgm-ducking] input') as HTMLInputElement).click();
    expect(store.config()!.bgm?.ducking).toBeUndefined();
  });

  it('says what the server rejected about the soundtrack', async () => {
    await open({ prompt: 'p' });
    store.serverError.set({ message: 'config: bgm: volume must be between 0 and 1, got 3\nconfig: scene "a" has an empty prompt', sceneId: null });
    fixture.detectChanges();
    const text = q('[data-testid=bgm-error]')?.textContent ?? '';
    expect(text).toContain('volume must be between 0 and 1');
    expect(text).not.toContain('scene "a"');
  });

  it('asks for a prompt before it can be saved', async () => {
    await open({ prompt: '' });
    expect(fixture.nativeElement.textContent).toContain('Describe la música');
  });
});
