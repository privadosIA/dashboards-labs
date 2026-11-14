import { ProjectConfig } from '../../../core/api.models';
import { projectPlaceholders } from './placeholders';

const cfg = (defaults: object) => ({ defaults } as unknown as ProjectConfig);

describe('projectPlaceholders', () => {
  it('shows the project\'s render settings', () => {
    expect(projectPlaceholders(cfg({ resolution: '1280x704', steps: 25, model_set: { cfg_scale: 4 } }))).toMatchObject({
      'render.resolution': '1280x704',
      'render.steps': '25',
      'render.cfg_scale': '4',
    });
  });

  it('shows Wan\'s defaults, and the two-expert ones when the project uses them', () => {
    expect(projectPlaceholders(cfg({ animate: {} }))).toMatchObject({ 'animation.resolution': '832x480', 'animation.frames': '33', 'animation.steps': '20' });
    expect(projectPlaceholders(cfg({ animate: { high_noise_diffusion_model: 'x' } }))['animation.steps']).toBe('10');
  });

  it('shows AnimateDiff\'s defaults when the project uses it', () => {
    expect(projectPlaceholders(cfg({ animate: { engine: 'animatediff' } }))).toMatchObject({
      'animation.resolution': '512x512',
      'animation.frames': '16',
      'animation.steps': '25',
    });
  });

  it('has nothing to show without a project', () => {
    expect(projectPlaceholders(null)['render.steps']).toBeUndefined();
  });
});
