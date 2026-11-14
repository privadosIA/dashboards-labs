import { defaultParams, readDefault } from '@lab/animation-core';
import { serverCatalog, serverDesign, serverDetail, serverPiece, serverDraft, serverPreset, serverReference } from './server.fixture';
import { toDraftReview, toSceneBatch, toPieceReview, toSceneApproval, fromSceneInput, fromDesign, fromDraftInput, fromDraftText, fromPreset, previewAddress, toDraft, toDraftForm, toPart, fromReferenceInput, fromReferencePatch, fromScript, frameAddress, toCatalog, toPreset, toReference, toReferenceForm, toScript, toSongMap, toDesign, toDetail, toPiece, toProposal, toProposalState, fromPropose, toAssistModels, toRequest, toSong, toSongs } from './server-mapping';

const urlOf = (a: string) => `http://server${a}`;

describe('the songs of the library', () => {
  it('become songs with their audio and cover as addresses of the project', () => {
    const song = toSong({ key: 'p/t/7', project: 'p', track_id: 't', variant: 1, title: ' Quiet ', audio_seconds: 48, instrumental: true, file: 'out/p/t_v1.mp3', cover: 'out/p/cover art.png' }, urlOf)!;
    expect(song).toEqual({
      key: 'p/t/7',
      project: 'p',
      trackId: 't',
      variant: 1,
      title: 'Quiet',
      seconds: 48,
      instrumental: true,
      audio: 'http://server/api/projects/p/artifacts/out/p/t_v1.mp3',
      cover: 'http://server/api/projects/p/artifacts/out/p/cover%20art.png',
    });
  });

  it('take the track for a title and a key of their own when the server gives neither, and leave out one with no track', () => {
    expect(toSong({ project: 'p', track_id: 't' }, urlOf)).toMatchObject({ key: 'p/t/0', title: 't', variant: 0, seconds: 0, instrumental: false });
    expect(toSongs([{ project: 'p' }, { track_id: 't' }, { project: 'p', track_id: 't' }], urlOf)).toHaveLength(1);
  });
});

describe('the catalog', () => {
  it('keeps the parts with their levels, limits and the marks of the server, and the options of the page', () => {
    const catalog = toCatalog(serverCatalog);
    expect(catalog.parts.map((p) => p.name)).toEqual(['toggle', 'counter', 'cards']);
    expect(catalog.parts[2]).toMatchObject({ levels: ['medium', 'advanced'], manual: true, costMs: 85 });
    expect(catalog.parts[0].manual).toBe(false);
    expect(catalog.parts[0].params[0]).toEqual({ name: 'label', type: 'string', default: 'allow', maxLength: 20 });
    expect(catalog.parts[1].params[1]).toEqual({ name: 'speed', type: 'number', default: '1.5', min: 0.5, max: 4 });
    expect(catalog.parts[2].params[0].options).toEqual(['left', 'center']);
    expect(catalog).toMatchObject({ levels: ['simple', 'medium', 'advanced'], styles: ['typographic', 'illustrated'], frameRates: [24, 30, 60], fonts: ['Inter', 'Space Grotesk'], modes: ['dark', 'light'], actions: ['enter', 'bounce'] });
    expect(catalog.characters[0]).toEqual({ name: 'bot', description: 'A robot', poses: ['idle', 'wave'], expressions: ['neutral', 'happy'] });
  });

  it('drops a level, style or mode the dashboard does not know instead of offering it', () => {
    const catalog = toCatalog({ ...serverCatalog, levels: ['simple', 'ultra'], styles: ['typographic', 'cartoon'], modes: ['dark', 'sepia'] });
    expect(catalog.levels).toEqual(['simple']);
    expect(catalog.styles).toEqual(['typographic']);
    expect(catalog.modes).toEqual(['dark']);
  });
});

describe('the default of a parameter, which the server writes as a text', () => {
  const parts = toCatalog(serverCatalog).parts;
  it('is read by its type', () => {
    expect(readDefault(parts[0].params[0])).toBe('allow');
    expect(readDefault(parts[0].params[1])).toBe(true);
    expect(readDefault(parts[1].params[0])).toBe(100);
    expect(readDefault(parts[1].params[1])).toBe(1.5);
    expect(readDefault(parts[2].params[0])).toBe('left');
    expect(defaultParams(parts[1])).toEqual({ to: 100, speed: 1.5 });
  });

  it('is left out when the text does not read as its type', () => {
    expect(readDefault({ name: 'n', type: 'int', default: '2.5' })).toBeUndefined();
    expect(readDefault({ name: 'n', type: 'int', default: '' })).toBeUndefined();
    expect(readDefault({ name: 'n', type: 'number', default: 'abc' })).toBeUndefined();
    expect(readDefault({ name: 'b', type: 'bool', default: 'yes' })).toBeUndefined();
    expect(defaultParams({ ...parts[1], params: [{ name: 'n', type: 'int', default: 'x' }] })).toEqual({});
  });
});

describe('a piece', () => {
  it('becomes a list entry with its source, forecast and, when done, its video', () => {
    const piece = toPiece(serverPiece({ state: 'done', progress: 100, video: '/api/projects/api-mm-1/artifacts/out/api-mm-1.mp4', size_bytes: 9000 }));
    expect(piece).toMatchObject({ id: 'api-mm-1', state: 'done', progress: 100, source: { project: 'demo-musica', trackId: 'track-1', variant: 0 }, estimate: { seconds: 40, frames: 600 }, sizeBytes: 9000, video: '/api/projects/api-mm-1/artifacts/out/api-mm-1.mp4' });
    expect(piece.createdAt).toBe(Date.parse('2026-11-06T10:00:00Z'));
    expect('error' in piece).toBe(false);
  });

  it('turns the video address into one the server\'s page can open', () => {
    const piece = toPiece(serverPiece({ state: 'done', video: '/api/projects/api-mm-1/artifacts/out/api-mm-1.mp4' }), urlOf);
    expect(piece.video).toBe('http://server/api/projects/api-mm-1/artifacts/out/api-mm-1.mp4');
    expect(toDetail(serverDetail({ state: 'done', video: '/v.mp4' }), urlOf).video).toBe('http://server/v.mp4');
  });

  it('carries the error of a failed one and takes the id for a title when it has none', () => {
    const piece = toPiece(serverPiece({ state: 'failed', error: 'Chrome closed', title: undefined }));
    expect(piece).toMatchObject({ state: 'failed', error: 'Chrome closed', title: 'api-mm-1' });
  });

  it('becomes a detail with the design, script, origin and song map', () => {
    const detail = toDetail(serverDetail());
    expect(detail.design).toEqual({ design: expect.objectContaining({ accent: '#ff5a3c', defaultMode: 'dark', modes: { chorus: 'light' } }), source: 'fallback', edited: false });
    expect(detail.script.pieces[0]).toMatchObject({ id: 'p1', part: 'toggle' });
    expect(detail.scriptSource).toBe('fallback');
    expect(detail.songMap).toMatchObject({ duration: 20, bpm: 96, beatBase: 4, gridAnchored: true, wordsEstimated: true, loudnessHop: 0.25 });
    expect(detail.songMap.sections[0]).toEqual({ tag: 'verse', start: 0, end: 20 });
  });

  it('reads the font stacks of the catalog when the server gives them', () => {
    expect(toCatalog(serverCatalog).fontStacks).toEqual({ Inter: '"Inter", sans-serif', 'Space Grotesk': '"Space Grotesk", sans-serif' });
    const { font_stacks: _f, ...old } = serverCatalog;
    expect(toCatalog(old as never).fontStacks).toBeUndefined();
  });

  it('reads what the server\'s scripts support and which parameters may animate, and nothing for a server that says neither', () => {
    const catalog = toCatalog(serverCatalog);
    expect(catalog.features).toEqual(['animate', 'layers']);
    expect(catalog.parts.flatMap((p) => p.params.filter((q) => q.animatable).map((q) => `${p.name}.${q.name}`))).toEqual(['counter.to']);
    const { features: _f, ...old } = serverCatalog;
    expect(toCatalog(old as never).features).toEqual([]);
  });

  it('carries the layers of a script both ways as they are, with the keyframes of their items', () => {
    const script = { version: 1 as const, pieces: [{ id: 'p1', start: 0, end: 20, part: 'toggle' }], layers: [{ id: 'strip', items: [{ part: 'counter', params: { to: 5 }, start: 2, end: 12, animate: { to: [{ t: 0, value: 1 }, { t: 10, value: 9, ease: 'out' }] } }] }, { id: 'top', items: [] }] };
    const mapped = toScript(script as never);
    expect(mapped).toEqual(script);
    expect(mapped.layers).not.toBe(script.layers);
    expect(fromScript(mapped)).toEqual(script);
  });

  it('carries the keyframes of a script both ways as they are, on a piece and on an extra, with the ease left out where the server left it out', () => {
    const script = { version: 1 as const, pieces: [{ id: 'p1', start: 0, end: 8, part: 'counter', params: { to: 5 }, animate: { to: [{ t: 0, value: 0 }, { t: 8, value: 100, ease: 'out' }] }, with: [{ part: 'toggle', animate: { label: [{ t: 0, value: 'a', ease: 'step' }, { t: 4, value: 'b' }] } }] }] };
    const mapped = toScript(script as never);
    expect(mapped).toEqual(script);
    expect(mapped).not.toBe(script);
    expect('ease' in mapped.pieces[0].animate!['to'][0]).toBe(false);
    expect(fromScript(mapped)).toEqual(script);
  });

  it('reads where the beat counting starts and whether the grid was found, with the old defaults when the server leaves them out', () => {
    const { beat_base: _b, grid_anchored: _g, ...old } = serverDetail().song_map!;
    expect(toSongMap(old as never)).toMatchObject({ beatBase: 0, gridAnchored: true });
    expect(toSongMap({ ...old, beat_base: 7, grid_anchored: false } as never)).toMatchObject({ beatBase: 7, gridAnchored: false });
  });

  it('is refused as a detail when the server left out its design, script or song map', () => {
    expect(() => toDetail(serverPiece())).toThrow(/api-mm-1/);
  });

  it('keeps a field of a script piece that the editor does not know, in both directions', () => {
    const answer = serverDetail();
    (answer.script!.pieces[0] as unknown as Record<string, unknown>)['x_editor'] = { lane: 3 };
    const script = toScript(answer.script!);
    expect((script.pieces[0] as unknown as Record<string, unknown>)['x_editor']).toEqual({ lane: 3 });
    expect((fromScript(script).pieces[0] as unknown as Record<string, unknown>)['x_editor']).toEqual({ lane: 3 });
  });

  it('does not share the script with the answer it came from', () => {
    const answer = serverDetail();
    const detail = toDetail(answer);
    (detail.script.pieces as unknown as { part: string }[])[0].part = 'changed';
    expect(answer.script!.pieces[0].part).toBe('toggle');
  });
});

describe('what is sent', () => {
  it('is a piece request with the dashboard\'s own client name', () => {
    expect(toRequest({ key: 'k', project: 'p', trackId: 't', variant: 2, title: 'T', seconds: 5, instrumental: false }, { style: 'illustrated', level: 'medium', fps: 24, resolution: '1280x720' }, 'video-anim')).toEqual({
      project: 'p',
      track_id: 't',
      variant: 2,
      style: 'illustrated',
      level: 'medium',
      fps: 24,
      resolution: '1280x720',
      client: 'video-anim',
    });
  });

  it('turns a design back into the server\'s names and a design from them', () => {
    const design = toDesign(serverDetail().design!.design);
    expect(fromDesign(design)).toEqual(serverDetail().design!.design);
  });

  it('copies a script to send', () => {
    const script = toDetail(serverDetail()).script;
    expect(fromScript(script)).toEqual(script);
    expect(fromScript(script)).not.toBe(script);
  });
});

describe('a proposal', () => {
  it('says where it came from and lists what the level replaced', () => {
    const detail = toDetail(serverDetail());
    const proposal = toProposal({ what: 'script', source: 'fallback', replacements: [{ piece: 'p1', from: 'wire-sphere', to: 'toggle' }] }, detail);
    expect(proposal).toEqual({ what: 'script', source: 'fallback', replacements: [{ piece: 'p1', from: 'wire-sphere', to: 'toggle' }], piece: detail });
    expect(toProposal({ what: 'design', source: 'assistant' }, detail).replacements).toEqual([]);
  });
});

describe('the styles, the words and the notices', () => {
  it('keep a verse and a hit style the design has and do not send a plain or empty one', () => {
    expect(toDesign({ ...serverDesign, verse_style: 'karaoke', hit_style: 'glow' })).toMatchObject({ verseStyle: 'karaoke', hitStyle: 'glow' });
    const plain = toDesign({ ...serverDesign, verse_style: 'plain' });
    expect('verseStyle' in plain).toBe(false);
    expect('hitStyle' in plain).toBe(false);
    expect(fromDesign({ ...toDesign(serverDesign), verseStyle: 'karaoke' })).toMatchObject({ verse_style: 'karaoke' });
    const sent = fromDesign({ ...toDesign(serverDesign), verseStyle: 'plain' });
    expect('verse_style' in sent).toBe(false);
    expect('hit_style' in sent).toBe(false);
  });

  it('keep glow, and a style the dashboard does not know as the server wrote it', () => {
    expect(toDesign({ ...serverDesign, verse_style: 'glow' }).verseStyle).toBe('glow');
    const unknown = toDesign({ ...serverDesign, verse_style: 'neon' as never });
    expect(unknown.verseStyle).toBe('neon');
    expect(fromDesign(unknown).verse_style).toBe('neon');
  });

  it('carry words_note and script_warning only when the answer has them', () => {
    expect(toDetail(serverDetail({ words_note: 'no whisper', script_warning: '3 pieces' }))).toMatchObject({ notice: 'no whisper', scriptWarning: '3 pieces' });
    const quiet = toDetail(serverDetail());
    expect('notice' in quiet).toBe(false);
    expect('scriptWarning' in quiet).toBe(false);
  });

  it('ask for the words to be heard only when the person did', () => {
    const song = { key: 'k', project: 'p', trackId: 't', variant: 0, title: 'T', seconds: 10, instrumental: false };
    const choices = { style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720' } as const;
    expect('transcribe' in toRequest(song, choices, 'video-anim')).toBe(false);
    expect(toRequest(song, { ...choices, hearWords: true }, 'video-anim').transcribe).toBe(true);
  });
});

describe('what the script carries that this dashboard has no name for', () => {
  const piece = { id: 'p1', start: 0, end: 20, part: 'toggle', params: { label: 'allow' }, with: [{ part: 'counter', params: { to: 5 } }], design: { accent: '#00ff00', verse_style: 'glow' }, future: { a: [1, 2] } };
  const server = { version: 1 as const, pieces: [piece] } as never;

  it('comes back from the script as the server gave it, in both directions', () => {
    expect(fromScript(toScript(server))).toEqual(server);
    expect(toScript(server)).not.toBe(server);
  });
});

describe('references', () => {
  it('become references whose key frames are addresses of the server, with the analysis read as the contract gives it', () => {
    const r = toReference(serverReference(), urlOf);
    expect(r).toMatchObject({ id: 'ref-1', title: 'A good video', notes: 'fast cuts', tags: ['pop'], state: 'ready', source: 'https://www.youtube.com/watch?v=abc' });
    expect(r.analysis!.frames).toEqual(['http://server/api/music-motion/references/ref-1/frames/01.jpg', 'http://server/api/music-motion/references/ref-1/frames/02%20b.jpg']);
    expect(r.analysis).toMatchObject({ cuts: 24, meanShot: 3.75, tempo: 112, key: 'A minor', description: 'Warm colours.' });
    expect(r.analysis!.thirds).toHaveLength(2);
    expect(frameAddress('a/b', 'c d.jpg')).toBe('/api/music-motion/references/a%2Fb/frames/c%20d.jpg');
  });

  it('say why there is no description, and leave out what the server leaves out', () => {
    const r = toReference(serverReference({ analysis: { ...serverReference().analysis!, description: undefined, description_note: 'no vision model', tempo: undefined, key: undefined } }), urlOf);
    expect(r.analysis!.descriptionNote).toBe('no vision model');
    for (const k of ['description', 'tempo', 'key']) expect(k in r.analysis!).toBe(false);
  });

  it('show an analysing one with no analysis and a failed one with its reason, and take the id for a title when there is none', () => {
    const analysing = toReference(serverReference({ state: 'analysing', analysis: undefined, title: '' }));
    expect(analysing).toMatchObject({ state: 'analysing', title: 'ref-1' });
    expect('analysis' in analysing).toBe(false);
    expect(toReference(serverReference({ state: 'failed', error: 'no video stream', analysis: undefined })).error).toBe('no video stream');
  });

  it('go to the server as JSON for an address and as a form with the tags as a JSON list for a file', () => {
    expect(fromReferenceInput({ url: ' https://youtu.be/x ', title: ' T ', tags: ['a', 'b'] })).toEqual({ url: 'https://youtu.be/x', title: 'T', tags: ['a', 'b'] });
    expect(fromReferenceInput({ url: 'https://youtu.be/x' })).toEqual({ url: 'https://youtu.be/x' });
    const form = toReferenceForm({ file: new File(['x'], 'v.mp4', { type: 'video/mp4' }), title: 'T', notes: 'n', tags: ['a', 'b'] });
    expect((form.get('file') as File).name).toBe('v.mp4');
    expect([form.get('title'), form.get('notes'), form.get('tags')]).toEqual(['T', 'n', '["a","b"]']);
  });

  it('send only the fields of a patch that are in it', () => {
    expect(fromReferencePatch({ title: 'New' })).toEqual({ title: 'New' });
    expect(fromReferencePatch({ tags: [] })).toEqual({ tags: [] });
  });
});

describe('presets', () => {
  it('become presets with their design, rhythm, parts and adjustments, and go back as a whole', () => {
    const p = toPreset(serverPreset());
    expect(p).toMatchObject({ id: 'preset-1', name: 'Warm pop', referenceId: 'ref-1', rhythm: 6, parts: ['toggle'], adjustments: ['accent adjusted'] });
    expect(p.design.accent).toBe('#ff5a3c');
    expect(fromPreset({ name: p.name, design: p.design, rhythm: p.rhythm, parts: p.parts })).toEqual({ name: 'Warm pop', design: fromDesign(p.design), rhythm: 6, parts: ['toggle'] });
  });

  it('keep a preset whose reference is gone', () => {
    const p = toPreset(serverPreset({ reference_id: undefined }));
    expect('referenceId' in p).toBe(false);
  });

  it('ask for a preset when a piece is made with one, and for none otherwise', () => {
    const song = { key: 'k', project: 'p', trackId: 't', variant: 0, title: 'T', seconds: 10, instrumental: false };
    const choices = { style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720' } as const;
    expect('preset' in toRequest(song, choices, 'video-anim')).toBe(false);
    expect(toRequest(song, { ...choices, presetId: 'preset-1' }, 'video-anim').preset).toBe('preset-1');
    expect(toDetail(serverDetail({ preset: 'preset-1' })).preset).toBe('preset-1');
    expect('preset' in toDetail(serverDetail())).toBe(false);
  });
});

describe('part drafts', () => {
  it('become drafts whose preview frames are addresses of the server, with the text only when one is read', () => {
    const d = toDraft(serverDraft(), urlOf);
    expect(d).toMatchObject({ id: 'draft-1', state: 'ready', request: 'a clock that ticks', withPicture: true, source: 'reference:ref-1/03.jpg', description: 'A dark scene.', attempts: 2, name: 'ticking-clock', manifest: '{"name":"ticking-clock"}', fragment: '<div></div>' });
    expect(d.preview).toEqual(['http://server/api/music-motion/part-drafts/draft-1/preview/01.png', 'http://server/api/music-motion/part-drafts/draft-1/preview/02%20b.png']);
    expect(previewAddress('a/b', 'c d.png')).toBe('/api/music-motion/part-drafts/a%2Fb/preview/c%20d.png');
    const listed = toDraft(serverDraft({ manifest: undefined, fragment: undefined }));
    expect('manifest' in listed).toBe(false);
    expect('fragment' in listed).toBe(false);
  });

  it('show one being written with no name, and a failed one with its error and problems', () => {
    const writing = toDraft(serverDraft({ state: 'writing', name: undefined, preview: [], manifest: undefined, fragment: undefined, source: undefined, description: undefined, with_picture: false }));
    expect(writing).toMatchObject({ state: 'writing', withPicture: false, preview: [] });
    for (const k of ['name', 'source', 'description', 'error']) expect(k in writing).toBe(false);
    const failed = toDraft(serverDraft({ state: 'failed', error: 'no valid part after 3 attempts', problems: ['part.html: empty'] }));
    expect(failed).toMatchObject({ error: 'no valid part after 3 attempts', problems: ['part.html: empty'] });
  });

  it('go to the server as JSON with a frame of a reference and as a form with an uploaded picture', () => {
    expect(fromDraftInput({ request: ' a clock ', referenceId: 'ref-1', frame: '03.jpg' })).toEqual({ request: 'a clock', reference_id: 'ref-1', frame: '03.jpg' });
    expect(fromDraftInput({ request: 'a clock' })).toEqual({ request: 'a clock' });
    const form = toDraftForm({ request: ' a clock ', file: new File(['x'], 'p.png', { type: 'image/png' }) });
    expect([form.get('request'), (form.get('file') as File).name]).toEqual(['a clock', 'p.png']);
    expect(fromDraftText({ manifest: 'm', fragment: 'f' })).toEqual({ manifest: 'm', fragment: 'f' });
  });

  it('read an approved part as the catalog lists it', () => {
    const part = toPart({ name: 'ticking-clock', description: 'A clock', levels: ['simple'], cost_ms: 60, source: 'user', params: [] });
    expect(part).toMatchObject({ name: 'ticking-clock', levels: ['simple'], costMs: 60, manual: false, params: [] });
  });
});

describe('the prompt and the proposal', () => {
  it('sends the prompt of a piece when there is one, and nothing when there is not', () => {
    const song = { key: 'a/b/1', project: 'a', trackId: 'b', variant: 0, title: 't', seconds: 10, instrumental: false };
    const choices = { style: 'typographic' as const, level: 'medium' as const, fps: 30, resolution: '1280x720' };
    expect(toRequest(song, { ...choices, prompt: 'a calm night' }, 'video-anim')).toMatchObject({ prompt: 'a calm night' });
    expect('prompt' in toRequest(song, choices, 'video-anim')).toBe(false);
    expect('prompt' in toRequest(song, { ...choices, prompt: '' }, 'video-anim')).toBe(false);
  });

  it('reads the prompt and the background proposal of a piece, and the times as milliseconds', () => {
    const piece = toDetail(serverDetail({ prompt: 'a calm night', proposal: { state: 'done', what: 'all', model: 'qwen3:8b', started_at: '2026-11-09T10:00:00Z', finished_at: '2026-11-09T10:01:30Z', design_source: 'assistant', script_source: 'fallback', script_fallback_reason: 'the wait timed out' } }));
    expect(piece.prompt).toBe('a calm night');
    expect(piece.proposal).toEqual({ state: 'done', what: 'all', model: 'qwen3:8b', startedAt: Date.parse('2026-11-09T10:00:00Z'), finishedAt: Date.parse('2026-11-09T10:01:30Z'), design: { source: 'assistant' }, script: { source: 'fallback', reason: 'the wait timed out' } });
    expect(toDetail(serverDetail()).proposal).toBeUndefined();
    expect('prompt' in toDetail(serverDetail())).toBe(false);
  });

  it('reads a proposal that is still waiting, with no end and no sources, and one that failed with its reason', () => {
    expect(toProposalState({ state: 'waiting', what: 'all', started_at: '2026-11-09T10:00:00Z' })).toEqual({ state: 'waiting', what: 'all', startedAt: Date.parse('2026-11-09T10:00:00Z') });
    expect(toProposalState({ state: 'failed', what: 'all', started_at: '2026-11-09T10:00:00Z', error: 'the server stopped' })).toMatchObject({ state: 'failed', error: 'the server stopped' });
  });

  it('writes what a proposal sends: the part, the prompt, the model and, for the background, async', () => {
    expect(fromPropose({ what: 'design' })).toEqual({ what: 'design' });
    expect(fromPropose({ what: 'script', prompt: 'p', model: 'qwen3:8b' })).toEqual({ what: 'script', prompt: 'p', model: 'qwen3:8b' });
    expect(fromPropose({ what: 'all', prompt: '' }, true)).toEqual({ what: 'all', prompt: '', async: true });
  });

  it('reads the model and the reason of an answer', () => {
    const piece = toDetail(serverDetail());
    expect(toProposal({ what: 'script', source: 'fallback', fallback_reason: 'a run holds the memory', model: 'qwen3:8b' }, piece)).toMatchObject({ fallbackReason: 'a run holds the memory', model: 'qwen3:8b' });
    expect('fallbackReason' in toProposal({ what: 'script', source: 'assistant' }, piece)).toBe(false);
  });

  it('reads the installed models, marking the ones that do not fit and skipping nameless ones', () => {
    expect(toAssistModels({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', size_bytes: 5, fits: true }, { name: 'big', size_bytes: 9, fits: false }, { size_bytes: 1 }] })).toEqual({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 5, fits: true }, { name: 'big', sizeBytes: 9, fits: false }] });
    expect(toAssistModels({})).toEqual({ default: '', models: [] });
  });
});

describe('scenes, review and theme', () => {
  it('reads the fonts the pages carry with their licence, and the scene a part is written for', () => {
    const c = toCatalog({ ...serverCatalog, font_files: { inter: { family: 'Inter', weights: [400, 700], licence: 'OFL-1.1' } } });
    expect(c.fontFiles).toEqual({ inter: { family: 'Inter', weights: [400, 700], licence: 'OFL-1.1' } });
    expect(toPart({ name: 's', description: '', levels: ['simple'], cost_ms: 1, source: 'user', verse: 'own', hit: 'page', scene: { piece: 'p', script_piece: 'q' }, params: [] })).toMatchObject({ verse: 'own', scene: { piece: 'p', scriptPiece: 'q' } });
    expect('hit' in toPart({ name: 's', description: '', levels: [], cost_ms: 1, source: 'user', hit: 'page', params: [] })).toBe(false);
  });

  it('keeps the theme and the crossfade of a design both ways, and sends none when there is none', () => {
    const theme = { css: '#verse{}', assets: { m: '<svg/>' }, hud: { tl: 'LIVE' } };
    const design = toDesign({ ...serverDesign, theme, transition_seconds: 0.3 });
    expect(design).toMatchObject({ theme, transitionSeconds: 0.3 });
    expect(fromDesign(design)).toMatchObject({ theme, transition_seconds: 0.3 });
    const plain = fromDesign(toDesign(serverDesign));
    expect('theme' in plain).toBe(false);
    expect('transition_seconds' in plain).toBe(false);
    expect('theme' in fromDesign({ ...design, theme: { css: '', hud: { tl: '' } } })).toBe(false);
  });

  it('keeps transition_seconds of a script piece as the server writes it', () => {
    const script = toScript({ version: 1, pieces: [{ id: 'p1', start: 0, end: 1, part: 'toggle', transition_seconds: 0.2 }] });
    expect(script.pieces[0].transition_seconds).toBe(0.2);
    expect(fromScript(script).pieces[0]).toMatchObject({ transition_seconds: 0.2 });
  });

  it('reads the scene, brief, review ask, review with its climb and warnings of a draft', () => {
    const d = toDraft(serverDraft({ scene: { piece: 'p', script_piece: 'q' }, brief: 'a door', review_ask: { min: 7, attempts: 2 }, warnings: ['{{asset:m}}: x'], review: { score: 6, verdict: 'weak', notes: ['n'], model: 'm', attempts: [{ score: 4, verdict: 'fail', notes: ['a'] }, { score: 6, verdict: 'weak', notes: [] }] } }));
    expect(d).toMatchObject({ scene: { piece: 'p', scriptPiece: 'q' }, brief: 'a door', reviewAsk: { min: 7, attempts: 2 }, warnings: ['{{asset:m}}: x'], review: { score: 6, verdict: 'weak', notes: ['n'] } });
    expect(d.review!.attempts.map((a) => a.score)).toEqual([4, 6]);
    expect(toDraftReview({ error: 'no vision model' })).toEqual({ notes: [], attempts: [], error: 'no vision model' });
  });

  it('writes a scene request without the request text when there is none, and with it when there is one', () => {
    expect(fromDraftInput({ request: ' ', scene: { piece: 'p', scriptPiece: 'q' }, review: { min: 7 } })).toEqual({ scene: { piece: 'p', script_piece: 'q' }, review: { min: 7 } });
    expect(fromDraftInput({ request: 'idea', scene: { piece: 'p', scriptPiece: 'q', brief: 'b' } })).toMatchObject({ request: 'idea', scene: { brief: 'b' } });
    expect(fromDraftInput({ request: 'a part', review: false })).toEqual({ request: 'a part', review: false });
  });

  it('reads a batch, a review and an approval, leaving out the verdict a dashboard does not know', () => {
    expect(toSceneBatch({ state: 'done', done: 1, total: 1, brief_mode: 'literal', started_at: 'x', review: { min: 7 }, drafts: [{ script_piece: 'p1', state: 'approved' }] })).toEqual({ state: 'done', done: 1, total: 1, drafts: [{ scriptPiece: 'p1', state: 'approved' }], briefMode: 'literal', review: { min: 7 } });
    expect(toPieceReview({ state: 'done', started_at: 'x', scenes: [{ script_piece: 'p1', score: 4, verdict: 'fail', notes: ['two accents'] }, { script_piece: 'p2', score: 9, verdict: 'great' as never, notes: [] }], overall: { score: 6, notes: [], repeated: [['p1', 'p2']] } })).toMatchObject({ scenes: [{ verdict: 'fail' }, { scriptPiece: 'p2' }], overall: { repeated: [['p1', 'p2']] } });
    expect('verdict' in toPieceReview({ state: 'done', started_at: 'x', scenes: [{ script_piece: 'p2', score: 9, verdict: 'great' as never, notes: [] }] }).scenes[0]).toBe(false);
    expect(toSceneApproval({ approved: [{ script_piece: 'p', part: 'a', draft_id: 'd' }], not_approved: [], script: { version: 1, pieces: [] } }).approved).toEqual([{ scriptPiece: 'p', part: 'a', draftId: 'd' }]);
    expect(fromSceneInput({ scriptPieces: [], review: false })).toEqual({ review: false });
  });
});
