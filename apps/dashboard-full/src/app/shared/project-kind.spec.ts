import { isAnimation, projectKindLabel } from './project-kind';

// The tests run with the Spanish catalogue loaded, like the rest of the dashboard's specs.
describe('projectKindLabel', () => {
  it('names each kind the contract knows', () => {
    expect(projectKindLabel('generation')).toBe('Generación');
    expect(projectKindLabel('image_edit')).toBe('Retoque de imagen');
    expect(projectKindLabel('video_edit')).toBe('Edición de vídeo');
    expect(projectKindLabel('model_generation')).toBe('Modelo 3D');
    expect(projectKindLabel('music_motion')).toBe('Animación');
  });

  it('says nothing for an ordinary project or a kind it does not know', () => {
    expect(projectKindLabel(undefined)).toBe('');
    expect(projectKindLabel('something_new')).toBe('');
  });
});

describe('isAnimation', () => {
  it('is true only for the animations of the music mode', () => {
    expect(isAnimation('music_motion')).toBe(true);
    expect(isAnimation('generation')).toBe(false);
    expect(isAnimation(undefined)).toBe(false);
  });
});
