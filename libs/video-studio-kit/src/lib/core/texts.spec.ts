import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../testing/memory-storage';
import { StudioPage } from '../studio/studio.page';
import { InMemoryVideoGeneration } from '../video/in-memory.adapter';
import { VIDEO_GENERATION } from '../video/tokens';
import { textsFor } from './texts';
import { InMemoryVideoEdit } from '../video-edit/in-memory.adapter';
import { VIDEO_EDIT } from '../video-edit/tokens';

/** Every path to a string in a nested object: `panel.generate`, `problems.quality`... */
function paths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as object).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key));
}

const at = (value: unknown, path: string): string => path.split('.').reduce((v, key) => (v as Record<string, unknown>)[key], value) as string;

describe('texts', () => {
  it('has exactly the same keys in Spanish and in English', () => {
    expect(paths(textsFor('en')).sort()).toEqual(paths(textsFor('es')).sort());
  });

  it('has no empty text in either language', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const path of paths(textsFor(lang))) expect(at(textsFor(lang), path).trim(), `${lang} ${path}`).not.toBe('');
    }
  });
});

describe('the language of the page', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function open(lang: 'es' | 'en') {
    stubStorage({ 'video-studio.lang': lang });
    TestBed.configureTestingModule({
      providers: [provideLabForms({ lang }), { provide: VIDEO_GENERATION, useValue: new InMemoryVideoGeneration() }, { provide: VIDEO_EDIT, useValue: new InMemoryVideoEdit() }],
    });
    const fixture = TestBed.createComponent(StudioPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('is in English when the host says English: labels, states and messages', async () => {
    const text = await open('en');
    for (const word of ['Create video', 'Prompt', 'Aspect ratio', 'Quality', 'Generate', 'History', 'No generations yet']) {
      expect(text).toContain(word);
    }
    expect(text).not.toContain('Historial');
    // The prompt is not asked for until Generate is pressed.
    expect(text).not.toContain('Write a prompt');
  });

  it('is in Spanish when the host says Spanish', async () => {
    const text = await open('es');
    for (const word of ['Crear vídeo', 'Relación', 'Calidad', 'Generar', 'Historial', 'Aún no hay generaciones']) expect(text).toContain(word);
    expect(text).not.toContain('History');
  });
});
