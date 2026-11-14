import { TestBed } from '@angular/core/testing';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';

import { LanguageService } from './core/language';
import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from './core/options';
import { provideMotionEdit } from './provide-motion-edit';

describe('provideMotionEdit', () => {
  // The port check and the editor's language tokens live in the route table (routes.spec.ts).
  it('speaks English when the host gave nothing, and the host’s language when it did', () => {
    expect(TestBed.inject(LanguageService).lang).toBe('en');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ANIMATION, useValue: new InMemoryAnimation() }, provideMotionEdit({ lang: 'es' })] });
    expect(TestBed.inject(LanguageService).lang).toBe('es');
  });

  it('keeps the options (client and in-memory flag) for the screens, and mounts at the root by default', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ANIMATION, useValue: new InMemoryAnimation() }, provideMotionEdit({ lang: 'en', client: 'dashboard-full', memory: true })] });
    expect(TestBed.inject(MOTION_EDIT_OPTIONS)).toEqual({ lang: 'en', client: 'dashboard-full', memory: true });
    expect(TestBed.inject(MOTION_EDIT_BASE)).toBe('');
  });
});
