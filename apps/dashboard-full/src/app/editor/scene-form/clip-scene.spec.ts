import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';

import { ProjectConfig } from '../../core/api.models';
import { EditorStore } from '../editor.store';
import { toYaml } from '../../shared/project-yaml';
import { SceneFormComponent } from './scene-form.component';
import { SCENE_FORM_TEST_PROVIDERS } from './dynamic/testing/scene-form-providers';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [{ id: 'intro', prompt: 'ciudad', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 1.5, animate: true, motion_prompt: 'se mueve' }],
};

type FormApi = { setPictureMode(m: string): void };

const SOURCES = [
  { name: 'photo.jpg', kind: 'image', size: 1, modified: '' },
  { name: 'song.mp3', kind: 'audio', size: 1, modified: '' },
  { name: 'stand-up.mp4', kind: 'video', used_by: ['intro'], size: 1, modified: '' },
  { name: 'spare.mp4', kind: 'video', used_by: [], size: 1, modified: '' },
];

describe('SceneFormComponent: the scene\'s own clip', () => {
  let store: EditorStore;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;
  let cmp: FormApi;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(clip?: string) {
    TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    });
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    if (clip !== undefined) {
      cfg.scenes[0].clip = clip;
      cfg.scenes[0].animate = false;
      delete cfg.scenes[0].motion_prompt;
    }
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as FormApi;
  }

  function flushSources(kept: unknown[] = []): void {
    http.expectOne('/api/projects/demo/sources').flush({ sources: SOURCES });
    http.match((r) => r.url.startsWith('/api/clips')).forEach((r) => r.flush({ clips: kept }));
  }

  afterEach(() => http.verify());

  it('choosing My clip drops the picture, the animation and the prompt-only fields, and asks for a video before saving', async () => {
    await open();
    cmp.setPictureMode('clip');
    fixture.detectChanges();
    flushSources();
    await settle();
    const s = store.config()!.scenes[0];
    expect(s.clip).toBe('');
    expect(s.animate).toBeUndefined();
    expect(s.motion_prompt).toBeUndefined();
    expect(q('[data-testid=clip-select]')).toBeTruthy();
    expect(store.canSave()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Elige o sube un vídeo');
  });

  it('a chosen clip is written to the file and previewed; going back removes it', async () => {
    await open('stand-up.mp4');
    flushSources();
    await settle();
    expect(q('[data-testid=clip-preview]')?.getAttribute('src')).toContain('sources/stand-up.mp4');
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]['clip']).toBe('stand-up.mp4');
    cmp.setPictureMode('ai');
    expect(store.config()!.scenes[0].clip).toBeUndefined();
  });

  it('lists the videos that no scene uses so they can be deleted, and not the audio or the pictures', async () => {
    await open('stand-up.mp4');
    flushSources();
    await settle();
    expect(q('[data-testid=clip-unused]')?.textContent).toContain('spare.mp4');
    expect(q('[data-testid=clip-unused]')?.textContent).not.toContain('stand-up.mp4');
    (q('[data-testid="clip-delete-spare.mp4"]') as HTMLButtonElement).click();
    http.expectOne({ method: 'DELETE', url: '/api/projects/demo/sources/spare.mp4' }).flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/projects/demo/sources').flush({ sources: SOURCES.filter((x) => x.name !== 'spare.mp4') });
    await settle();
    expect(q('[data-testid=clip-unused]')).toBeNull();
  });

  it('a clip of another project is copied, and the scene says it is a copy', async () => {
    await open('');
    flushSources([{ project: 'other', scene: 's06', size: 1, modified: '' }]);
    await settle();
    const picker = fixture.debugElement.query((d) => d.name === 'app-clip-picker').componentInstance as unknown as { choose(v: string): Promise<void> };
    const done = picker.choose('kept:clip:other/s06');
    http.expectOne({ method: 'POST', url: '/api/projects/demo/sources/clip' }).flush({ name: 'other-s06.mp4' });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/projects/demo/sources').flush({ sources: [...SOURCES, { name: 'other-s06.mp4', kind: 'video', used_by: [], size: 1, modified: '' }] });
    await done;
    await settle();
    expect(store.config()!.scenes[0].clip).toBe('other-s06.mp4');
    expect(q('[data-testid=clip-copied]')?.textContent).toContain('other');
  });

  it('the audio pickers do not offer videos or pictures', async () => {
    await open();
    cmp.setPictureMode('clip');
    fixture.detectChanges();
    flushSources();
    await settle();
    expect(store.audioSources().map((s) => s.name)).toEqual(['song.mp3']);
  });

  it('trims the clip with two numbers, from the fields or from the instant of the preview, and says the length of the part', async () => {
    await open('stand-up.mp4');
    flushSources();
    await settle();
    const video = q('[data-testid=clip-preview]') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 2.06, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
    const start = q('[data-testid=clip-start]') as HTMLInputElement;
    start.value = '0.5';
    start.dispatchEvent(new Event('change'));
    await settle();
    expect(store.config()!.scenes[0].clip_start).toBe(0.5);
    expect(q('[data-testid=clip-part]')?.textContent).toContain('1.56');
    Object.defineProperty(video, 'currentTime', { value: 1.5, configurable: true });
    (q('[data-testid=clip-mark-end]') as HTMLButtonElement).click();
    await settle();
    expect(store.config()!.scenes[0].clip_end).toBe(1.5);
    expect(q('[data-testid=clip-part]')?.textContent).toContain('1 s');
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]['clip_start']).toBe(0.5);
    expect(doc.scenes[0]['clip_end']).toBe(1.5);
    // an empty field clears it; an end before the start blocks saving
    start.value = '';
    start.dispatchEvent(new Event('change'));
    expect(store.config()!.scenes[0].clip_start).toBeUndefined();
    start.value = '2';
    start.dispatchEvent(new Event('change'));
    await settle();
    expect(store.canSave()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('El final del clip debe ser mayor');
  });

  it('choosing another clip, or leaving My clip, drops the trim', async () => {
    await open('stand-up.mp4');
    flushSources();
    store.updateScene(0, { clip_start: 0.5, clip_end: 1.5 });
    cmp.setPictureMode('ai');
    const s = store.config()!.scenes[0];
    expect(s.clip_start).toBeUndefined();
    expect(s.clip_end).toBeUndefined();
  });

  it('an animated scene can use only part of its animation, and turning the animation off drops it', async () => {
    await open();
    await settle();
    const start = q('[data-testid=anim-start]') as HTMLInputElement;
    expect(start).toBeTruthy();
    start.value = '0.4';
    start.dispatchEvent(new Event('change'));
    const end = q('[data-testid=anim-end]') as HTMLInputElement;
    end.value = '1.6';
    end.dispatchEvent(new Event('change'));
    await settle();
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]['clip_start']).toBe(0.4);
    expect(doc.scenes[0]['clip_end']).toBe(1.6);
    expect(store.validation()!.scenes[0].clipTrim).toBeUndefined();
    (q('[data-testid=scene-animate-toggle] input') as HTMLInputElement).click();
    await settle();
    expect(store.config()!.scenes[0].clip_start).toBeUndefined();
    expect(store.config()!.scenes[0].clip_end).toBeUndefined();
  });

  it('a scene with its own clip does not show what only a generated scene uses', async () => {
    await open('stand-up.mp4');
    flushSources();
    await settle();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(q('[data-testid=scene-animate]')).toBeNull();
    expect(q('[data-testid=scene-init]')).toBeNull();
    expect(q('[data-testid=scene-quality]')).toBeNull();
    expect(text).not.toContain('negative_prompt');
    expect(text).not.toContain('Movimiento de cámara');
    expect(text).toContain('Acabado'); // grain and white balance still apply
  });

  it('sets the speed of the video, clears it when emptied and refuses one out of range', async () => {
    await open('stand-up.mp4');
    flushSources();
    await settle();
    const speed = q('[data-testid=clip-speed]') as HTMLInputElement;
    speed.value = '0.5';
    speed.dispatchEvent(new Event('change'));
    await settle();
    expect(store.config()!.scenes[0].clip_speed).toBe(0.5);
    expect((load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] }).scenes[0]['clip_speed']).toBe(0.5);
    speed.value = '9';
    speed.dispatchEvent(new Event('change'));
    await settle();
    expect(store.canSave()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('La velocidad va de 0,25 a 4');
    speed.value = '';
    speed.dispatchEvent(new Event('change'));
    expect(store.config()!.scenes[0].clip_speed).toBeUndefined();
    // leaving My clip drops it
    speed.value = '2';
    speed.dispatchEvent(new Event('change'));
    cmp.setPictureMode('ai');
    expect(store.config()!.scenes[0].clip_speed).toBeUndefined();
  });

  it('offers the complete animation of a generated scene of another project, labelled, and copies that one', async () => {
    await open('');
    flushSources([
      { project: 'other', scene: 's06', kind: 'clip', size: 1, modified: '' },
      { project: 'other', scene: 's06', kind: 'animation', size: 1, modified: '' },
    ]);
    await settle();
    const picker = fixture.debugElement.query((d) => d.name === 'app-clip-picker').componentInstance as unknown as {
      choose(v: string): Promise<void>;
      keptLabel(c: unknown): string;
    };
    expect(picker.keptLabel({ project: 'other', scene: 's06', kind: 'animation' })).toContain('animación completa');
    expect(picker.keptLabel({ project: 'other', scene: 's06', kind: 'clip' })).not.toContain('animación');
    // a clip made from a motion graphic says how its page was made
    const motion = picker.keptLabel({ project: 'other', scene: 'gfx', kind: 'clip', motion: 'motion graphic · page written by writer:7b · Chrome 126.0.1' });
    expect(motion).toContain('other · gfx');
    expect(motion).toContain('writer:7b');
    const done = picker.choose('kept:animation:other/s06');
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo/sources/clip' });
    expect(req.request.body).toEqual({ from_project: 'other', scene: 's06', kind: 'animation' });
    req.flush({ name: 'other-s06-anim.mp4' });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/projects/demo/sources').flush({ sources: SOURCES });
    await done;
    expect(store.config()!.scenes[0].clip).toBe('other-s06-anim.mp4');
  });
});
