import type { Observable } from 'rxjs';

/** An installed model the assistant can write with. */
export interface SinkModel {
  name: string;
  sizeBytes: number;
  /** Whether the model passes the server's memory rule right now. */
  fits: boolean;
}

/** The models the assistant has and the one it uses when none is named. */
export interface SinkModels {
  default: string;
  models: readonly SinkModel[];
}

/**
 * What the describe dialog asks of the assistant. The library knows nothing of the port behind it: a host maps these onto its own. An Observable that
 * fails does so with an `Error` whose message is the reason, in the server's words; unsubscribing cancels the request.
 */
export interface VectorSvgSink {
  /** The installed models of the routing. It fails when there is no assistant: the picker then has no list and the model is typed, or left to the server. */
  models(): Observable<SinkModels>;
  /** Writes an SVG from a description with the provider (empty: the server's routing) and the model (empty: its own); the document as text, not yet cleaned. It can take minutes. */
  write(text: string, model: string, provider?: string): Observable<string>;
}
