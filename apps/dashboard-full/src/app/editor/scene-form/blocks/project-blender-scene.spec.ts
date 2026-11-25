import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SceneFailed } from '@lab/blender-scene-kit';
import { firstValueFrom } from 'rxjs';

import { ProjectConfig } from '../../../core/api.models';
import { EditorStore } from '../../editor.store';
import { ProjectBlenderScene, readableError, sceneFailure } from './project-blender-scene';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [{ id: 'titulo', prompt: '', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 5, blender: { build: 'titulo.scene.json' } }],
};
const BASE = '/api/projects/demo/blender/descriptions';
const FILE = `${BASE}/titulo.scene.json`;
const DESCRIPTION = { version: 1, camera: { lens: 50 } };
const context = { scope: 'titulo.scene.json', seconds: 5, aspectRatio: '16:9' };

describe('ProjectBlenderScene', () => {
  let http: HttpTestingController;
  let port: ProjectBlenderScene;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [EditorStore, ProjectBlenderScene, provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const loading = TestBed.inject(EditorStore).load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: CONFIG, valid: true });
    await loading;
    port = TestBed.inject(ProjectBlenderScene);
  });
  afterEach(() => http.verify());

  it('reads the file of the scene, and has nothing for one that was never written', async () => {
    const found = firstValueFrom(port.load('titulo.scene.json'));
    http.expectOne((r) => r.method === 'GET' && r.url === FILE).flush({ name: 'titulo.scene.json', description: DESCRIPTION, resolved: DESCRIPTION });
    expect(await found).toEqual({ description: DESCRIPTION, resolved: DESCRIPTION });
    const none = firstValueFrom(port.load('titulo.scene.json'));
    http.expectOne((r) => r.method === 'GET' && r.url === FILE).flush({ error: { message: 'no' } }, { status: 404, statusText: 'Not Found' });
    expect(await none).toBeNull();
  });

  it('writes with the name of the file, the idea and the length, and says whether it changes the stored one', async () => {
    const written = firstValueFrom(port.write(context, 'a title', null));
    const req = http.expectOne(BASE);
    expect(req.request.body).toEqual({ name: 'titulo.scene.json', idea: 'a title', seconds: 5, revise: false });
    req.flush({ name: 'titulo.scene.json', description: DESCRIPTION, resolved: DESCRIPTION, provider: 'mock', model: 'gemma:26b', attempts: 2 });
    expect(await written).toEqual({ description: DESCRIPTION, resolved: DESCRIPTION, provider: 'mock', model: 'gemma:26b', attempts: 2 });
    const changed = firstValueFrom(port.write(context, 'further away', DESCRIPTION));
    const again = http.expectOne(BASE);
    expect(again.request.body).toMatchObject({ revise: true });
    again.flush({ name: 'titulo.scene.json', description: DESCRIPTION, provider: 'mock', model: 'm', attempts: 1 });
    await changed;
  });

  it('saves a hand-written description against the length of the scene', async () => {
    const saved = firstValueFrom(port.save(context, DESCRIPTION));
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === FILE);
    expect(req.request.body).toEqual({ description: DESCRIPTION, seconds: 5 });
    req.flush({ name: 'titulo.scene.json', description: DESCRIPTION });
    expect((await saved).description).toEqual(DESCRIPTION);
  });

  it('draws the frame of the stored file at the second asked', async () => {
    const frame = firstValueFrom(port.preview(context, DESCRIPTION, 2.5));
    const req = http.expectOne(`${FILE}/preview`);
    expect(req.request.body).toEqual({ t: 2.5, seconds: 5 });
    req.flush(new Blob(['png'], { type: 'image/png' }));
    expect((await frame).type).toBe('image/png');
  });

  it('turns each refusal into the status and the words of the server, whatever the answer was asked as', async () => {
    const failed = firstValueFrom(port.save(context, DESCRIPTION)).catch((e) => e);
    http.expectOne((r) => r.method === 'PUT').flush({ error: { code: 'x', message: 'objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)' } }, { status: 400, statusText: 'Bad Request' });
    const e = await failed;
    expect(e).toBeInstanceOf(SceneFailed);
    expect([e.status, e.said]).toEqual([400, 'objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)']);
    const noBlender = firstValueFrom(port.preview(context, DESCRIPTION, 1)).catch((x) => x);
    const body = new Blob([JSON.stringify({ error: { code: 'unavailable', message: 'Blender is not installed: install Blender 4.2 or newer' } })], { type: 'application/json' });
    http.expectOne(`${FILE}/preview`).flush(body, { status: 503, statusText: 'Unavailable' });
    const p = await noBlender;
    expect([p.status, p.said]).toEqual([503, 'Blender is not installed: install Blender 4.2 or newer']);
  });
});

describe('readableError', () => {
  it('reads the JSON error that arrives as a Blob (the preview asks for an image)', async () => {
    const blob = new Blob([JSON.stringify({ error: { code: 'unavailable', message: 'Blender is not installed' } })], { type: 'application/json' });
    const read = (await readableError(new HttpErrorResponse({ status: 503, error: blob }))) as HttpErrorResponse;
    expect(read.status).toBe(503);
    expect(read.error.error.message).toBe('Blender is not installed');
  });

  it('keeps the status when the Blob is not JSON, and passes other errors through', async () => {
    const read = (await readableError(new HttpErrorResponse({ status: 502, error: new Blob(['<html>']) }))) as HttpErrorResponse;
    expect(read.status).toBe(502);
    const plain = new HttpErrorResponse({ status: 400, error: { error: { message: 'x' } } });
    expect(await readableError(plain)).toBe(plain);
  });
});

describe('sceneFailure', () => {
  it('takes the words from either shape of the server\'s error, and says nothing for an answer with none', () => {
    expect(sceneFailure(new HttpErrorResponse({ status: 400, error: { error: { message: 'a' } } })).said).toBe('a');
    expect(sceneFailure(new HttpErrorResponse({ status: 400, error: { message: 'b' } })).said).toBe('b');
    expect(sceneFailure(new HttpErrorResponse({ status: 500 })).said).toBe('');
    expect(sceneFailure(new HttpErrorResponse({ status: 500 })).status).toBe(500);
  });
});
