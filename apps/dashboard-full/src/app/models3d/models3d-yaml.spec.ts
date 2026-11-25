import { load } from 'js-yaml';

import type { ProjectConfig } from '../core/api.models';
import { entryToYaml, modelsStarterYaml, toModelsYaml } from './models3d-yaml';

const CONFIG: ProjectConfig = {
  project: 'objetos',
  adult: false,
  output: { mode: 'models3d', file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '', models3d: { engine: 'triposr', detail: 'high' } },
  scenes: [],
  models: [
    { id: 'patin', prompt: 'a retro roller skate' },
    { id: 'copa', prompt: 'a golden trophy', variants: 3, seed: 7, engine: 'sf3d' },
    { id: 'gato', image: 'gato.png', variants: 3, adult: true },
  ],
};

describe('scenes.yaml of a 3D models project', () => {
  const doc = () => load(toModelsYaml(CONFIG)) as Record<string, any>;

  it('writes the models, the mode and the defaults of the mode, and no scenes', () => {
    const d = doc();
    expect(d['output']).toEqual({ mode: 'models3d' });
    expect(d['defaults']).toEqual({ models3d: { engine: 'triposr', detail: 'high' } });
    expect(d['scenes']).toBeUndefined();
    expect(d['tracks']).toBeUndefined();
    expect(d['models']).toHaveLength(3);
  });

  it('writes only what an entry set: a text or a picture (never both), and the variants only above one', () => {
    expect(entryToYaml({ id: 'patin', prompt: 'x' })).toEqual({ id: 'patin', prompt: 'x' });
    expect(entryToYaml({ id: 'copa', prompt: 'x', variants: 3, seed: 7, engine: 'sf3d', adult: true })).toEqual({ id: 'copa', prompt: 'x', variants: 3, seed: 7, engine: 'sf3d', adult: true });
    expect(entryToYaml({ id: 'a', prompt: 'x', image: 'a.png' })).toEqual({ id: 'a', prompt: 'x' });
    expect(entryToYaml({ id: 'gato', image: 'gato.png', variants: 3 })).toEqual({ id: 'gato', image: 'gato.png' });
  });

  it('leaves out the defaults that mean nothing at their zero value and keeps the image model the prompts are drawn with', () => {
    const cfg = { ...CONFIG, defaults: { ...CONFIG.defaults, steps: 8, model_set: { diffusion_model: 'models/k.gguf', llm: 'models/q.gguf', vae: 'models/v.safetensors' } } } as ProjectConfig;
    const d = load(toModelsYaml(cfg)) as Record<string, any>;
    expect(d['defaults']['steps']).toBe(8);
    expect(d['defaults']['model_set'].diffusion_model).toBe('models/k.gguf');
    expect(d['defaults']['fps']).toBeUndefined();
  });

  it('drops empty defaults of the mode', () => {
    const cfg = { ...CONFIG, defaults: { ...CONFIG.defaults, models3d: { engine: undefined, detail: undefined } } } as ProjectConfig;
    expect((load(toModelsYaml(cfg)) as Record<string, any>)['defaults']).toBeUndefined();
  });

  it('has a starter with one entry', () => {
    expect(load(modelsStarterYaml('objetos', 'object-1', 'a small wooden chair'))).toEqual({ project: 'objetos', output: { mode: 'models3d' }, models: [{ id: 'object-1', prompt: 'a small wooden chair' }] });
  });
});
