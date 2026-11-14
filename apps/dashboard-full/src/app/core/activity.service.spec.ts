import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ActivityService } from './activity.service';
import { ApiService } from './api.service';
import { Run } from './api.models';

function setup(runs: Partial<Run>[]) {
  const api = { launches: () => 0, listRuns: vi.fn(() => of(runs as Run[])) };
  TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
  return TestBed.inject(ActivityService);
}

function button(attrs = ''): HTMLButtonElement {
  const host = document.createElement('div');
  host.innerHTML = `<button ${attrs}>x</button>`;
  document.body.append(host);
  return host.firstElementChild as HTMLButtonElement;
}

describe('ActivityService', () => {
  it('is busy while a run is queued or running and marks the page', async () => {
    const a = setup([{ state: 'running' }]);
    await vi.waitFor(() => expect(a.busy()).toBe(true));
    TestBed.tick();
    expect(document.documentElement.classList.contains('app-busy')).toBe(true);
  });

  it('is idle when every run is over', async () => {
    const a = setup([{ state: 'succeeded' }, { state: 'failed' }]);
    await Promise.resolve();
    expect(a.busy()).toBe(false);
  });

  it('counts local tasks', () => {
    const a = setup([]);
    a.track('assistant', true);
    expect(a.busy()).toBe(true);
    a.track('assistant', false);
    expect(a.busy()).toBe(false);
  });

  it('blocks the clicks of buttons while busy, except cancel ones', () => {
    const a = setup([]);
    a.track('x', true);
    const normal = vi.fn();
    const cancel = vi.fn();
    const b1 = button();
    const b2 = button('data-cancel');
    b1.addEventListener('click', normal);
    b2.addEventListener('click', cancel);
    b1.click();
    b2.click();
    expect(normal).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    a.track('x', false);
    b1.click();
    expect(normal).toHaveBeenCalledOnce();
  });

  it('lets the buttons inside a kept area work, but not the ones that start work', () => {
    const a = setup([]);
    a.track('x', true);
    const host = document.createElement('div');
    host.setAttribute('data-keep', '');
    host.innerHTML = '<button id="edit">edit</button><button id="go" data-start>go</button>';
    document.body.append(host);
    const edit = vi.fn();
    const go = vi.fn();
    host.querySelector('#edit')!.addEventListener('click', edit);
    host.querySelector('#go')!.addEventListener('click', go);
    (host.querySelector('#edit') as HTMLElement).click();
    (host.querySelector('#go') as HTMLElement).click();
    expect(edit).toHaveBeenCalledOnce();
    expect(go).not.toHaveBeenCalled();
  });
});
