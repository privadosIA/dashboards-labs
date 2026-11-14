import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subscriber } from 'rxjs';

import { MusicAssistResponse } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { AssistModelStore } from '../editor/assist-model/assist-model.store';
import { MusicAssistStore } from './music-assist.store';

const RES: MusicAssistResponse = { text: 'raw', caption: 'Slow pop ballad', lyrics: '[Verse]\nhola' };

describe('MusicAssistStore', () => {
  let store: MusicAssistStore;
  let subscriber: Subscriber<MusicAssistResponse>;
  let unsubscribed: boolean;
  const assistMusic = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    unsubscribed = false;
    assistMusic.mockReset();
    // an observable the test drives by hand; its teardown tells us the request was aborted
    assistMusic.mockImplementation(
      () =>
        new Observable<MusicAssistResponse>((s) => {
          subscriber = s;
          return () => {
            unsubscribed = true;
          };
        }),
    );
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: { assistMusic } }] });
    store = TestBed.inject(MusicAssistStore);
  });
  afterEach(() => vi.useRealTimers());

  it('asks for the style and lyrics of a track and holds the result as a proposal tied to it', () => {
    expect(store.ask('ballad', ' Una balada ', false)).toBe(true);
    expect(assistMusic).toHaveBeenCalledWith('Una balada', false, undefined, undefined);
    expect(store.busy()).toBe('ballad');
    subscriber.next(RES);
    expect(store.busy()).toBeNull();
    expect(store.proposal()).toEqual({ trackId: 'ballad', caption: 'Slow pop ballad', lyrics: '[Verse]\nhola' });
  });

  it('passes the generator and keeps the tags of the answer in the proposal', () => {
    store.ask('boda', 'una boda', false, 'heartmula');
    expect(assistMusic).toHaveBeenCalledWith('una boda', false, undefined, 'heartmula');
    subscriber.next({ ...RES, tags: 'piano,acoustic,wedding' });
    expect(store.proposal()).toEqual({ trackId: 'boda', caption: 'Slow pop ballad', lyrics: '[Verse]\nhola', tags: 'piano,acoustic,wedding' });
  });

  it('asks for the style only when the track is instrumental', () => {
    store.ask('lofi', 'música para estudiar', true);
    expect(assistMusic).toHaveBeenCalledWith('música para estudiar', true, undefined, undefined);
  });

  it('refuses empty and over-long descriptions without sending anything', () => {
    expect(store.ask('a', '   ', false)).toBe(false);
    expect(store.ask('a', 'x'.repeat(2001), false)).toBe(false);
    expect(assistMusic).not.toHaveBeenCalled();
    expect(MusicAssistStore.unavailableReason('')).toBe('empty');
    expect(MusicAssistStore.unavailableReason('x'.repeat(2001))).toBe('tooLong');
    expect(MusicAssistStore.unavailableReason('hola')).toBe('');
  });

  it('allows a single request in flight at a time', () => {
    store.ask('a', 'una balada', false);
    expect(store.ask('b', 'otra', false)).toBe(false);
    expect(assistMusic).toHaveBeenCalledTimes(1);
  });

  it('counts the seconds elapsed while waiting and stops when done', () => {
    store.ask('a', 'una balada', false);
    vi.advanceTimersByTime(3000);
    expect(store.elapsed()).toBe(3);
    subscriber.next(RES);
    vi.advanceTimersByTime(3000);
    expect(store.elapsed()).toBe(3);
  });

  it('cancelling aborts the request and shows neither a proposal nor an error', () => {
    store.ask('a', 'una balada', false);
    store.cancel();
    expect(unsubscribed).toBe(true);
    expect(store.busy()).toBeNull();
    expect(store.proposal()).toBeNull();
    expect(store.failure()).toBeNull();
  });

  it('applying hands the proposal over once and clears it; discarding clears it', () => {
    store.ask('a', 'una balada', false);
    subscriber.next(RES);
    expect(store.use()?.caption).toBe('Slow pop ballad');
    expect(store.use()).toBeNull();
    store.ask('a', 'otra', false);
    subscriber.next(RES);
    store.discard();
    expect(store.proposal()).toBeNull();
  });

  it('explains a failure on the track, with the server message as written', () => {
    store.ask('a', 'una balada', false);
    subscriber.error(new HttpErrorResponse({ status: 503, error: { error: { code: 'unavailable', message: 'ollama pull qwen3:8b' } } }));
    expect(store.failure()).toEqual({ trackId: 'a', message: 'ollama pull qwen3:8b', refused: false });
    expect(store.busy()).toBeNull();
    store.dismissFailure();
    expect(store.failure()).toBeNull();
  });

  it('sends the model the user chose, and none when the default is chosen', () => {
    const models = TestBed.inject(AssistModelStore);
    models.models.set([{ name: 'huihui_ai/qwen3-abliterated:8b', size_bytes: 5e9, fits: true }]);
    models.loaded.set(true);
    models.choose('huihui_ai/qwen3-abliterated:8b');
    store.ask('a', 'una balada', false);
    expect(assistMusic).toHaveBeenLastCalledWith('una balada', false, 'huihui_ai/qwen3-abliterated:8b', undefined);
    store.cancel();
    models.choose('');
    store.ask('a', 'una balada', false);
    expect(assistMusic).toHaveBeenLastCalledWith('una balada', false, undefined, undefined);
  });

  it('flags a refusal by the model, with no proposal', () => {
    store.ask('a', 'una canción', false);
    subscriber.error(new HttpErrorResponse({ status: 422, error: { error: { code: 'assist_refused', message: 'qwen3:8b refused to write this text' } } }));
    expect(store.failure()).toEqual({ trackId: 'a', message: '«qwen3:8b» se ha negado a escribirlo. ¿Estás pensando en porno? La negativa es del modelo, no de la aplicación: elige otro modelo instalado en el selector.', refused: true });
    expect(store.proposal()).toBeNull();
  });

  it('says a run is in progress when the server answers 409', () => {
    store.ask('a', 'una balada', false);
    subscriber.error(new HttpErrorResponse({ status: 409, error: { error: { code: 'conflict', message: 'run x is queued' } } }));
    expect(store.failure()?.message).toContain('ejecución en marcha');
  });

  it('clears a previous proposal and error when a new request starts', () => {
    store.ask('a', 'una balada', false);
    subscriber.error(new HttpErrorResponse({ status: 502, error: { error: { code: 'internal_error', message: 'boom' } } }));
    store.ask('a', 'otra', false);
    expect(store.failure()).toBeNull();
  });

  it('reset forgets everything (leaving the studio)', () => {
    store.ask('a', 'una balada', false);
    subscriber.next(RES);
    store.reset();
    expect(store.proposal()).toBeNull();
    expect(store.failure()).toBeNull();
    expect(store.busy()).toBeNull();
  });
});
