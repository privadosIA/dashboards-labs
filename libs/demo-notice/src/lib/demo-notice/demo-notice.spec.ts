import { TestBed } from '@angular/core/testing';

import { THIRD_PARTY_PROJECTS } from '../texts';
import { DemoNotice } from './demo-notice';

function create(lang: 'es' | 'en') {
  const fixture = TestBed.createComponent(DemoNotice);
  fixture.componentRef.setInput('lang', lang);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DemoNotice', () => {
  it('says in Spanish it is a simplified example with simulated data and not the final version, and names the third-party projects', () => {
    const text = create('es').querySelector('[data-testid=demo-notice]')!.textContent!;
    expect(text).toContain('Ejemplo simplificado con datos simulados');
    expect(text).toContain('no es la versión final');
    for (const name of THIRD_PARTY_PROJECTS) expect(text).toContain(name);
  });

  it('says it in English', () => {
    const text = create('en').querySelector('[data-testid=demo-notice]')!.textContent!;
    expect(text).toContain('Simplified example with simulated data');
    expect(text).toContain('not the final version');
    for (const name of THIRD_PARTY_PROJECTS) expect(text).toContain(name);
  });

  it('has nothing to close it and claims no tie with the projects it names', () => {
    const el = create('en');
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).not.toMatch(/official|endorsed|partner|affiliat|oficial/i);
  });
});
