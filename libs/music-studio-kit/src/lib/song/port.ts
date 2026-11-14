import type { Observable } from 'rxjs';

import type { ListenOptions, Recognizer } from './listen';
import type { ContainerStatus, EngineId, EngineStatus, GeneratorName, Heard, Song, SongRequest, TagVocabulary, WriteRequest, Written } from './model';
import type { Problem } from './validate';

/** A song was asked for with something wrong in it, or no generator can make it now. Nothing was created. */
export class SongRefused extends Error {
  constructor(
    readonly problems: readonly (Problem | 'generator.unavailable')[],
    message = `the song was refused: ${problems.join(', ')}`,
  ) {
    super(message);
    this.name = 'SongRefused';
  }
}

/** The assistant could not write: it is not there, it is busy with a run, or the model refused. `detail` is the server's own words. */
export class AssistFailed extends Error {
  constructor(
    readonly kind: 'unavailable' | 'busy' | 'refused',
    readonly detail = '',
  ) {
    super(`the assistant could not write the song: ${kind}${detail ? ` (${detail})` : ''}`);
    this.name = 'AssistFailed';
  }
}

/** The server could not listen to the file: it is busy, the piece is too long or too big, it cannot be read, nothing there can listen, or it took too long. */
export class ListenFailed extends Error {
  constructor(readonly kind: 'unavailable' | 'busy' | 'tooLong' | 'unreadable' | 'timeout' | 'badUrl') {
    super(`the server could not listen to the file: ${kind}`);
    this.name = 'ListenFailed';
  }
}

/** The server did not start or stop an engine: a run uses it (`busy`) or it cannot run (`refused`, with the server's `reason` when it gave one). */
export class EngineFailed extends Error {
  constructor(
    readonly kind: 'busy' | 'refused',
    readonly reason = '',
    detail = '',
  ) {
    super(`the engine was not ${kind === 'busy' ? 'stopped' : 'started'}: ${kind}${reason ? ` (${reason})` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'EngineFailed';
  }
}

/**
 * Everything the dashboard needs from whoever writes and makes the songs, and nothing about how it is done. An adapter
 * implements this: the in-memory one lives in this dashboard (it makes no audio); the server one talks to the API.
 *
 * `write`, `generate`, `cancel` and `remove` do their work when subscribed to and emit once.
 */
export interface SongPort {
  /** Which generators can be used now, and why not when they cannot; one entry per generator. */
  engines(): Observable<readonly EngineStatus[]>;
  /** Starts the container of a generator, or of LAION-CLAP, that is stopped (`not_running`); the answer comes back at once, the engine is up when `engines` or `containers` says so. Errors with `EngineFailed`. */
  start(engine: GeneratorName | EngineId): Observable<void>;
  /** Stops and removes the container of an engine. Errors with `EngineFailed` (`busy` when a run uses it). */
  stopEngine(engine: EngineId): Observable<void>;
  /** The engines with a container (HeartMuLa, DiffRhythm2 and LAION-CLAP), whether each can be used and what its container does. */
  containers(): Observable<readonly ContainerStatus[]>;
  /** The style tags to choose from. */
  vocabulary(): Observable<TagVocabulary>;
  /** Asks the assistant for the lyrics and the style. Errors with `AssistFailed`. */
  write(request: WriteRequest): Observable<Written>;
  /** The ways to recognise a song and whether each can be used now. */
  recognizers(): Observable<readonly Recognizer[]>;
  /** Listens to a song or a video (an audio or a video file) and says how it sounds. Errors with `ListenFailed`. */
  listen(file: File, options: ListenOptions): Observable<Heard>;
  /** The same for the address of a YouTube video: the server fetches its audio, measures and hears it and has the assistant describe it. Errors with `ListenFailed`. */
  listenUrl(url: string, generator: GeneratorName, options: ListenOptions): Observable<Heard>;
  /** Asks for a song; emits it as it was created (queued). A refused request errors with `SongRefused` and creates nothing. */
  generate(request: SongRequest): Observable<Song>;
  /** The songs, newest first; emits again whenever one is added, changes or goes away. */
  songs(): Observable<readonly Song[]>;
  /** Each change of one song, starting with its current state, until it finishes. Removing the song ends it. */
  follow(id: string): Observable<Song>;
  /** Stops a song that is queued or running; it ends as cancelled. */
  cancel(id: string): Observable<void>;
  /** Removes a song, cancelling it first when it is unfinished. */
  remove(id: string): Observable<void>;
}
