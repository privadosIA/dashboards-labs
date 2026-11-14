import { load } from 'js-yaml';

import { ProjectConfig } from '../core/api.models';
import { toYaml } from './project-yaml';

describe('toYaml', () => {
  it('writes presence semantics: empty values and an animate that is not an opt-in are absent', () => {
    const cfg = {
      project: 'demo',
      output: { mode: 'video', file: 'out/demo.mp4' },
      defaults: {},
      bgm: {},
      scenes: [
        { id: 'a', seed: 42, tts_text: 'hola', animate: false },
        { id: 'b', seed: 0, tts_text: '', silence_seconds: 2 },
      ],
    } as unknown as ProjectConfig;
    const doc = load(toYaml(cfg)) as Record<string, unknown>;
    const scenes = doc['scenes'] as Record<string, unknown>[];
    expect(scenes[0]['tts_text']).toBe('hola');
    expect('animate' in scenes[0]).toBe(false);
    expect('tts_text' in scenes[1]).toBe(false);
    expect(scenes[1]['silence_seconds']).toBe(2);
    expect((doc['output'] as Record<string, unknown>)['file']).toBe('out/demo.mp4');
  });

  it('leaves video leftovers out of an images project', () => {
    const cfg = { project: 'p', output: { mode: 'images' }, defaults: {}, scenes: [{ id: 'a', clip: 'x.mp4', transition: 'fade' }] } as unknown as ProjectConfig;
    const doc = load(toYaml(cfg)) as Record<string, unknown>;
    expect(doc['bgm']).toBeUndefined();
    expect(Object.keys((doc['scenes'] as Record<string, unknown>[])[0])).toEqual(['id']);
  });
});
