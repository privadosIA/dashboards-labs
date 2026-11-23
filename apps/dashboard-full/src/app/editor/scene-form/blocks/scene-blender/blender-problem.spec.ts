import { HttpErrorResponse } from '@angular/common/http';

import { MAX_IDEA, MAX_SECONDS, MIN_SECONDS, blenderProblem, jsonProblem, readableError } from './blender-problem';

const refused = (status: number, message?: string) => new HttpErrorResponse({ status, error: message === undefined ? undefined : { error: { code: 'x', message } } });

describe('blenderProblem', () => {
  it('the limits are the server\'s', () => {
    expect([MAX_IDEA, MIN_SECONDS, MAX_SECONDS]).toEqual([2000, 0.5, 600]);
  });

  it('400, 409 and 503 keep the words of the server', () => {
    expect(blenderProblem(refused(400, 'objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)'), 'save')).toBe('objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)');
    expect(blenderProblem(refused(409, 'a run is in progress'), 'write')).toBe('a run is in progress');
    expect(blenderProblem(refused(503, 'Blender is not installed: install Blender 4.2 or newer'), 'preview')).toContain('install Blender');
  });

  it('404 says to write the scene first', () => {
    expect(blenderProblem(refused(404, 'x'), 'write')).toContain('escribe primero la escena');
  });

  it('422 carries the last problem and the way on', () => {
    const text = blenderProblem(refused(422, 'objects[0].id: repeated'), 'write');
    expect(text).toContain('objects[0].id: repeated');
    expect(text).toContain('Inténtalo de nuevo');
  });

  it('a 503 with no words says what is missing for each call', () => {
    expect(blenderProblem(refused(503), 'preview')).toContain('Blender');
    expect(blenderProblem(refused(503), 'write')).toContain('modelo');
  });

  it('an answer with no message still says something', () => {
    expect(blenderProblem(new HttpErrorResponse({ status: 500 }), 'save')).not.toBe('');
  });
});

describe('readableError', () => {
  it('reads the JSON error that arrives as a Blob (the preview asks for an image)', async () => {
    const blob = new Blob([JSON.stringify({ error: { code: 'unavailable', message: 'Blender is not installed' } })], { type: 'application/json' });
    const readable = await readableError(new HttpErrorResponse({ status: 503, error: blob }));
    expect(blenderProblem(readable, 'preview')).toBe('Blender is not installed');
  });

  it('leaves an error that is not a Blob as it is, and survives a Blob that is not JSON', async () => {
    const plain = refused(404, 'x');
    expect(await readableError(plain)).toBe(plain);
    const readable = (await readableError(new HttpErrorResponse({ status: 503, error: new Blob(['<html>']) }))) as HttpErrorResponse;
    expect(readable.status).toBe(503);
  });
});

describe('jsonProblem', () => {
  it('accepts an object', () => {
    expect(jsonProblem('{"version": 1}')).toBe('');
  });

  it('says where it breaks', () => {
    const text = '{\n  "version": 1,\n  "world": {"color" "bg"}\n}';
    const problem = jsonProblem(text);
    expect(problem).toContain('línea 3');
    expect(problem).toMatch(/columna \d+/);
  });

  it('refuses what is JSON but not an object', () => {
    expect(jsonProblem('[1]')).toContain('objeto');
    expect(jsonProblem('3')).toContain('objeto');
    expect(jsonProblem('null')).toContain('objeto');
  });

  it('refuses an empty text', () => {
    expect(jsonProblem('')).not.toBe('');
  });
});
