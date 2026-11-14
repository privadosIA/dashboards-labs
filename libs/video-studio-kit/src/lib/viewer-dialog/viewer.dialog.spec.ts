import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TicketService } from '@lab/server-connection';

import { VIDEO_STUDIO_OPTIONS } from '../core/options';
import { stubStorage } from '../../testing/memory-storage';
import { DEFAULT_SETTINGS, type Generation } from '../video/model';
import { ViewerDialog } from './viewer.dialog';

const done: Generation = { id: 'g1', settings: DEFAULT_SETTINGS, state: 'done', progress: 100, videoUrl: 'http://host:4666/api/projects/api-gen-1/artifacts/v.mp4' };

function setup(withTicket: (url: string) => string) {
  stubStorage({ 'video-studio.lang': 'en' });
  TestBed.configureTestingModule({
    providers: [{ provide: MAT_DIALOG_DATA, useValue: done }, { provide: MatDialogRef, useValue: { close: () => undefined } }, { provide: TicketService, useValue: { withTicket } }],
  });
  const fixture = TestBed.createComponent(ViewerDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { video: el.querySelector('video')!, download: el.querySelector<HTMLAnchorElement>('a[download]')! };
}

describe('ViewerDialog and the access token', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('plays and downloads the video with the ticket when there is one', () => {
    const { video, download } = setup((url) => `${url}?ticket=t1`);
    expect(video.getAttribute('src')).toBe(`${done.videoUrl}?ticket=t1#t=0.1`);
    expect(download.getAttribute('href')).toBe(`${done.videoUrl}?ticket=t1`);
  });

  it('leaves the address as the server gave it when there is no token', () => {
    const { video, download } = setup((url) => url);
    expect(video.getAttribute('src')).toBe(`${done.videoUrl}#t=0.1`);
    expect(download.getAttribute('href')).toBe(done.videoUrl);
  });
});

describe('ViewerDialog look', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has its buttons at least as tall as the control token, a panel title and the player surface from a token', () => {
    setup((url) => url);
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(styles).toMatch(/\.actions[^{]*(button|a)[^{]*\{[^}]*min-height:\s*var\(--lab-control-h\)/);
    expect(styles).toMatch(/h2[^{]*\{[^}]*font-size:\s*var\(--lab-fs-title\)/);
    expect(styles).toMatch(/\.frame[^{]*\{[^}]*var\(--lab-player-bg\)/);
    expect(styles).toMatch(/\.frame[^{]*\{[^}]*var\(--lab-radius-panel\)/);
  });

  it('shows the inputs the generation used', () => {
    stubStorage({ 'video-studio.lang': 'en' });
    const used: Generation = { ...done, inputs: [{ kind: 'start_image', name: 's.png', url: '' }, { kind: 'end_image', name: 'e.png', url: '' }] };
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: used }, { provide: MatDialogRef, useValue: { close: () => undefined } }, { provide: TicketService, useValue: { withTicket: (u: string) => u } }],
    });
    const fixture = TestBed.createComponent(ViewerDialog);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid=inputs-list] li')).toHaveLength(2);
  });

  it.each([[true, 1], [false, 0]])('with memory %s it shows the simulated note %s times', (memory, count) => {
    stubStorage({ 'video-studio.lang': 'en' });
    TestBed.configureTestingModule({
      providers: [{ provide: VIDEO_STUDIO_OPTIONS, useValue: { lang: 'en', memory } }, { provide: MAT_DIALOG_DATA, useValue: done }, { provide: MatDialogRef, useValue: { close: () => undefined } }, { provide: TicketService, useValue: { withTicket: (u: string) => u } }],
    });
    const fixture = TestBed.createComponent(ViewerDialog);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.note')).toHaveLength(count);
  });
});
