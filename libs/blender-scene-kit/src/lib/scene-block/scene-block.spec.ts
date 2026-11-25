import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { type Observable, of, throwError } from 'rxjs';

import { BLENDER_AVAILABLE } from '../availability';
import { BLENDER_SCENE_OPTIONS } from '../core/options';
import { BLENDER_SCENE_PORT, type BlenderScenePort, type SceneContext, type SceneDescription, SceneFailed, type SceneWritten } from '../port';
import { BlenderScene } from './scene-block';

const DESCRIPTION = { version: 1, camera: { lens: 50 } };
const STORED: SceneDescription = { description: DESCRIPTION, resolved: DESCRIPTION };
const WRITTEN: SceneWritten = { ...STORED, provider: 'mock', model: 'gemma:26b', attempts: 2 };
const PNG = () => new Blob(['png'], { type: 'image/png' });

/** A port that records what it was asked and answers what the spec says. */
class FakePort implements BlenderScenePort {
  loaded: SceneDescription | null = null;
  writes: { context: SceneContext; idea: string; current: Record<string, unknown> | null }[] = [];
  saves: { context: SceneContext; description: Record<string, unknown> }[] = [];
  previews: { context: SceneContext; description: Record<string, unknown>; t: number }[] = [];
  writeAnswer: () => Observable<SceneWritten> = () => of(WRITTEN);
  saveAnswer: (d: Record<string, unknown>) => Observable<SceneDescription> = (d) => of({ description: d, resolved: d });
  previewAnswer: () => Observable<Blob> = () => of(PNG());

  load(): Observable<SceneDescription | null> {
    return of(this.loaded);
  }
  write(context: SceneContext, idea: string, current: Record<string, unknown> | null): Observable<SceneWritten> {
    this.writes.push({ context, idea, current });
    return this.writeAnswer();
  }
  save(context: SceneContext, description: Record<string, unknown>): Observable<SceneDescription> {
    this.saves.push({ context, description });
    return this.saveAnswer(description);
  }
  preview(context: SceneContext, description: Record<string, unknown>, t: number): Observable<Blob> {
    this.previews.push({ context, description, t });
    return this.previewAnswer();
  }
}

describe('BlenderScene', () => {
  let port: FakePort;
  let fixture: ComponentFixture<BlenderScene>;
  let emitted: (Record<string, unknown> | null)[];
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid=${id}]`) as HTMLElement | null;
  const button = (id: string) => q(id) as HTMLButtonElement;
  const inner = (id: string, tag: string) => (q(id)?.matches(tag) ? q(id) : q(id)?.querySelector(tag)) as HTMLInputElement;

  async function settle(): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function type(id: string, tag: string, value: string): Promise<void> {
    const el = inner(id, tag);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await settle();
  }

  /** Whether the machine has Blender: on for every test but the ones that say otherwise. */
  let blender = true;
  beforeEach(() => (blender = true));

  async function open(inputs: Record<string, unknown> = {}, lang: 'es' | 'en' = 'en'): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang }), { provide: BLENDER_SCENE_OPTIONS, useValue: { lang } }, { provide: BLENDER_SCENE_PORT, useValue: port }, { provide: BLENDER_AVAILABLE, useValue: signal(blender) }] });
    fixture = TestBed.createComponent(BlenderScene);
    emitted = [];
    fixture.componentInstance.descriptionChange.subscribe((d) => emitted.push(d));
    fixture.componentRef.setInput('scope', 'titulo.scene.json');
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    port = new FakePort();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:frame'), revokeObjectURL: vi.fn() }));
  });

  describe('a scene whose description was never written', () => {
    it('draws nothing on a machine without Blender', async () => {
    blender = false;
    await open();
    expect(fixture.nativeElement.querySelector('[data-testid=scene-blender]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid=blender-write]')).toBeNull();
  });

  it('says the file does not exist (in a project) and offers only to write', async () => {
      await open({ sceneSeconds: 5 });
      expect(q('blender-needs-file')).toBeTruthy();
      expect(q('blender-source')).toBeNull();
      expect(q('blender-change')).toBeNull();
      expect(button('blender-write').disabled).toBe(true); // no idea yet
    });

    it('says nothing about a file when the description is sent with a request', async () => {
      await open({ kind: 'request', fixedSeconds: 5 });
      expect(q('blender-needs-file')).toBeNull();
      expect(q('blender-intro')?.textContent).toContain('sent with the video');
    });

    it('takes the length from the scene when it has one, and 5 s when it has none', async () => {
      await open({ sceneSeconds: 8 });
      expect(inner('blender-seconds', 'input').value).toBe('8');
      await open({});
      expect(inner('blender-seconds', 'input').value).toBe('5');
    });

    it('does not ask for the length when the host fixes it, and uses the host\'s', async () => {
      await open({ kind: 'request', fixedSeconds: 7, aspectRatio: '9:16' });
      expect(q('blender-seconds')).toBeNull();
      await type('blender-idea', 'textarea', 'a title');
      button('blender-write').click();
      await settle();
      expect(port.writes[0].context).toEqual({ scope: 'titulo.scene.json', seconds: 7, aspectRatio: '9:16' });
    });

    it('writes from the idea: asks the port, shows the description, who wrote it and a frame, and tells the host', async () => {
      await open({ sceneSeconds: 5 });
      await type('blender-idea', 'textarea', 'a title on a studio floor');
      expect(button('blender-write').disabled).toBe(false);
      button('blender-write').click();
      await settle();
      expect(port.writes).toEqual([{ context: { scope: 'titulo.scene.json', seconds: 5, aspectRatio: '16:9' }, idea: 'a title on a studio floor', current: null }]);
      expect(q('blender-wait')).toBeNull();
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 50');
      expect(q('blender-written')?.textContent).toContain('gemma:26b');
      expect(q('blender-frame')?.getAttribute('src')).toBe('blob:frame');
      expect(q('blender-needs-file')).toBeNull();
      expect(inner('blender-idea', 'textarea').value).toBe('');
      expect(emitted[emitted.length - 1]).toEqual(DESCRIPTION);
    });

    it('starts from the description the host gives when the port has none', async () => {
      await open({ kind: 'request', fixedSeconds: 5, initial: DESCRIPTION });
      expect(inner('blender-source', 'textarea').value).toBe(JSON.stringify(DESCRIPTION, null, 2));
      expect(port.previews[0].description).toEqual(DESCRIPTION);
      expect(emitted[emitted.length - 1]).toEqual(DESCRIPTION);
    });
  });

  describe('a scene with a description', () => {
    beforeEach(() => {
      port.loaded = STORED;
    });

    it('opens with its text and a frame, and offers to change it', async () => {
      await open({ sceneSeconds: 5 });
      expect(inner('blender-source', 'textarea').value).toBe(JSON.stringify(DESCRIPTION, null, 2));
      expect(q('blender-frame')).toBeTruthy();
      expect(button('blender-change')).toBeTruthy();
      expect(q('blender-undo')).toBeNull(); // nothing to put back yet
    });

    it('changing it sends the current description and offers to put the old text back, which saves it', async () => {
      await open({ sceneSeconds: 5 });
      port.writeAnswer = () => of({ ...WRITTEN, description: { version: 1, camera: { lens: 40 } } });
      await type('blender-idea', 'textarea', 'the camera further away');
      button('blender-change').click();
      await settle();
      expect(port.writes[0].current).toEqual(DESCRIPTION);
      expect(port.writes[0].idea).toBe('the camera further away');
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 40');

      button('blender-undo').click();
      await settle();
      expect(port.saves[0].description).toEqual(DESCRIPTION);
      expect(port.saves[0].context.seconds).toBe(5);
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 50');
      expect(q('blender-undo')).toBeNull();
    });

    it('saves the edited text with the length of the scene', async () => {
      await open({ sceneSeconds: 5 });
      await type('blender-source', 'textarea', '{"version": 1, "camera": {"lens": 35}}');
      expect(q('blender-unsaved')).toBeTruthy();
      button('blender-save').click();
      await settle();
      expect(port.saves).toEqual([{ context: { scope: 'titulo.scene.json', seconds: 5, aspectRatio: '16:9' }, description: { version: 1, camera: { lens: 35 } } }]);
      expect(q('blender-unsaved')).toBeNull();
      expect(emitted[emitted.length - 1]).toEqual({ version: 1, camera: { lens: 35 } });
    });

    it('does not send text that is not JSON and says where it breaks, in Spanish', async () => {
      await open({ sceneSeconds: 5 }, 'es');
      await type('blender-source', 'textarea', '{\n "version": 1,\n "camera" {"lens": 35}\n}');
      button('blender-save').click();
      await settle();
      expect(port.saves).toEqual([]);
      expect(q('blender-save-error')?.textContent).toContain('línea 3');
      expect(inner('blender-source', 'textarea').value).toContain('"camera" {');
    });

    it('shows the faults of a refused save by place, under the editor, and keeps the typed text', async () => {
      await open({ sceneSeconds: 5 });
      port.saveAnswer = () => throwError(() => new SceneFailed(400, 'objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)'));
      await type('blender-source', 'textarea', '{"version": 1, "objects": []}');
      button('blender-save').click();
      await settle();
      expect(q('blender-save-error')?.textContent).toContain('objects[3].keys[2].t: 7 is outside the scene');
      expect(inner('blender-source', 'textarea').value).toBe('{"version": 1, "objects": []}');
    });
  });

  describe('the preview', () => {
    beforeEach(() => {
      port.loaded = STORED;
    });

    it('draws the second the slider is on when asked to refresh', async () => {
      await open({ sceneSeconds: 5 });
      const slider = q('blender-time') as HTMLInputElement;
      slider.value = '2.5';
      slider.dispatchEvent(new Event('input'));
      slider.dispatchEvent(new Event('change'));
      await settle();
      port.previews.length = 0;
      button('blender-refresh').click();
      await settle();
      expect(port.previews.map((p) => p.t)).toEqual([2.5]);
      expect(port.previews[0].context.seconds).toBe(5);
    });

    it('says how to install Blender when it is missing, and the rest keeps working', async () => {
      await open({ sceneSeconds: 5 });
      port.previewAnswer = () => throwError(() => new SceneFailed(503, 'Blender is not installed: install Blender 4.2 or newer'));
      button('blender-refresh').click();
      await settle();
      expect(q('blender-preview-error')?.textContent).toContain('install Blender');
      expect(q('blender-frame')).toBeNull();
      expect(button('blender-write').disabled).toBe(true); // no idea typed, not blocked by the preview
      expect(inner('blender-source', 'textarea')).toBeTruthy();
    });
  });

  describe('what a refused write says', () => {
    async function ask(revise = false): Promise<void> {
      port.loaded = revise ? STORED : null;
      await open({ sceneSeconds: 5 });
      await type('blender-idea', 'textarea', 'a cube');
      button(revise ? 'blender-change' : 'blender-write').click();
      await settle();
    }

    it('409 and 503: the words of the server', async () => {
      port.writeAnswer = () => throwError(() => new SceneFailed(409, 'a run is in progress and the model loads on this machine'));
      await ask();
      expect(q('blender-write-error')?.textContent).toContain('a run is in progress');
      port.writeAnswer = () => throwError(() => new SceneFailed(503, 'no model'));
      button('blender-write').click();
      await settle();
      expect(q('blender-write-error')?.textContent).toContain('no model');
    });

    it('422: the last problem and to try again, with the previous description untouched', async () => {
      port.writeAnswer = () => throwError(() => new SceneFailed(422, 'objects[0].id: repeated'));
      await ask(true);
      const text = q('blender-write-error')?.textContent ?? '';
      expect(text).toContain('objects[0].id: repeated');
      expect(text).toContain('Try again');
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 50');
      expect(q('blender-undo')).toBeNull();
    });

    it('404 on a change: write the scene first', async () => {
      port.writeAnswer = () => throwError(() => new SceneFailed(404, 'no'));
      await ask(true);
      expect(q('blender-write-error')?.textContent).toContain('write the scene first');
    });

    it('400: the message next to the field', async () => {
      port.writeAnswer = () => throwError(() => new SceneFailed(400, 'idea: at most 2000 characters'));
      await ask();
      expect(q('blender-write-error')?.textContent).toContain('at most 2000 characters');
    });
  });
});
