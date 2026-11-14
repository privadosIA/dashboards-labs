import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RoutingStore } from '../core/routing.store';
import { AssistModelStore } from './assist-model/assist-model.store';
import { ASSIST_MAX_CHARS, AssistantStore, assistErrorMessage } from './assistant.store';

describe('AssistantStore', () => {
  let store: AssistantStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(AssistantStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.reset();
    vi.useRealTimers();
    http.verify();
  });

  it('asks for an image prompt and offers the result as a proposal tied to the scene and field', () => {
    expect(store.ask('cafe', 'prompt', 'Una mujer lee un libro')).toBe(true);
    expect(store.busy()).toEqual({ sceneId: 'cafe', field: 'prompt' });
    const req = http.expectOne({ method: 'POST', url: '/api/assist' });
    expect(req.request.body).toEqual({ task: 'image', text: 'Una mujer lee un libro' });
    req.flush({ text: 'A woman reads a book in a sunlit cafe.' });
    expect(store.busy()).toBeNull();
    expect(store.proposal()).toEqual({ sceneId: 'cafe', field: 'prompt', text: 'A woman reads a book in a sunlit cafe.' });
    expect(store.failure()).toBeNull();
  });

  it('names the model the user chose in the request, and none for the default', () => {
    const models = TestBed.inject(AssistModelStore);
    models.models.set([{ name: 'huihui_ai/qwen3-abliterated:8b', size_bytes: 5e9, fits: true }]);
    models.loaded.set(true);
    models.choose('huihui_ai/qwen3-abliterated:8b');
    store.ask('cafe', 'prompt', 'algo');
    const req = http.expectOne('/api/assist');
    expect(req.request.body).toEqual({ task: 'image', text: 'algo', model: 'huihui_ai/qwen3-abliterated:8b' });
    req.flush({ text: 'x' });
    models.choose('');
    store.ask('cafe', 'prompt', 'algo');
    expect(http.expectOne('/api/assist').request.body).toEqual({ task: 'image', text: 'algo' });
  });

  it('does not send an Ollama model name to a provider that is not the built-in one', () => {
    const models = TestBed.inject(AssistModelStore);
    models.models.set([{ name: 'qwen3:8b', size_bytes: 5e9, fits: true }]);
    models.loaded.set(true);
    models.choose('qwen3:8b');
    const local = { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' };
    TestBed.inject(RoutingStore).set({
      routing: { assistant: { provider: 'cloud', name: 'Cloud', remote: true, consented: true, model: 'gpt-mini' }, describe_image: local, describe_video: local, quality: local, motion_graphics: local },
      max_calls: 60,
    });
    store.ask('cafe', 'prompt', 'algo');
    expect(http.expectOne('/api/assist').request.body).toEqual({ task: 'image', text: 'algo' });
    models.choose(''); // the choice lives in the browser's storage: leave it as it was
  });

  it('shows the refusal message (with some humor), flagged, and no proposal when the model refuses', () => {
    store.ask('cafe', 'prompt', 'algo');
    http.expectOne('/api/assist').flush(
      { error: { code: 'assist_refused', message: 'qwen3:8b refused to write this text. choose another installed model' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(store.proposal()).toBeNull();
    expect(store.failure()).toEqual({
      sceneId: 'cafe',
      field: 'prompt',
      message: '«qwen3:8b» se ha negado a escribirlo. ¿Estás pensando en porno? La negativa es del modelo, no de la aplicación: elige otro modelo instalado en el selector.',
      refused: true,
    });
  });

  it('asks for a motion prompt with task motion', () => {
    store.ask('cafe', 'motion_prompt', 'A woman reads');
    const req = http.expectOne('/api/assist');
    expect(req.request.body).toEqual({ task: 'motion', text: 'A woman reads' });
    req.flush({ text: 'Slow camera drift.' });
    expect(store.proposal()!.field).toBe('motion_prompt');
  });

  it('using the proposal hands over its text once and clears it; discarding clears it', () => {
    store.ask('a', 'prompt', 'x');
    http.expectOne('/api/assist').flush({ text: 'Result' });
    expect(store.use()).toEqual({ sceneId: 'a', field: 'prompt', text: 'Result' });
    expect(store.proposal()).toBeNull();
    expect(store.use()).toBeNull();

    store.ask('a', 'prompt', 'x');
    http.expectOne('/api/assist').flush({ text: 'Other' });
    store.discard();
    expect(store.proposal()).toBeNull();
  });

  it('allows a single request in flight at a time', () => {
    expect(store.ask('a', 'prompt', 'one')).toBe(true);
    expect(store.ask('a', 'motion_prompt', 'two')).toBe(false);
    http.expectOne('/api/assist').flush({ text: 'x' }); // only one request was made
  });

  it('cancelling aborts the request and shows neither a proposal nor an error', () => {
    store.ask('a', 'prompt', 'x');
    const req = http.expectOne('/api/assist');
    store.cancel();
    expect(req.cancelled).toBe(true);
    expect(store.busy()).toBeNull();
    expect(store.proposal()).toBeNull();
    expect(store.failure()).toBeNull();
    expect(store.ask('a', 'prompt', 'again')).toBe(true); // available again
    http.expectOne('/api/assist').flush({ text: 'ok' });
  });

  it('leaving the scene (reset) cancels the request and the result never appears', () => {
    store.ask('cafe', 'prompt', 'x');
    const req = http.expectOne('/api/assist');
    store.reset();
    expect(req.cancelled).toBe(true);
    expect(store.proposal()).toBeNull();
    expect(store.busy()).toBeNull();
  });

  it('reset also forgets a pending proposal and an error', () => {
    store.ask('a', 'prompt', 'x');
    http.expectOne('/api/assist').flush({ text: 'p' });
    store.reset();
    expect(store.proposal()).toBeNull();
    store.ask('a', 'prompt', 'x');
    http.expectOne('/api/assist').flush({ error: { code: 'unavailable', message: 'boom' } }, { status: 503, statusText: 'x' });
    expect(store.failure()).not.toBeNull();
    store.reset();
    expect(store.failure()).toBeNull();
  });

  it('counts the seconds elapsed while waiting and stops when done', () => {
    vi.useFakeTimers();
    store.ask('a', 'prompt', 'x');
    expect(store.elapsed()).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(store.elapsed()).toBe(3);
    http.expectOne('/api/assist').flush({ text: 'x' });
    vi.advanceTimersByTime(5000);
    expect(store.elapsed()).toBe(3); // the timer stopped
  });

  it('refuses text that is empty or over the server limit without sending anything', () => {
    expect(store.ask('a', 'prompt', '   ')).toBe(false);
    expect(store.ask('a', 'prompt', 'x'.repeat(ASSIST_MAX_CHARS + 1))).toBe(false);
    expect(AssistantStore.unavailableReason('')).toBe('empty');
    expect(AssistantStore.unavailableReason(undefined)).toBe('empty');
    expect(AssistantStore.unavailableReason('x'.repeat(ASSIST_MAX_CHARS + 1))).toBe('tooLong');
    expect(AssistantStore.unavailableReason('x'.repeat(ASSIST_MAX_CHARS))).toBe('');
    http.expectNone('/api/assist');
  });

  describe('failures', () => {
    const fail = (status: number, code: string, message: string) => {
      store.ask('cafe', 'prompt', 'x');
      http.expectOne('/api/assist').flush({ error: { code, message } }, { status, statusText: 'err' });
      return store.failure();
    };

    it('a 409 says a run is in progress and that the assistant waits', () => {
      const f = fail(409, 'conflict', 'run run-1 is queued or active: the prompt assistant needs several GB');
      expect(f).toMatchObject({ sceneId: 'cafe', field: 'prompt' });
      expect(f!.message).toContain('ejecución en marcha');
      expect(f!.message).toContain('espera');
      expect(f!.message).not.toContain('run-1'); // not the server wording
    });

    it('a 503 shows the server message as written', () => {
      const msg = 'model "qwen3:8b" is not installed in Ollama; install it with: ollama pull qwen3:8b';
      expect(fail(503, 'unavailable', msg)!.message).toBe(msg);
    });

    it('a 400 and a 502 show the server message', () => {
      expect(fail(400, 'invalid_request', 'the text is empty')!.message).toBe('the text is empty');
      store.dismissFailure();
      expect(fail(502, 'internal_error', 'the model returned nothing')!.message).toBe('the model returned nothing');
    });

    it('an unreachable server uses the connection hint', () => {
      store.ask('a', 'prompt', 'x');
      http.expectOne('/api/assist').error(new ProgressEvent('error'), { status: 0 });
      expect(store.failure()!.message).toContain('orchestrator serve');
    });

    it('the message clears when a new request starts and when dismissed', () => {
      fail(503, 'unavailable', 'boom');
      expect(store.failure()).not.toBeNull();
      store.ask('cafe', 'prompt', 'again');
      expect(store.failure()).toBeNull();
      http.expectOne('/api/assist').flush({ text: 'ok' });

      fail(503, 'unavailable', 'boom');
      store.dismissFailure();
      expect(store.failure()).toBeNull();
    });
  });

  it('assistErrorMessage copes with a non-HTTP error', () => {
    expect(assistErrorMessage(new Error('x'))).toContain('No se pudo');
    expect(assistErrorMessage(new HttpErrorResponse({ status: 401, error: { error: { code: 'unauthorized', message: 'x' } } }))).toContain('token');
  });
});
