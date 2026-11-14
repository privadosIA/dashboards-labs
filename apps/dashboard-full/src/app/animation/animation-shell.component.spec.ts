import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MotionCatalogStore } from '../core/motion-catalog.store';
import { AnimationShellComponent } from './animation-shell.component';

@Component({ template: '<p data-testid="inner">songs</p>' })
class Inner {}

describe('AnimationShellComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'animation', component: AnimationShellComponent, children: [{ path: 'songs', component: Inner }, { path: 'pieces', component: Inner }, { path: 'motion-edit/pieces', component: Inner }, { path: 'vector/editor', component: Inner }] }]),
      ],
    });
    return RouterTestingHarness.create();
  }

  it('links every screen of the library under the section and marks the current one', async () => {
    const harness = await setup();
    await harness.navigateByUrl('/animation/pieces');
    harness.detectChanges();
    const links = Array.from(harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('[data-testid="animation-sections"] a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/animation/new', '/animation/songs', '/animation/pieces', '/animation/motion-edit', '/animation/references', '/animation/presets', '/animation/parts', '/animation/vector', '/animation/datasets']);
    expect(links.filter((a) => a.classList.contains('sections__link--on')).map((a) => a.getAttribute('href'))).toEqual(['/animation/pieces']);
    expect(harness.routeNativeElement!.querySelector('[data-testid="inner"]')).not.toBeNull();
  });

  it('puts Motion Edit after Pieces and Vector after Parts, and marks only the tab the person is in', async () => {
    const harness = await setup();
    await harness.navigateByUrl('/animation/motion-edit/pieces');
    harness.detectChanges();
    const on = () => Array.from(harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('[data-testid="animation-sections"] a.sections__link--on')).map((a) => a.textContent!.trim());
    expect(on()).toEqual(['Motion Edit']);
    await harness.navigateByUrl('/animation/vector/editor');
    harness.detectChanges();
    expect(on()).toEqual(['Vector']);
    const labels = Array.from(harness.routeNativeElement!.querySelectorAll('[data-testid="animation-sections"] a')).map((a) => a.textContent!.trim());
    expect(labels.indexOf('Motion Edit')).toBe(labels.indexOf(labels.find((l) => /pieces|piezas/i.test(l))!) + 1);
  });

  it('makes the scene editor read the catalog again once the section is left', async () => {
    const harness = await setup();
    const invalidate = vi.spyOn(TestBed.inject(MotionCatalogStore), 'invalidate');
    await harness.navigateByUrl('/animation/songs');
    expect(invalidate).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(invalidate).toHaveBeenCalled();
  });
});
