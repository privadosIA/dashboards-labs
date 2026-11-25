import { textsFor } from './core/texts';
import { SceneFailed } from './port';
import { MAX_IDEA, MAX_SECONDS, MIN_SECONDS, blenderProblem, jsonProblem } from './problem';

const es = textsFor('es').problem;
const en = textsFor('en').problem;

describe('blenderProblem', () => {
  it('the limits are the server\'s', () => {
    expect([MAX_IDEA, MIN_SECONDS, MAX_SECONDS]).toEqual([2000, 0.5, 600]);
  });

  it('400, 409 and 503 keep the words of the server', () => {
    expect(blenderProblem(new SceneFailed(400, 'objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)'), 'save', es)).toBe('objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)');
    expect(blenderProblem(new SceneFailed(409, 'a run is in progress'), 'write', es)).toBe('a run is in progress');
    expect(blenderProblem(new SceneFailed(503, 'Blender is not installed: install Blender 4.2 or newer'), 'preview', es)).toContain('install Blender');
  });

  it('404 says to write the scene first, in the language of the host', () => {
    expect(blenderProblem(new SceneFailed(404, 'x'), 'write', es)).toContain('escribe primero la escena');
    expect(blenderProblem(new SceneFailed(404, 'x'), 'write', en)).toContain('write the scene first');
  });

  it('422 carries the last problem and the way on', () => {
    const text = blenderProblem(new SceneFailed(422, 'objects[0].id: repeated'), 'write', es);
    expect(text).toContain('objects[0].id: repeated');
    expect(text).toContain('Inténtalo de nuevo');
  });

  it('a 503 with no words says what is missing for each call', () => {
    expect(blenderProblem(new SceneFailed(503), 'preview', es)).toContain('Blender');
    expect(blenderProblem(new SceneFailed(503), 'write', es)).toContain('modelo');
  });

  it('an answer with no message still says something, and any other error says its own words', () => {
    expect(blenderProblem(new SceneFailed(500), 'save', es)).toBe(es.failed);
    expect(blenderProblem(new Error('offline'), 'save', en)).toBe('offline');
    expect(blenderProblem('x', 'save', en)).toBe(en.failed);
  });
});

describe('jsonProblem', () => {
  it('is empty for an object', () => {
    expect(jsonProblem('{"version": 1}', es)).toBe('');
  });

  it('says where the text breaks', () => {
    expect(jsonProblem('{\n "version": 1,\n "camera" {"lens": 35}\n}', es)).toContain('línea 3');
    expect(jsonProblem('{\n "version": 1,\n "camera" {"lens": 35}\n}', en)).toContain('line 3');
  });

  it('says it is not JSON when the browser does not say where', () => {
    expect(jsonProblem('', es)).not.toBe('');
  });

  it('refuses what is JSON but not an object', () => {
    expect(jsonProblem('[1]', en)).toBe(en.notObject);
    expect(jsonProblem('3', en)).toBe(en.notObject);
    expect(jsonProblem('null', en)).toBe(en.notObject);
  });
});
