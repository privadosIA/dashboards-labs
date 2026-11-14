import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { VECTOR_EDITOR_LANG } from '@lab/vector-editor';

import { LanguageService } from './core/language';
import { VECTOR_STUDIO_BASE, VECTOR_STUDIO_OPTIONS } from './core/options';
import { provideVectorStudio } from './provide-vector-studio';

describe('provideVectorStudio', () => {
  it('speaks English when the host gave nothing, and the host’s language when it did', () => {
    expect(TestBed.inject(LanguageService).lang).toBe('en');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ANIMATION, useValue: new InMemoryAnimation() }, provideVectorStudio({ lang: 'es' })] });
    expect(TestBed.inject(LanguageService).lang).toBe('es');
    expect(TestBed.inject(VECTOR_EDITOR_LANG)).toBe('es');
  });

  it('keeps the options (client and in-memory flag) for the screens, and mounts at the root by default', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ANIMATION, useValue: new InMemoryAnimation() }, provideVectorStudio({ lang: 'en', client: 'dashboard-full', memory: true })] });
    expect(TestBed.inject(VECTOR_STUDIO_OPTIONS)).toEqual({ lang: 'en', client: 'dashboard-full', memory: true });
    expect(TestBed.inject(VECTOR_STUDIO_BASE)).toBe('');
  });

  it('says what is missing when the port of the catalog is not provided, naming the provider', () => {
    const parent = TestBed.inject(EnvironmentInjector);
    expect(() => createEnvironmentInjector([provideVectorStudio({ lang: 'en' })], parent)).toThrow(/provideMusicMotion/);
  });

  it('is happy with the port provided above it, as a host that provides it at the start does', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ANIMATION, useValue: new InMemoryAnimation() }] });
    const parent = TestBed.inject(EnvironmentInjector);
    const child = createEnvironmentInjector([provideVectorStudio({ lang: 'en' })], parent);
    expect(child.get(VECTOR_STUDIO_OPTIONS).lang).toBe('en');
  });
});
