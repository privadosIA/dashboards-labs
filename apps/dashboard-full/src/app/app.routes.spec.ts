import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { allowedInSimple } from './core/simple-mode.store';
import { routes } from './app.routes';

describe('the routes of the music', () => {
  const find = (path: string) => routes.find((r) => r.path === path)!;

  it('keep the song studio at /musica apart from the music of a project, and the simple version leaves the studio out', async () => {
    const studio = find('music');
    const project = find('projects/:id/music');
    expect(studio.loadChildren).toBeDefined();
    expect(studio.canActivate).toBeDefined();
    expect(project.loadChildren).toBeUndefined();
    expect((await (project.loadComponent as () => Promise<{ name: string }>)()).name).toMatch(/MusicPageComponent/);
    expect(find('library').loadComponent).toBeDefined();
  });
});

describe('Motion Edit and Vector inside the Animation section', () => {
  const find = (path: string) => routes.find((r) => r.path === path)!;

  it('are mounted under /animation before the library\'s table, so its ** does not catch them, and are not routes of their own any more', async () => {
    const children = (await (find('animation').loadChildren as () => Promise<Routes>)()) as Routes;
    expect(children.slice(0, 2).map((r) => r.path)).toEqual(['motion-edit', 'vector']);
    expect(children[0].loadChildren).toBeDefined();
    expect(children[1].loadChildren).toBeDefined();
    expect(children.length).toBeGreaterThan(2);
    expect(find('animation').canActivate).toBeDefined();
    expect(find('projects/:id/editor').loadChildren).toBeUndefined();
  });

  it('are reached from their old addresses, which lead to the new ones keeping what follows', async () => {
    @Component({ template: '' })
    class Inner {}
    TestBed.configureTestingModule({
      providers: [provideRouter([...routes.filter((r) => r.path === 'motion-edit' || r.path === 'vector'), { path: 'animation', children: [{ path: 'motion-edit/pieces/:id', component: Inner }, { path: 'vector/catalog', component: Inner }] }])],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/motion-edit/pieces/p-1');
    expect(router.url).toBe('/animation/motion-edit/pieces/p-1');
    await router.navigateByUrl('/vector/catalog');
    expect(router.url).toBe('/animation/vector/catalog');
  });

  it('leave the simple version out: both addresses lead to Create', () => {
    for (const url of ['/animation/motion-edit/pieces', '/animation/motion-edit/flow', '/animation/motion-edit/flow/flow-1', '/animation/vector/editor', '/motion-edit', '/vector']) expect(allowedInSimple(url), url).toBe(false);
  });
});

describe('the sections that open as windows (Animation, Video and Music)', () => {
  const find = (path: string) => routes.find((r) => r.path === path)!;

  it('keep their addresses, lazy and behind the guard of the simple version', () => {
    for (const path of ['animation', 'video', 'music', 'dataset']) {
      const route = find(path);
      expect(route, path).toBeDefined();
      expect(route.loadChildren, path).toBeDefined();
      expect(route.canActivate, path).toBeDefined();
    }
  });

  it('are not areas of the simple version: their addresses, and what goes on from them, lead to Create', () => {
    for (const url of ['/animation', '/animation/songs', '/animation/motion-edit/flow', '/video', '/video?x=1', '/music', '/music#engines', '/dataset', '/dataset/presets']) {
      expect(allowedInSimple(url), url).toBe(false);
    }
  });

  it('keep the old addresses of Motion Edit and Vector leading to the Animation section', () => {
    expect(find('motion-edit').redirectTo).toBe('animation/motion-edit');
    expect(find('vector').redirectTo).toBe('animation/vector');
  });
});

