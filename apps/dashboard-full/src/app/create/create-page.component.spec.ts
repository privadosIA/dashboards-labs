import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RequestPlan } from '../core/api.models';
import { ALL_AVAILABLE } from '../core/availability.fake';
import { AvailabilityStore } from '../core/availability.store';
import { EnvironmentStore } from '../core/environment.store';
import { CreateFlowService, RequestItem } from './create-flow.service';
import { CreatePageComponent } from './create-page.component';
import { RecorderEnv, RecorderService } from './recorder.service';

const env = (over: Partial<RecorderEnv> = {}): RecorderEnv => ({
  isSecureContext: true,
  getUserMedia: async () => ({}) as MediaStream,
  hasMediaRecorder: true,
  isTypeSupported: () => true,
  newRecorder: () => ({}) as MediaRecorder,
  ...over,
});

function mount(recorder: Partial<RecorderEnv>, dictation: { available: boolean; reason?: string } | undefined) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(RecorderService).env = env(recorder);
  TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
  TestBed.inject(EnvironmentStore).report.set({ binaries: [], models: [], voices: [], loras: [], gpus: [], dictation } as never);
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CreatePageComponent);
  fixture.detectChanges();
  // The page asks for the projects of earlier requests when it opens.
  http.match((r) => r.url.endsWith('/projects')).forEach((r) => r.flush([]));
  http.match(() => true).forEach((r) => r.flush({}));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http, flow: TestBed.inject(CreateFlowService) };
}

/**
 * Answers what a request makes first (the engines and the machine, read to know which generators a song can
 * use) with empty bodies, until the plan request arrives, and answers that one. Returns the plan request.
 */
async function answerPlan(http: HttpTestingController, body: object, opts?: { status: number; statusText: string }, others: Record<string, object> = {}) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r));
    for (const r of http.match((x) => /\/(music\/engines|assets\/catalog|environment)(\?|$)/.test(x.url))) {
      const key = Object.keys(others).find((k) => r.request.url.endsWith(k));
      r.flush(key ? others[key] : {});
    }
    const found = http.match((x) => x.url.endsWith('/assist/request'));
    if (found.length > 0) {
      found[0].flush(body, opts);
      return found[0].request;
    }
  }
  throw new Error('the plan request never came');
}

const q = (el: HTMLElement, id: string) => el.querySelector(`[data-testid=${id}]`);

describe('CreatePageComponent', () => {
  it('offers the microphone on a secure page where the server can transcribe', () => {
    const { fixture, el } = mount({}, { available: true });
    expect(q(el, 'create-pick')).not.toBeNull(); // the kind is chosen first
    expect(q(el, 'create-text')).toBeNull();
    (q(el, 'pick-auto') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(el, 'create-mic')).not.toBeNull();
    expect(q(el, 'create-listen')).not.toBeNull();
    expect(q(el, 'create-insecure')).toBeNull();
    expect(q(el, 'create-empty')).not.toBeNull();
  });

  it('hides the microphone on an insecure page and says where it is explained', () => {
    const { fixture, el } = mount({ isSecureContext: false }, { available: true });
    (q(el, 'pick-auto') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(el, 'create-mic')).toBeNull();
    expect(q(el, 'create-listen')).toBeNull();
    expect(q(el, 'create-insecure')?.textContent).toContain('HTTPS');
    expect(q(el, 'create-text')).not.toBeNull(); // writing still works
  });

  it('hides the microphone and gives the reason when the server cannot transcribe', () => {
    const { fixture, el } = mount({}, { available: false, reason: 'the Whisper model is not installed' });
    (q(el, 'pick-auto') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(el, 'create-mic')).toBeNull();
    expect(q(el, 'create-no-dictation')?.textContent).toContain('Whisper model');
  });

  it('shows the card of what was understood and lets the kind be changed with a tap', async () => {
    const { fixture, el, http, flow } = mount({}, { available: true });
    const plan: RequestPlan = { kind: 'video', kind_source: 'model', title: 'Gato', image_prompt: 'A cat.', motion_prompt: 'It sways.', instrumental: false, warnings: [] };
    const sent = flow.submit('un gato', []);
    await answerPlan(http, plan);
    await sent;
    fixture.detectChanges();
    await fixture.whenStable(); // ngModel writes its value after a tick
    fixture.detectChanges();
    expect(q(el, 'create-review')).not.toBeNull();
    expect((q(el, 'create-title') as HTMLInputElement).value).toBe('Gato');
    (q(el, 'kind-music') as HTMLElement).querySelector('button')!.click();
    fixture.detectChanges();
    expect(flow.items()[0].draft()?.kind).toBe('music');
    expect(q(el, 'create-instrumental')).not.toBeNull();
  });

  it('offers the levels and the type of video, and a song starts at draft', async () => {
    const { fixture, el, http, flow } = mount({}, { available: true });
    const plan: RequestPlan = { kind: 'video', kind_source: 'model', title: 'Gato', image_prompt: 'A cat.', motion_prompt: 'It sways.', instrumental: false, warnings: [] };
    const sent = flow.submit('un gato', []);
    await answerPlan(http, plan);
    await sent;
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE); // mount answered the page's own request with an empty body
    fixture.detectChanges();
    expect(q(el, 'create-levels')).not.toBeNull();
    expect(q(el, 'level-auto')).not.toBeNull();
    expect(q(el, 'create-animation')).not.toBeNull();
    flow.setKind(flow.items()[0], 'music');
    fixture.detectChanges();
    expect(flow.items()[0].draft()?.resolution).toBe('draft');
    expect(q(el, 'level-auto')).toBeNull(); // a song has no "automatic"
    expect(q(el, 'create-animation')).toBeNull();
  });

  it('offers «Limpiar pantalla» only when there is something on the screen, and it deletes nothing', async () => {
    const { fixture, el, http, flow } = mount({}, { available: true });
    expect(q(el, 'create-clear-screen')).toBeNull();
    const plan: RequestPlan = { kind: 'image', kind_source: 'model', title: 'Gato', image_prompt: 'A cat.', instrumental: false, warnings: [] };
    const sent = flow.submit('un gato', []);
    await answerPlan(http, plan);
    await sent;
    fixture.detectChanges();
    const button = q(el, 'create-clear-screen') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(flow.items()).toHaveLength(0);
    expect(q(el, 'create-clear-screen')).toBeNull();
    http.expectNone((r) => r.method === 'DELETE');
  });

  it('improves what is typed in the field with the assistant, in place, and brings the old text back', async () => {
    const { fixture, el, http } = mount({}, { available: true });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE); // mount answered the page's own request with an empty body
    fixture.detectChanges();
    (q(el, 'pick-auto') as HTMLButtonElement).click();
    fixture.detectChanges();
    const improve = q(el, 'create-improve') as HTMLButtonElement;
    expect(improve.disabled).toBe(true); // nothing to improve yet
    (fixture.componentInstance as unknown as { text: { set(v: string): void } }).text.set('un gato en la azotea');
    fixture.detectChanges();
    expect((q(el, 'create-improve') as HTMLButtonElement).disabled).toBe(false);
    (q(el, 'create-improve') as HTMLButtonElement).click();
    const req = http.expectOne((x) => x.url.endsWith('/assist'));
    expect(req.request.body).toMatchObject({ task: 'improve', text: 'un gato en la azotea' });
    req.flush({ text: 'Un gato atigrado en una azotea al atardecer, luz cálida.' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((q(el, 'create-text') as HTMLTextAreaElement).value).toContain('atigrado');
    (q(el, 'create-improve-undo') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((q(el, 'create-text') as HTMLTextAreaElement).value).toBe('un gato en la azotea');
    expect(q(el, 'create-improved')).toBeNull();
  });

  it('has no improve button when the assistant is not available', () => {
    const { fixture, el } = mount({}, { available: true });
    (q(el, 'pick-auto') as HTMLButtonElement).click();
    TestBed.inject(AvailabilityStore).data.set(null);
    fixture.detectChanges();
    expect(q(el, 'create-improve')).toBeNull();
  });

  it('sends the kind that was chosen first, goes back without losing the text, and returns to the choice after sending', async () => {
    const { fixture, el, http } = mount({}, { available: true });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    const page = fixture.componentInstance as unknown as { text: { set(v: string): void; (): string }; send(): Promise<void> };
    const composer = () => q(el, 'create-composer') as HTMLElement;
    (q(el, 'pick-video') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(composer().classList.contains('composer--open')).toBe(true); // choosing the kind unfolds the field at once
    (q(el, 'create-fold') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(composer().classList.contains('composer--open')).toBe(false); // «Plegar» folds it
    expect(q(el, 'create-pick')).toBeNull(); // and the kind stays chosen
    (q(el, 'create-text') as HTMLElement).dispatchEvent(new Event('focus')); // tapping the field unfolds it again
    fixture.detectChanges();
    expect(composer().classList.contains('composer--open')).toBe(true);
    page.text.set('una canción triste');
    (q(el, 'create-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(composer().classList.contains('composer--open')).toBe(false); // «Cambiar tipo» goes back with the field folded
    expect(q(el, 'create-pick')).not.toBeNull();
    expect(page.text()).toBe('una canción triste'); // going back keeps the words
    (q(el, 'pick-music') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(el, 'create-kindname')?.textContent).toContain('Música');
    const sent = page.send();
    const plan: RequestPlan = { kind: 'music', kind_source: 'user', title: 'Triste', instrumental: false, warnings: [], caption: 'sad piano', lyrics: '' };
    const req = await answerPlan(http, plan);
    await sent;
    expect(req.body).toMatchObject({ kind: 'music' });
    fixture.detectChanges();
    expect(q(el, 'create-pick')).not.toBeNull();
  });

  it('lets the assistant decide when asked: the request carries no kind', async () => {
    const { fixture, el, http } = mount({}, { available: true });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    const page = fixture.componentInstance as unknown as { text: { set(v: string): void }; send(): Promise<void> };
    (q(el, 'pick-auto') as HTMLButtonElement).click();
    fixture.detectChanges();
    page.text.set('un gato');
    const sent = page.send();
    const plan: RequestPlan = { kind: 'video', kind_source: 'model', title: 'Gato', image_prompt: 'A cat.', motion_prompt: 'It sways.', instrumental: false, warnings: [] };
    const req = await answerPlan(http, plan);
    await sent;
    expect((req.body as Record<string, unknown>)['kind']).toBeUndefined();
  });

  it('«Editar» on a finished picture attaches it to a new picture request, ready for an instruction', async () => {
    const { fixture, el, flow } = mount({}, { available: true });
    const item = new RequestItem('r1', 'un gato', [], 'es');
    item.phase.set('done');
    item.result.set({ kind: 'image', url: '/api/projects/p/out/gato.png' });
    flow.items.set([item]);
    // A plain object, not a Response: jsdom's Blob and Node's Response come from different realms and can hang.
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));
    fixture.detectChanges();
    (q(el, 'create-edit') as HTMLButtonElement).click();
    // The click ends in an async fetch; the view only shows the new state when it is checked again.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(el, 'create-kindname')?.textContent).toContain('Imagen');
    });
    expect(el.querySelector('.chip__name')?.textContent).toContain('resultado.png');
    vi.unstubAllGlobals();
  });

  it('says the assistant was not used when it waits for a run, and still lets the user confirm', async () => {
    const { fixture, el, http, flow } = mount({}, { available: true });
    const sent = flow.submit('un gato en la azotea', []);
    await answerPlan(http, { error: { code: 'conflict', message: 'run x' } }, { status: 409, statusText: 'Conflict' });
    await sent;
    fixture.detectChanges();
    expect(q(el, 'create-manual')).not.toBeNull();
    expect(q(el, 'create-confirm')).not.toBeNull();
  });

  describe('a song and its generator', () => {
    const song: RequestPlan = { kind: 'music', kind_source: 'user', title: 'Desplumadora', instrumental: false, warnings: [], caption: 'fast techno rap', lyrics: '[verse]\nhola' };

    async function songCard(others: Record<string, object> = {}) {
      const ctx = mount({}, { available: true });
      const sent = ctx.flow.submit('una canción tecno', [], 'music');
      const first = await answerPlan(ctx.http, song, undefined, others);
      const item = await sent;
      // The page's own request for the availability was answered with an empty body by mount().
      TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
      ctx.fixture.detectChanges();
      return { ...ctx, item, first };
    }

    it('writes the first suggestion for the only generator the machine can use', async () => {
      const { first, item } = await songCard({ '/music/engines': { engines: { heartmula: { available: true } } }, '/environment': { gpus: [], ram: {}, music: [] } });
      expect(item.generators()).toEqual(['heartmula']);
      expect((first.body as { generator?: string }).generator).toBe('heartmula');
    });

    it('asks the assistant again, with the voice kept, when another generator is chosen', async () => {
      const { item, http, flow } = await songCard();
      item.generators.set(['ace-step', 'heartmula', 'diffrhythm2']);
      const done = flow.chooseGenerator(item, 'diffrhythm2');
      await Promise.resolve();
      const req = http.expectOne((r) => r.url.endsWith('/assist/request'));
      expect(req.request.body).toMatchObject({ kind: 'music', generator: 'diffrhythm2', instrumental: false, seconds: 120, text: 'una canción tecno' });
      req.flush({ ...song, caption: 'pop piano', tags: 'pop,piano', lyrics: '[verse]\nhello' });
      await done;
      expect(item.draft()).toMatchObject({ generator: 'diffrhythm2', tags: 'pop,piano', lyrics: '[verse]\nhello', suggestionEdited: false });
    });

    it('does not offer a voiceless song to a generator that cannot make one', async () => {
      const { item, http, flow } = await songCard();
      item.generators.set(['ace-step', 'diffrhythm2']);
      item.draft.set({ ...item.draft()!, instrumental: true });
      const done = flow.chooseGenerator(item, 'diffrhythm2');
      await Promise.resolve();
      const req = http.expectOne((r) => r.url.endsWith('/assist/request'));
      expect((req.request.body as { instrumental: boolean }).instrumental).toBe(false);
      req.flush(song);
      await done;
      expect(item.draft()?.instrumental).toBe(false);
    });

    it('asks before replacing what the user edited, and leaves everything if they refuse', async () => {
      const { item, http, flow } = await songCard();
      item.generators.set(['ace-step', 'heartmula']);
      item.draft.set({ ...item.draft()!, lyrics: 'mi letra', suggestionEdited: true });
      await flow.chooseGenerator(item, 'heartmula');
      http.expectNone((r) => r.url.endsWith('/assist/request'));
      expect(item.pendingGenerator()).toBe('heartmula');
      flow.cancelPending(item);
      expect(item.pendingGenerator()).toBeNull();
      expect(item.draft()).toMatchObject({ generator: 'auto', lyrics: 'mi letra' });
    });

    it('replaces the edited text once the user accepts', async () => {
      const { item, http, flow } = await songCard();
      item.generators.set(['ace-step', 'heartmula']);
      item.draft.set({ ...item.draft()!, lyrics: 'mi letra', suggestionEdited: true });
      await flow.chooseGenerator(item, 'heartmula');
      const done = flow.acceptPending(item);
      await Promise.resolve();
      http.expectOne((r) => r.url.endsWith('/assist/request')).flush({ ...song, tags: 'techno,rap', lyrics: '[verse]\nnueva' });
      await done;
      expect(item.draft()).toMatchObject({ generator: 'heartmula', tags: 'techno,rap', lyrics: '[verse]\nnueva', suggestionEdited: false });
      expect(item.pendingGenerator()).toBeNull();
    });

    it('keeps the old suggestion and the old generator when the assistant fails', async () => {
      const { item, http, flow } = await songCard();
      item.generators.set(['ace-step', 'heartmula']);
      const done = flow.chooseGenerator(item, 'heartmula');
      await Promise.resolve();
      http.expectOne((r) => r.url.endsWith('/assist/request')).flush({ error: { code: 'conflict', message: 'run x' } }, { status: 409, statusText: 'Conflict' });
      await done;
      expect(item.draft()).toMatchObject({ generator: 'auto', caption: 'fast techno rap' });
      expect(item.suggestNote()).toContain('run en marcha');
    });

    it('fills the tags with a popular combination, and the style sentence with ACE-Step', async () => {
      const { fixture, el, item, flow } = await songCard();
      flow.tagCombos.set([{ id: 'hiphop-beat', name: 'Hip-Hop Beat', tags: ['hip-hop', '808', 'bass', 'rap'] }]);
      item.generators.set(['ace-step', 'heartmula']);
      fixture.detectChanges();
      (q(el, 'combo-hiphop-beat') as HTMLButtonElement).click();
      expect(item.draft()).toMatchObject({ caption: 'hip-hop, 808, bass, rap', suggestionEdited: true });
      item.draft.set({ ...item.draft()!, generator: 'heartmula', suggestionEdited: false });
      fixture.detectChanges();
      (q(el, 'combo-hiphop-beat') as HTMLButtonElement).click();
      expect(item.draft()).toMatchObject({ tags: 'hip-hop,808,bass,rap', suggestionEdited: true });
    });

    it('shows the selector only with two or more generators and hides the voice switch for DiffRhythm2', async () => {
      const { fixture, el, item } = await songCard();
      expect(q(el, 'create-generators')).toBeNull();
      item.generators.set(['ace-step', 'diffrhythm2']);
      fixture.detectChanges();
      expect(q(el, 'create-generators')).not.toBeNull();
      expect(q(el, 'create-instrumental')).not.toBeNull();
      item.draft.set({ ...item.draft()!, generator: 'diffrhythm2' });
      fixture.detectChanges();
      expect(q(el, 'create-instrumental')).toBeNull();
      expect(q(el, 'create-tags-free')).not.toBeNull();
      expect(q(el, 'create-caption')).toBeNull();
    });
  });

  describe('recognising a song that plays', () => {
    const heard = { seconds: 20, language: 'es', no_words: false, bpm: 128, keyscale: 'A minor', style: 'fast techno with a rap voice', theme: 'una desplumadora', request: 'A new original song in this style: fast techno with a rap voice, about 128 BPM, in A minor. It is about: una desplumadora.', warnings: [] };

    it('sends the recording and starts a request for a new song of that kind, with its lyrics unknown to the page', async () => {
      const { http, flow } = mount({}, { available: true });
      await new Promise((r) => setTimeout(r));
      TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE); // mount() answered the page's own request with an empty body
      const done = flow.listen(new Blob(['x']), 'es');
      await Promise.resolve();
      const req = http.expectOne((r) => r.url.includes('/assist/listen'));
      expect(req.request.method).toBe('POST');
      expect(req.request.url).toContain('language=es');
      req.flush(heard);
      const answered = answerPlan(http, { kind: 'music', kind_source: 'user', title: 'Desplumadora', instrumental: false, warnings: [], caption: 'fast techno rap', lyrics: '[verse]\nnueva' });
      const { item } = await done;
      await answered;
      expect(item?.text).toBe(heard.request);
      expect(item?.draft()?.kind).toBe('music');
    });

    it('starts nothing when the style could not be told', async () => {
      const { http, flow } = mount({}, { available: true });
      const done = flow.listen(new Blob(['x']), 'es');
      await Promise.resolve();
      http.expectOne((r) => r.url.includes('/assist/listen')).flush({ ...heard, style: undefined, request: undefined, warnings: ['the assistant could not tell the style of the song'] });
      const { item } = await done;
      expect(item).toBeNull();
      expect(flow.items().length).toBe(0);
    });
  });
});
