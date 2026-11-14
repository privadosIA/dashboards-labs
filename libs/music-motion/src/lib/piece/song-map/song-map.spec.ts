import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { AnimationFailure, type AnimationPort, type PieceDetail, type SongMap } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';

import { toDetail } from '../../animation/server-mapping';
import { serverDetail } from '../../animation/server.fixture';
import { stubStorage } from '../../../testing/memory-storage';
import { SongMapView } from './song-map';

const map = (extra: Partial<SongMap> = {}): SongMap => ({
  ...toDetail(serverDetail()).songMap,
  duration: 20,
  bpm: 96.4,
  beats: [0, 0.6, 1.2],
  sections: [{ tag: 'verse', start: 0, end: 10 }, { tag: 'chorus', start: 10, end: 20 }],
  words: [{ text: 'hello', start: 5, end: 6, line: 0 }, { text: 'world', start: 6, end: 7, line: 0 }],
  loudness: [0.1, 0.9, 0.4],
  wordsEstimated: false,
  ...extra,
});

function create(songMap: SongMap, span: { start: number; end: number } | null = null, lang: 'es' | 'en' = 'en') {
  stubStorage();
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }] });
  const fixture = TestBed.createComponent(SongMapView);
  fixture.componentRef.setInput('map', songMap);
  fixture.componentRef.setInput('span', span);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, text: () => el.textContent ?? '' };
}

describe('SongMapView', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the sections, beats, words and loudness, and says the tempo and how many of each', () => {
    const { el } = create(map());
    expect(el.querySelectorAll('rect.section')).toHaveLength(2);
    expect(el.querySelectorAll('line.beat')).toHaveLength(3);
    expect(el.querySelectorAll('circle.word')).toHaveLength(2);
    expect(el.querySelector('polyline.loudness')).not.toBeNull();
    expect(el.querySelector('[data-testid="tempo"]')!.textContent).toBe('96 beats per minute');
    expect(el.querySelector('[data-testid="summary"]')!.textContent).toBe('2 sections · 3 beats · 2 words');
  });

  it('names the sections and the words for who cannot see the drawing', () => {
    const { el } = create(map());
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toContain('2 sections');
    expect([...el.querySelectorAll('.tags li')].map((li) => li.textContent)).toEqual(['verse', 'chorus']);
    expect(el.querySelector('circle.word title')!.textContent).toBe('hello');
  });

  it('says the word times are an estimate when the server spread them, and that they were heard when it did not', () => {
    expect(create(map({ wordsEstimated: true })).el.querySelector('[data-testid="words-note"]')!.textContent).toContain('estimate');
    TestBed.resetTestingModule();
    const heard = create(map({ wordsEstimated: false })).el.querySelector('[data-testid="words-note"]')!;
    expect(heard.textContent).toContain('were heard');
    expect(heard.classList.contains('estimated')).toBe(false);
  });

  it('marks the span of the piece being looked at, and nothing when none is', () => {
    const none = create(map());
    expect(none.el.querySelector('[data-testid="span"]')).toBeNull();
    TestBed.resetTestingModule();
    const marked = create(map(), { start: 5, end: 10 });
    const rect = marked.el.querySelector('[data-testid="span"]')!;
    expect(rect.getAttribute('x')).toBe('250');
    expect(rect.getAttribute('width')).toBe('250');
  });

  it('moves the mark when another piece is looked at', () => {
    const { fixture, el } = create(map(), { start: 0, end: 5 });
    fixture.componentRef.setInput('span', { start: 10, end: 20 });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="span"]')!.getAttribute('x')).toBe('500');
  });

  it('draws no loudness line for a song with no loudness', () => {
    expect(create(map({ loudness: [] })).el.querySelector('polyline.loudness')).toBeNull();
  });

  it('speaks Spanish when the language is Spanish', () => {
    const { text } = create(map({ wordsEstimated: true }), null, 'es');
    expect(text()).toContain('Mapa de la canción');
    expect(text()).toContain('96 pulsos por minuto');
    expect(text()).toContain('son una estimación');
  });
});

describe('SongMapView hearing the words', () => {
  const piece = (extra: Partial<PieceDetail> = {}): PieceDetail => ({ ...toDetail(serverDetail()), ...extra });

  function withPort(transcribe: () => unknown, current: PieceDetail = piece(), lang: 'es' | 'en' = 'en') {
    stubStorage();
    TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },{ provide: ANIMATION, useValue: { transcribe: vi.fn(transcribe) } as unknown as AnimationPort }] });
    const fixture = TestBed.createComponent(SongMapView);
    fixture.componentRef.setInput('map', current.songMap);
    fixture.componentRef.setInput('piece', current);
    const heard = vi.fn();
    fixture.componentInstance.heard.subscribe(heard);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = () => el.querySelector<HTMLButtonElement>('[data-testid="sync-words"]')!;
    const get = (id: string) => el.querySelector(`[data-testid="${id}"]`);
    return { fixture, el, button, get, heard, port: TestBed.inject(ANIMATION) as unknown as { transcribe: ReturnType<typeof vi.fn> } };
  }

  it('offers no button when it is given no piece', () => {
    const { el } = create(map());
    expect(el.querySelector('[data-testid="sync-words"]')).toBeNull();
  });

  it('waits with the button disabled and the forecast said, then says the words were synced and hands over the piece', () => {
    const answer = new Subject<PieceDetail>();
    const { fixture, button, get, heard } = withPort(() => answer);
    button().click();
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(get('sync-wait')!.textContent).toContain('third');
    const done = piece({ songMap: { ...piece().songMap, wordsEstimated: false } });
    answer.next(done);
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
    expect(get('sync-done')).not.toBeNull();
    expect(get('sync-wait')).toBeNull();
    expect(heard).toHaveBeenCalledWith(done);
  });

  it('shows the warning about an edited script that was kept', () => {
    const { fixture, button, get } = withPort(() => of(piece({ scriptWarning: '3 pieces are far from a boundary' })));
    button().click();
    fixture.detectChanges();
    expect(get('sync-warning')!.textContent).toContain('3 pieces are far from a boundary');
    expect(get('sync-warning')!.textContent).toContain('kept');
  });

  it('shows the note when no words were heard, and does not say they were synced', () => {
    const { fixture, button, get } = withPort(() => of(piece({ notice: 'the song has no words' })));
    button().click();
    fixture.detectChanges();
    expect(get('sync-notice')!.textContent).toContain('the song has no words');
    expect(get('sync-done')).toBeNull();
  });

  it('shows the reason of each refusal and lets the person try again', () => {
    for (const [kind, reason] of [['busy', 'a run is active'], ['unavailable', 'whisper-cli is missing'], ['missing', 'no such piece'], ['other', 'whisper failed']] as const) {
      TestBed.resetTestingModule();
      const { fixture, button, get } = withPort(() => throwError(() => new AnimationFailure(kind, reason)));
      button().click();
      fixture.detectChanges();
      expect(get('sync-problem')!.textContent, kind).toContain(reason);
      expect(button().disabled).toBe(false);
    }
  });

  it('is disabled while the piece is being drawn', () => {
    const { button, port } = withPort(() => of(piece()), piece({ state: 'running', progress: 10 }));
    expect(button().disabled).toBe(true);
    button().click();
    expect(port.transcribe).not.toHaveBeenCalled();
  });

  it('speaks Spanish when the language is Spanish', () => {
    const { button } = withPort(() => of(piece()), piece(), 'es');
    expect(button().textContent).toContain('Sincronizar');
  });
});
