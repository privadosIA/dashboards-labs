import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideVectorStudio } from '@lab/vector-studio-kit';

import { VectorShellComponent } from './vector-shell.component';

@Component({ template: '<p data-testid="inner">studio</p>' })
class Inner {}

describe('VectorShellComponent', () => {
  async function setup(lang: 'en' | 'es' = 'en') {
    TestBed.configureTestingModule({
      providers: [
        { provide: ANIMATION, useValue: new InMemoryAnimation() },
        provideVectorStudio({ lang, client: 'dashboard-full', memory: true }),
        provideRouter([{ path: 'animation/vector', component: VectorShellComponent, children: [{ path: 'editor', component: Inner }, { path: 'catalog', component: Inner }] }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/animation/vector/editor');
    harness.detectChanges();
    return harness;
  }

  it('draws the studio under a bar with the Editor and Catalog links of the section', async () => {
    const harness = await setup();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=vector-bar] [data-testid=nav-editor]')?.getAttribute('href')).toBe('/animation/vector/editor');
    expect(el.querySelector('[data-testid=vector-bar] [data-testid=nav-catalog]')?.getAttribute('href')).toBe('/animation/vector/catalog');
    expect(el.querySelector('[data-testid=nav-editor]')?.classList.contains('active')).toBe(true);
    expect(el.querySelector('[data-testid=inner]')?.textContent).toBe('studio');
  });

  it('speaks the language of the dashboard', async () => {
    const harness = await setup('es');
    expect((harness.routeNativeElement as HTMLElement).querySelector('[data-testid=nav-catalog]')?.textContent).toBe('Catálogo');
  });
});
