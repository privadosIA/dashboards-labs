import { TestBed } from '@angular/core/testing';
import { TicketService } from '@lab/server-connection';

import { stubStorage } from '../../../testing/memory-storage';
import type { GenerationInput } from '../../video/model';
import { InputsList } from './inputs-list';

const inputs: GenerationInput[] = [
  { kind: 'reference_image', name: '1.png', url: 'http://s/1.png' },
  { kind: 'reference_video', name: 'v.mp4', url: 'http://s/v.mp4' },
  { kind: 'reference_audio', name: 'a.wav', url: 'http://s/a.wav' },
];

function draw(list: readonly GenerationInput[], lang: 'es' | 'en' = 'en') {
  stubStorage({ 'video-studio.lang': lang });
  TestBed.configureTestingModule({ providers: [{ provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=t` } }] });
  const fixture = TestBed.createComponent(InputsList);
  fixture.componentRef.setInput('inputs', list);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('InputsList', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a thumbnail with its ticket for an image and the kind with the name for a video and an audio, in order', () => {
    const el = draw(inputs);
    expect([...el.querySelectorAll('li')].map((li) => li.getAttribute('data-kind'))).toEqual(['reference_image', 'reference_video', 'reference_audio']);
    expect(el.querySelector('img')?.getAttribute('src')).toBe('http://s/1.png?ticket=t');
    expect(el.textContent).toContain('Reference video · v.mp4');
    expect(el.textContent).toContain('Reference audio · a.wav');
  });

  it('names the kinds in Spanish', () => {
    expect(draw(inputs, 'es').textContent).toContain('Vídeo de referencia · v.mp4');
  });

  it('draws nothing for a generation without inputs', () => {
    expect(draw([]).querySelector('ul')).toBeNull();
  });

  it('shows only the name of an image whose address is gone', () => {
    const el = draw([{ kind: 'start_image', name: 's.png', url: '' }]);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('Start image · s.png');
  });
});
