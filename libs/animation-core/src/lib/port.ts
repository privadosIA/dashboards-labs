import type { Observable } from 'rxjs';

import type { Catalog, Choices, Design, Draft, DraftInput, DraftText, Part, PartText, PiecePreview, Estimate, AssistModels, Piece, PieceDetail, Proposal, ProposeInput, Reference, ReferenceInput, ReferencePatch, Script, Song, SvgInput, AssistedPlan, PlanInput, Preset, PresetInput, Learning, Strictness, SceneBatch, SceneInput, SceneApproval, PieceReview } from './model';

/**
 * Everything the dashboard needs from whoever makes the pieces, and nothing about how it is done. An adapter implements
 * this: the server's, and an in-memory one for tests and for working with no server.
 *
 * Every call does its work when subscribed to. A call the server refuses errors with `AnimationFailure` (its `kind` says
 * what to do, its `reason` is the server's own words) and changes nothing.
 */
export interface AnimationPort {
  /** The songs of the library, newest first. This dashboard makes none: it only reads them. */
  songs(): Observable<readonly Song[]>;
  /**
   * The parts, characters, backgrounds and options a piece is made from. Read once. The scenes written for the verses of a piece are not in it unless that piece is
   * named: the editor of one piece asks with its id, so that its scene parts have their parameters and badge; every other screen does not see them.
   */
  catalog(piece?: string): Observable<Catalog>;
  /** The pieces, newest first; emits again whenever one is added, changes or goes away. */
  pieces(): Observable<readonly Piece[]>;
  /** One piece with its design, script and song map. */
  piece(id: string): Observable<PieceDetail>;
  /** Makes a piece from a song. It is complete when it comes back: no wait for a model. */
  create(song: Song, choices: Choices): Observable<PieceDetail>;
  /** Replaces the design; emits what the server saved. */
  saveDesign(id: string, design: Design): Observable<PieceDetail>;
  /** Replaces the script; emits the piece with the script the server saved. */
  saveScript(id: string, script: Script): Observable<PieceDetail>;
  /**
   * Asks the assistant (or the fixed rule) for a new design or script, which replaces what was there. It answers when it is written, with the source,
   * the model and, for the fixed rule, the reason. A `what: 'all'` is written in the background: use `proposeAll`.
   */
  propose(id: string, input: ProposeInput & { readonly what: 'design' | 'script' }): Observable<Proposal>;
  /**
   * Asks for the design and then the script, from the same prompt and model, written in the background: it answers at once with the piece, whose `proposal`
   * is `waiting` or `writing`. Follow it with `followProposal`. A second proposal, or an edit of the piece while one runs, is refused.
   */
  proposeAll(id: string, input: Omit<ProposeInput, 'what'>): Observable<PieceDetail>;
  /** The piece each time its proposal changes, starting with the current one, until it is `done` or `failed`. Unsubscribing stops it. */
  followProposal(id: string): Observable<PieceDetail>;
  /** The models of the assistant that are installed, and the one used when none is named. It errors when the server has no assistant. */
  assistModels(): Observable<AssistModels>;
  /**
   * Writes an SVG from a description with the assistant: the document as text, exactly as the server checked it (not cleaned for the editor). It can take
   * minutes on a CPU, and unsubscribing cancels it. Only a server that lists `svg` in its catalog's `features` has it; a call to one that does not is
   * `unavailable`. `refused` is an empty or over-long text, the model's refusal or an answer that is not a usable SVG (with the server's words), `busy` is a
   * run in progress, `unavailable` is no assistant.
   */
  writeSvg(input: SvgInput): Observable<string>;
  /**
   * Plans a whole animation from one sentence: the song's brief, the animation's choices and the parts worth having, checked against the catalog. It makes nothing on the server and can
   * take minutes on a CPU (two assistant calls). Only a server that lists `plan` in its catalog's `features` has it; a call to one that does not is `unavailable`. `refused` is an
   * empty or over-long sentence, an unknown provider, a consent not given or the model's refusal, `busy` is a run in progress, `unavailable` is no assistant.
   */
  plan(input: PlanInput): Observable<AssistedPlan>;
  /**
   * Hears when each word is sung and rebuilds the song map (and the script, if nobody edited it). It can take a third of the
   * song's length: the call stays open until the server answers with the piece.
   */
  transcribe(id: string): Observable<PieceDetail>;
  /** Starts the drawing; emits the forecast. */
  render(id: string): Observable<Estimate>;
  /** The references, newest first; emits again whenever one is added, changes or goes away, and while one is analysing. */
  references(): Observable<readonly Reference[]>;
  /** One reference with its analysis. */
  reference(id: string): Observable<Reference>;
  /** Adds a reference from an address or a video file; it comes back `analysing`. */
  addReference(input: ReferenceInput): Observable<Reference>;
  editReference(id: string, patch: ReferencePatch): Observable<Reference>;
  /** Removes a reference, stopping its analysis if it is running. */
  removeReference(id: string): Observable<void>;
  /** The part drafts, newest first; emits again whenever one is added, changes or goes away, and while one is being written. */
  drafts(): Observable<readonly Draft[]>;
  /** One draft with its manifest and fragment. */
  draft(id: string): Observable<Draft>;
  /** Asks for a part; the draft comes back `writing`. */
  askDraft(input: DraftInput): Observable<Draft>;
  /** Replaces the manifest and the fragment; a refusal lists the problems and changes nothing. */
  saveDraft(id: string, text: DraftText): Observable<Draft>;
  /**
   * Makes a draft from a manifest and a fragment, with no assistant: it is checked like a saved text, so it comes back `ready` or `failed`
   * with its problems and both texts (to be fixed with `saveDraft`). Refused when a part of the catalog already has the name. From there it is
   * a draft like any other: preview, edit, approve, delete.
   */
  createDraftFromText(text: DraftText): Observable<Draft>;
  /** Another attempt on a failed draft. */
  retryDraft(id: string): Observable<Draft>;
  /** Adds the part of a ready draft to the catalog and deletes the draft; emits the part as the catalog lists it. Every later `catalog()` has it. */
  approveDraft(id: string): Observable<Part>;
  /**
   * The manifest and the fragment of a part, the user's or one that comes with the program (the server reads both). Fails with `missing` for a
   * part that does not exist, for a name that is not a valid one and, in memory, for one that comes with the program: the caller draws a
   * placeholder then.
   */
  partText(name: string): Observable<PartText>;
  /**
   * The pages of a piece as the server builds them, for the saved design and script or for the ones given (which replace them for this call;
   * nothing is saved). Fails with `refused` and the server's reason when one of them is not valid. Only a server adapter has it: where it is
   * missing the editor builds the pages itself.
   */
  previewPages?(id: string, input?: { readonly design?: Design; readonly script?: Script; readonly scenes?: readonly string[] }): Observable<PiecePreview>;
  /**
   * Replaces the manifest and the fragment of an approved part of the user's, checked like an approval; the manifest keeps the part's name. A
   * refusal lists the problems and changes nothing (`refused`); a part that comes with the program is `busy`, one that does not exist is `missing`.
   * Emits the part as the catalog lists it, and every later `catalog()` and `partText()` has the change.
   */
  replacePart(name: string, text: DraftText): Observable<Part>;
  /**
   * Deletes an approved part of the user's. A part that a piece's script (main part, extra or layer item) or a style uses is `busy`, and the
   * reason names them, unless `force`; one that comes with the program is `busy` always. Nothing is changed in what used it.
   */
  removePart(name: string, force?: boolean): Observable<void>;
  /** Removes a draft, stopping its writing. */
  removeDraft(id: string): Observable<void>;
  /** The presets (the styles a piece can start from), newest first. */
  presets(): Observable<readonly Preset[]>;
  preset(id: string): Observable<Preset>;
  /** Makes a preset from a ready reference. */
  makePreset(referenceId: string, name?: string): Observable<Preset>;
  /** Replaces a preset; emits what the server saved. */
  savePreset(id: string, preset: PresetInput): Observable<Preset>;
  removePreset(id: string): Observable<void>;
  /**
   * Asks the server to learn from a ready reference: it proposes one style and up to three part drafts that differ from what exists. The learning comes back
   * `running` (or the one that already was); nothing it makes enters the catalog by itself. A reference that is not ready is `busy`, an unknown strictness `refused`.
   */
  learn(referenceId: string, strictness?: Strictness): Observable<Learning>;
  /** One learning with what it kept, discarded and skipped; the drafts are read as they are now. */
  learning(id: string): Observable<Learning>;
  /** The learnings, newest first; of one reference when it is given. */
  learnings(referenceId?: string): Observable<readonly Learning[]>;
  /**
   * Starts writing a scene for every script piece (or the ones named): one draft each, one after the other, reported in the piece's `scenes`. It answers at once with
   * the batch. Only a server that lists `scene` in its catalog's `features` has it. `busy` is a proposal, a render, another batch or a run holding the memory a local model needs;
   * `refused` is a script piece that is not in the script or a piece with no script; `unavailable` is no assistant.
   */
  writeScenes(id: string, input?: SceneInput): Observable<SceneBatch>;
  /** The batch each time it changes, starting with the current one, until it is `done`, `cancelled` or `failed`. Unsubscribing stops it. */
  followScenes(id: string): Observable<SceneBatch>;
  /** Stops the batch after the draft it is writing; emits the batch (`cancelled` once the draft is finished). */
  cancelScenes(id: string): Observable<SceneBatch>;
  /**
   * Approves every ready scene of the batch: each becomes a part and the part of its script piece, and the server saves the script. Refused (`refused`, naming the script
   * piece) when the script changed since the batch started; `busy` while the batch is still writing. The caller reloads the piece.
   */
  approveScenes(id: string): Observable<SceneApproval>;
  /** Grades the whole piece (each scene and the piece as a whole) in the background; answers at once with the review `running`. Only a server that lists `review` has it. */
  reviewPiece(id: string): Observable<PieceReview>;
  /** The review each time it changes, starting with the current one, until it is `done` or `failed`. Unsubscribing stops it. */
  followReview(id: string): Observable<PieceReview>;
  /** Cancels and removes the piece. */
  remove(id: string): Observable<void>;
  /**
   * Each change of one piece, starting with its current state, until it finishes (the last emission is `done` or
   * `failed`). Unsubscribing stops it; removing the piece ends it without a further emission.
   */
  follow(id: string): Observable<Piece>;
}
