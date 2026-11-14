import type { Part } from '@lab/motion-parts';

/** What the dashboard knows about songs, the catalog and pieces. The adapters turn the server's answers into these. */

export const STYLES = ['typographic', 'illustrated'] as const;
export const LEVELS = ['simple', 'medium', 'advanced'] as const;
export const FRAME_RATES = [24, 30, 60] as const;
export const MODES = ['dark', 'light'] as const;
export const VERSE_STYLES = ['plain', 'highlight', 'karaoke', 'glow'] as const;
export const HIT_STYLES = ['plain', 'metal', 'glow'] as const;
export const DEFAULT_RESOLUTION = '1280x720';

export type Style = (typeof STYLES)[number];
export type Level = (typeof LEVELS)[number];
export type Mode = (typeof MODES)[number];
export type VerseStyle = (typeof VERSE_STYLES)[number];
export type HitStyle = (typeof HIT_STYLES)[number];
export type PieceState = 'draft' | 'queued' | 'running' | 'done' | 'failed';

/** A song of the library: one version of one track of a music project. */
export interface Song {
  /** `project/track/seed`, the identity the library gives it. */
  readonly key: string;
  readonly project: string;
  readonly trackId: string;
  readonly variant: number;
  readonly title: string;
  readonly seconds: number;
  readonly instrumental: boolean;
  /** The address of its audio, when it can be played. */
  readonly audio?: string;
  readonly cover?: string;
}

// The part of the catalog and the form of its parameters are shared with the other dashboards (`@lab/motion-parts`); the rest
// of this dashboard imports them from here, where it always did.
export type { ParamType, Part, PartParam } from '@lab/motion-parts';
export { defaultParams, readDefault } from '@lab/motion-parts';

export interface Character {
  readonly name: string;
  readonly description: string;
  readonly poses: readonly string[];
  readonly expressions: readonly string[];
}

export interface Background {
  readonly name: string;
  readonly description: string;
}

/** A font the server's pages carry (`data:`), as `font_files` lists it. */
export interface FontFile {
  readonly family: string;
  readonly weights: readonly number[];
  readonly licence: string;
}

export interface Catalog {
  readonly parts: readonly Part[];
  readonly characters: readonly Character[];
  readonly backgrounds: readonly Background[];
  readonly levels: readonly Level[];
  readonly styles: readonly Style[];
  readonly frameRates: readonly number[];
  readonly actions: readonly string[];
  readonly fonts: readonly string[];
  /** The CSS stack of each font name, as the server's page sets it. A server that does not say leaves the editor to guess. */
  readonly fontStacks?: Readonly<Record<string, string>>;
  /** Which fonts the server embeds in its pages, with their weights and licence. A font that is not here is a system stack. */
  readonly fontFiles?: Readonly<Record<string, FontFile>>;
  readonly modes: readonly Mode[];
  /** What the server's scripts support beyond the base format (`animate`: keyframes). Empty for a server that says nothing. */
  readonly features: readonly string[];
}

/** What is chosen when a piece is made. */
export interface Choices {
  readonly style: Style;
  readonly level: Level;
  readonly fps: number;
  readonly resolution: string;
  /** Ask the server to hear when each word is sung, instead of spreading the lyrics over the sections. */
  readonly hearWords?: boolean;
  /** The style (preset) the piece starts from. Absent when the piece starts from the fixed rule alone. */
  readonly presetId?: string;
  /** The person's direction for the animation, kept with the piece and read by the assistant (up to `MAX_PROMPT` characters). */
  readonly prompt?: string;
}

/** The most the server keeps of a piece's prompt. */
export const MAX_PROMPT = 2000;

/** The feature a server lists when it can write an SVG from a description (`POST /api/assist/svg`). */
export const FEATURE_SVG = 'svg';
/** The longest description the server takes for a drawing. */
export const MAX_SVG_TEXT = 2000;

/** The feature a server lists when it can plan a whole animation from one sentence (`POST /api/assist/plan`). */
export const FEATURE_PLAN = 'plan';
/** The longest sentence the server takes for a plan. */
export const MAX_PLAN_TEXT = 2000;

/** What is asked for a plan: the sentence and, optionally, the song's generator, the language, and the provider and model that write it (for this call only). */
export interface PlanInput {
  readonly text: string;
  readonly generator?: string;
  /** ISO 639-1 code of the sentence, when known. */
  readonly language?: string;
  readonly provider?: string;
  readonly model?: string;
}

/** A part the plan suggests: whether the catalog has it and, when it does not, the sentence that asks for its draft. */
export interface AssistedPart {
  readonly name: string;
  readonly exists: boolean;
  readonly request?: string;
}

/**
 * What the server plans from one sentence. A value it could not fill, or one the catalog does not offer, comes empty (0 for the numbers) with an entry in `warnings`; nothing is created.
 */
export interface AssistedPlan {
  readonly song: { readonly title: string; readonly caption: string; readonly lyrics: string; readonly tags: string; readonly instrumental: boolean; readonly seconds: number };
  readonly animation: { readonly style: string; readonly level: string; readonly fps: number; readonly mode: string; readonly concept: string; readonly prompt: string };
  readonly parts: readonly AssistedPart[];
  readonly warnings: readonly string[];
}

/** What is asked for a drawing: the description and, optionally, the installed model that writes it (without one the server's usual routing). */
export interface SvgInput {
  readonly text: string;
  readonly model?: string;
  /** The id of a saved provider that writes it instead of the routing, for this call only; `model` then names one of its models. */
  readonly provider?: string;
}

export interface Design {
  readonly dark: string;
  readonly light: string;
  readonly accent: string;
  readonly display: string;
  readonly body: string;
  readonly defaultMode: Mode;
  /** The mode of each section tag, in lowercase. */
  readonly modes: Readonly<Record<string, Mode>>;
  readonly concept: string;
  /** How a verse is marked while it is sung. Absent means plain. A value this dashboard does not know is kept as the server wrote it. */
  readonly verseStyle?: VerseStyle | (string & {});
  /** How a word hit looks. Absent means plain. A value this dashboard does not know is kept as the server wrote it. */
  readonly hitStyle?: HitStyle | (string & {});
  /** What the piece shares across its pages: a stylesheet, small drawings and four corner labels. Needs the `theme` feature. */
  readonly theme?: Theme;
  /** The crossfade between the pieces, in seconds (0 to 2; absent is a cut). Needs the `theme` feature. */
  readonly transitionSeconds?: number;
}

/** The server's limits on a theme. */
export const THEME_CSS_MAX = 20480;
export const THEME_ASSETS_MAX = 5;
export const THEME_ASSET_BYTES = 51200;
export const THEME_HUD_MAX = 40;
export const TRANSITION_MAX = 2;
export const THEME_ASSET_NAME = /^[a-z][a-z0-9_]{0,31}$/;

export interface ThemeHud {
  readonly tl?: string;
  readonly tr?: string;
  readonly bl?: string;
  readonly br?: string;
}

export interface Theme {
  /** A stylesheet injected after the page's own. */
  readonly css?: string;
  /** SVG drawings by name; a part places one with `{{asset:name}}`. */
  readonly assets?: Readonly<Record<string, string>>;
  readonly hud?: ThemeHud;
}

/** The features a server lists for scenes, the theme and reviews. */
export const FEATURE_SCENE = 'scene';
export const FEATURE_THEME = 'theme';
export const FEATURE_REVIEW = 'review';

export type Origin = 'assistant' | 'fallback' | 'user';

export interface StoredDesign {
  readonly design: Design;
  readonly source: Origin;
  /** Set by the user: a new proposal does not overwrite it unless asked. */
  readonly edited: boolean;
}

export interface ScriptLine {
  readonly line?: number;
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
  readonly keyword?: string;
}

export interface WordHit {
  readonly word: string;
  readonly at: number;
  readonly length: number;
}

export interface StageCharacter {
  readonly character: string;
  readonly pose?: string;
  readonly expression?: string;
  readonly action?: string;
  /** Percent of the width, where the anchor goes. */
  readonly x: number;
  /** Percent of the height, from the top. */
  readonly y: number;
  /** The character's height as a percent of the frame's. */
  readonly size: number;
}

export interface Stage {
  readonly background?: string;
  readonly characters?: readonly StageCharacter[];
}

/** How a value travels from a keyframe to the next one. */
export const EASES = ['linear', 'in', 'out', 'in-out', 'step'] as const;
export type Ease = (typeof EASES)[number];

/** A value of a parameter at a second of its piece (0 is the piece's start). */
export interface Keyframe {
  readonly t: number;
  readonly value: string | number | boolean;
  /** How the value travels from this keyframe to the next; absent means linear, and the last keyframe's is not used. */
  readonly ease?: Ease;
}

/** The keyframes of the parameters that change over a piece, by parameter name. */
export type Animate = Readonly<Record<string, readonly Keyframe[]>>;

/** The feature a server lists when its scripts take `animate`. */
export const FEATURE_ANIMATE = 'animate';

/** An extra part drawn beside the main one of a script piece. The script keeps the server's own names. */
export interface PartRef {
  readonly part: string;
  readonly params?: Readonly<Record<string, unknown>>;
  /** The parameters of this extra that change over the piece. */
  readonly animate?: Animate;
}

/** What a script piece replaces of the song's design for itself alone: every field is optional (the server's names). */
export interface PieceDesign {
  readonly dark?: string;
  readonly light?: string;
  readonly accent?: string;
  readonly display?: string;
  readonly body?: string;
  readonly verse_style?: VerseStyle | (string & {});
  readonly hit_style?: HitStyle | (string & {});
}

export const MAX_EXTRA_PARTS = 3;

export interface ScriptPiece {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly section?: string;
  readonly part: string;
  readonly params?: Readonly<Record<string, unknown>>;
  /** The parameters of the main part that change over the piece. */
  readonly animate?: Animate;
  readonly mode?: Mode;
  readonly lines?: readonly ScriptLine[];
  readonly hit?: WordHit;
  readonly stage?: Stage;
  /** Up to three extra parts drawn beside the main one, in this order, none repeated. */
  readonly with?: readonly PartRef[];
  /** Replaces the song's design for this piece alone. */
  readonly design?: PieceDesign;
  /** The crossfade into this piece from the one before (0 is a cut); without it, the design's. Written as the server writes it: the script is kept as it comes. */
  readonly transition_seconds?: number;
}

/** The feature a server lists when its scripts take `layers`. */
export const FEATURE_LAYERS = 'layers';

/** The server's limits on layers: lanes in a script, items in a lane, and parts one page draws (main, extras and the items that touch the piece). */
export const MAX_LAYERS = 4;
export const MAX_LAYER_ITEMS = 32;
export const MAX_PAGE_PARTS = 8;

/** A part drawn from `start` to `end`, in song seconds, in the page of every piece it touches. Its keyframes are in seconds from `start`. */
export interface LayerItem {
  readonly part: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly start: number;
  readonly end: number;
  readonly animate?: Animate;
}

/** A lane of items that follow one another and never overlap. Lanes are drawn in order, the last on top of the pieces' parts. */
export interface Layer {
  /** Lower case letters, digits and dashes, up to 24 characters; unique in the script. */
  readonly id: string;
  readonly items: readonly LayerItem[];
}

export interface Script {
  readonly version: 1;
  readonly pieces: readonly ScriptPiece[];
  /** Lanes of parts drawn over the sequence of pieces; absent for a script without any. */
  readonly layers?: readonly Layer[];
}

export interface SongMapSection {
  readonly tag: string;
  readonly start: number;
  readonly end: number;
}

export interface SongMapWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
}

export interface SongMap {
  readonly duration: number;
  readonly bpm: number;
  readonly beats: readonly number[];
  /** The number of the first beat in `beats`: a slice of a song starts counting where the song was, not at 0. */
  readonly beatBase: number;
  /** The grid was found where the beat falls; when not, it starts at 0. */
  readonly gridAnchored: boolean;
  readonly sections: readonly SongMapSection[];
  readonly words: readonly SongMapWord[];
  /** The word times were spread over the sections, not heard. */
  readonly wordsEstimated: boolean;
  readonly loudnessHop: number;
  readonly loudness: readonly number[];
}

/** The pages the server builds for a piece, each ready for a sandboxed frame, exactly as the render would draw them. */
export interface PiecePreview {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly scenes: readonly { readonly id: string; readonly start: number; readonly end: number; readonly html: string }[];
  /** The pieces whose part was swapped for the level. */
  readonly replacements: readonly { readonly piece: string; readonly from: string; readonly to: string }[];
}

/** The two files of a part of the user's, as the server keeps them: what the preview needs to draw it. */
export interface PartText {
  readonly name: string;
  /** The content of `manifest.json`, as text. */
  readonly manifest: string;
  /** The content of `part.html`. */
  readonly fragment: string;
}

/** A forecast of the drawing time. It is always a forecast. */
export interface Estimate {
  readonly seconds: number;
  readonly frames: number;
}

/** A piece as the list shows it. */
export interface Piece {
  readonly id: string;
  readonly title: string;
  readonly state: PieceState;
  readonly progress: number;
  readonly source: { readonly project: string; readonly trackId: string; readonly variant: number };
  readonly style: Style;
  readonly level: Level;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly createdAt: number;
  readonly estimate: Estimate;
  readonly sizeBytes: number;
  /** The address of the video, when it is done. */
  readonly video?: string;
  readonly error?: string;
}

/** A piece with everything: its design, script and song map. */
export interface PieceDetail extends Piece {
  readonly design: StoredDesign;
  readonly script: Script;
  readonly scriptSource: Origin;
  readonly songMap: SongMap;
  /** Why the words were not heard when they were asked for. Only in the answer that causes it. */
  readonly notice?: string;
  /** An edited script was kept and may need adjusting to the new sections. Only in the answer that causes it. */
  readonly scriptWarning?: string;
  /** The style the piece started from, when it was made with one. */
  readonly preset?: string;
  /** The direction kept with the piece, which the proposals that send none read. */
  readonly prompt?: string;
  /** The last proposal written in the background, while it runs or after it ran. */
  readonly proposal?: ProposalState;
  /** The last batch of scenes written for the script. */
  readonly scenes?: SceneBatch;
  /** The last review of the whole piece. */
  readonly review?: PieceReview;
}

export type SceneBatchState = 'writing' | 'done' | 'cancelled' | 'failed';
export type SceneDraftState = 'pending' | 'writing' | 'ready' | 'failed' | 'approved';

export interface SceneBatchDraft {
  readonly scriptPiece: string;
  /** Empty while pending. */
  readonly draftId?: string;
  readonly state: SceneDraftState;
  readonly error?: string;
}

export interface SceneBatch {
  readonly state: SceneBatchState;
  readonly done: number;
  readonly total: number;
  readonly drafts: readonly SceneBatchDraft[];
  readonly model?: string;
  readonly provider?: string;
  readonly briefMode: BriefMode;
  readonly review?: ReviewAsk;
  readonly error?: string;
}

export type BriefMode = 'metaphor' | 'literal';
export const BRIEF_MODES: readonly BriefMode[] = ['metaphor', 'literal'];

export type Verdict = 'pass' | 'weak' | 'fail';

/** What a draft or a batch asks the review to do: a draft under `min` is rewritten with the notes, up to `attempts` times (at most 3). */
export interface ReviewAsk {
  readonly min?: number;
  readonly attempts?: number;
}

export const REVIEW_ATTEMPTS_MAX = 3;
export const SCENE_BRIEF_MAX = 500;

export interface SceneInput {
  /** Script piece ids; empty writes every piece. */
  readonly scriptPieces?: readonly string[];
  readonly briefMode?: BriefMode;
  readonly model?: string;
  readonly provider?: string;
  /** `true` asks for a review, `false` for none, an object for a review with a minimum. */
  readonly review?: boolean | ReviewAsk;
}

export interface ApprovedScene {
  readonly scriptPiece: string;
  readonly part: string;
  readonly draftId: string;
}

export interface NotApprovedScene {
  readonly scriptPiece: string;
  readonly draftId: string;
  readonly state: string;
  readonly error?: string;
}

/** What approving a batch did: the scenes that became the parts of their script pieces, the ones that did not, and the script the server saved. */
export interface SceneApproval {
  readonly approved: readonly ApprovedScene[];
  readonly notApproved: readonly NotApprovedScene[];
  readonly script: Script;
}

export interface ReviewScene {
  readonly scriptPiece: string;
  readonly score: number;
  readonly verdict?: Verdict;
  readonly notes: readonly string[];
  readonly error?: string;
}

export interface ReviewOverall {
  readonly score?: number;
  readonly notes: readonly string[];
  /** Groups of script pieces that use the same metaphor. */
  readonly repeated: readonly (readonly string[])[];
  readonly error?: string;
}

export type ReviewState = 'running' | 'done' | 'failed';

/** The grade of a whole piece, scene by scene and as a whole. */
export interface PieceReview {
  readonly state: ReviewState;
  readonly model?: string;
  readonly scenes: readonly ReviewScene[];
  readonly overall?: ReviewOverall;
  readonly error?: string;
}

/** The grade of a draft: a score out of ten, a verdict and what to fix; `attempts` is the climb when it was rewritten from its review. */
export interface DraftReview {
  readonly score?: number;
  readonly verdict?: Verdict;
  readonly notes: readonly string[];
  readonly model?: string;
  readonly attempts: readonly { readonly score?: number; readonly verdict?: string; readonly notes: readonly string[] }[];
  /** Why there is no grade; the draft is still `ready`. */
  readonly error?: string;
}

/** The verdict of a score, as the server draws the line: from 7 pass, 5 and 6 weak, under 5 fail. */
export const verdictOf = (score: number): Verdict => (score >= 7 ? 'pass' : score >= 5 ? 'weak' : 'fail');

export type ProposalWhat = 'design' | 'script' | 'all';

export interface Replacement {
  readonly piece: string;
  readonly from: string;
  readonly to: string;
}

/** What is asked of the assistant: the part, the direction (it replaces the one kept with the piece) and the model (the routing's when absent). */
export interface ProposeInput {
  readonly what: ProposalWhat;
  readonly prompt?: string;
  readonly model?: string;
  /** The id of a saved provider (`GET /api/providers`) that writes this proposal instead of the routing, for this call only; `model` then names one of its models. */
  readonly provider?: string;
}

export interface Proposal {
  readonly what: ProposalWhat;
  /** `fallback` means the fixed rule answered: not an error. */
  readonly source: 'assistant' | 'fallback';
  /** Why the fixed rule wrote it; only when `source` is `fallback`. */
  readonly fallbackReason?: string;
  /** The model that wrote it, or the one asked for when it failed. */
  readonly model?: string;
  /** The provider that wrote it when the call named one; absent when the routing's own did. */
  readonly provider?: string;
  readonly replacements: readonly Replacement[];
  /** The piece as it is after the proposal replaced what was there. */
  readonly piece: PieceDetail;
}

/** Who wrote a part of a background proposal, and why the assistant did not when the fixed rule did. */
export interface ProposalSource {
  readonly source: 'assistant' | 'fallback';
  readonly reason?: string;
}

export type ProposalPhase = 'waiting' | 'writing' | 'done' | 'failed';

/** A proposal written in the background (`what: all`, or asked to be): followed on the piece until it is done or failed. */
export interface ProposalState {
  readonly state: ProposalPhase;
  readonly what: ProposalWhat;
  readonly model?: string;
  /** Milliseconds since the epoch. */
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly design?: ProposalSource;
  readonly script?: ProposalSource;
  readonly error?: string;
}

/** A model of the assistant that is installed, with whether it passes the server's memory rule right now. */
export interface AssistModel {
  readonly name: string;
  readonly sizeBytes: number;
  readonly fits: boolean;
}

export interface AssistModels {
  /** The model used when a request names none. */
  readonly default: string;
  readonly models: readonly AssistModel[];
}

/** Whether a proposal is being written, so what the server would refuse (`409`) is off. */
export const isProposing = (p: Pick<PieceDetail, 'proposal'>): boolean => p.proposal?.state === 'waiting' || p.proposal?.state === 'writing';

export const isFinished = (p: Pick<Piece, 'state'>): boolean => p.state === 'done' || p.state === 'failed';
export const isBusy = (p: Pick<Piece, 'state'>): boolean => p.state === 'queued' || p.state === 'running';

export type ReferenceState = 'analysing' | 'ready' | 'failed';

/** A colour of a video and the part of its pixels it covers (0 to 1). */
export interface Colour {
  readonly hex: string;
  readonly share: number;
}

/** What the server read of a reference video. The video itself is not kept: only its key frames and this. */
export interface Analysis {
  readonly duration: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  /** The addresses of the key frames, in order, ready to be opened (with the server's ticket). */
  readonly frames: readonly string[];
  readonly colours: readonly Colour[];
  /** The dominant colours of each third of the video. */
  readonly thirds: readonly (readonly Colour[])[];
  readonly cuts: number;
  /** The mean length of a shot, in seconds. */
  readonly meanShot: number;
  readonly tempo?: number;
  readonly key?: string;
  readonly description?: string;
  /** Why there is no description. */
  readonly descriptionNote?: string;
}

/** A video given as an example of a good piece. */
export interface Reference {
  readonly id: string;
  readonly title: string;
  readonly notes: string;
  readonly tags: readonly string[];
  /** The YouTube address; missing for an uploaded video. */
  readonly source?: string;
  readonly state: ReferenceState;
  /** Why the analysis failed. */
  readonly error?: string;
  readonly createdAt: number;
  readonly analysis?: Analysis;
}

/** What is given to add a reference: an address or a video file, and optionally a title, notes and tags. */
export interface ReferenceInput {
  readonly url?: string;
  readonly file?: File;
  readonly title?: string;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

/** What is changed of a reference: a field that is missing stays as it was. */
export interface ReferencePatch {
  readonly title?: string;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export const MIN_RHYTHM = 2;
export const MAX_RHYTHM = 15;

/** A design, a rhythm and a set of parts taken from a reference, to start a piece from. */
export interface Preset {
  readonly id: string;
  readonly name: string;
  /** The reference it came from; it may no longer exist. */
  readonly referenceId?: string;
  readonly createdAt: number;
  readonly design: Design;
  /** How long a piece of the script lasts, in seconds. */
  readonly rhythm: number;
  /** The parts of the catalog it suits; empty means all the usual ones. */
  readonly parts: readonly string[];
  /** What had to change of the video's colours for the design to be valid. */
  readonly adjustments: readonly string[];
}

/** How far from what exists a proposal has to be to count as new. */
export type Strictness = 'low' | 'normal' | 'high';
export const STRICTNESSES: readonly Strictness[] = ['low', 'normal', 'high'];

/** The closest style, part or draft to a proposal, with how far it is (from 0, the same, to 1, nothing in common). */
export interface LearnSimilar {
  readonly kind: 'style' | 'part' | 'draft';
  readonly id?: string;
  readonly name: string;
  readonly distance: number;
  readonly reason: string;
}

/** A style or a part draft a learning kept. `state` is what it is now: `ready` for a style, the draft's state for a part, `gone` when it no longer exists. */
export interface LearnedItem {
  readonly id: string;
  readonly name: string;
  readonly novel: boolean;
  readonly similarTo?: LearnSimilar;
  readonly state: string;
  readonly reason?: string;
}

/** A proposal the learning did not make because it is too similar to what exists. */
export interface LearnDiscarded {
  readonly kind: 'style' | 'part';
  readonly name: string;
  /** The sentence of a part idea. */
  readonly idea?: string;
  readonly similarTo: LearnSimilar;
  readonly reason: string;
}

/** What a learning could not do, and why (what is missing). */
export interface LearnSkipped {
  /** `style`, `parts` or `part <name>`. */
  readonly what: string;
  readonly reason: string;
}

export type LearningState = 'running' | 'ready' | 'failed';

/** What the server learned from a reference: nothing in it enters the catalog by itself. */
export interface Learning {
  readonly id: string;
  readonly referenceId: string;
  readonly state: LearningState;
  /** Why it failed. */
  readonly reason?: string;
  readonly strictness: Strictness;
  readonly createdAt: number;
  readonly finishedAt?: number;
  readonly styles: readonly LearnedItem[];
  readonly partDrafts: readonly LearnedItem[];
  readonly discarded: readonly LearnDiscarded[];
  readonly skipped: readonly LearnSkipped[];
}

/** Whether a learning is still being made. */
export const isLearning = (l: Pick<Learning, 'state'>): boolean => l.state === 'running';

/** What is saved of a preset. */
export interface PresetInput {
  readonly name: string;
  readonly design: Design;
  readonly rhythm: number;
  readonly parts: readonly string[];
}

export const isAnalysing = (r: Pick<Reference, 'state'>): boolean => r.state === 'analysing';


export type DraftState = 'writing' | 'ready' | 'failed';

/** The most characters of the phrase a part is asked for with, and the biggest picture the server takes. */
export const MAX_REQUEST = 500;
export const MAX_PICTURE_BYTES = 20 * 1024 * 1024;
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** A part the assistant is writing or has written, which is not in the catalog until it is approved. */
export interface Draft {
  readonly id: string;
  readonly state: DraftState;
  /** What the part has to do, in the person's words. */
  readonly request: string;
  /** Whether it was asked for with a picture. */
  readonly withPicture: boolean;
  /** Where the picture came from: `upload`, or `reference:<id>/<frame>`. */
  readonly source?: string;
  /** What the vision model saw in the picture. */
  readonly description?: string;
  readonly attempts: number;
  /** The part's name, once it is ready. */
  readonly name?: string;
  /** What failed in the last attempt. */
  readonly problems: readonly string[];
  /** Why it failed. */
  readonly error?: string;
  readonly createdAt: number;
  /** The addresses of the preview frames, ready to be opened (with the server's ticket). */
  readonly preview: readonly string[];
  /** The part whose text the assistant was asked to change: the draft may keep that name although the catalog has it. */
  readonly replaces?: string;
  /** The model the person chose to write it; absent when the server's own did. A retry keeps it. */
  readonly model?: string;
  /** The provider the person chose to write it; absent when the routing's own did. A retry keeps it. */
  readonly provider?: string;
  /** The text of `manifest.json` and of `part.html`; only when one draft is read. */
  readonly manifest?: string;
  readonly fragment?: string;
  /** Set on a draft asked for with `scene`: the piece and the script piece it is written for. */
  readonly scene?: { readonly piece: string; readonly scriptPiece: string };
  /** The idea a scene was asked for with. */
  readonly brief?: string;
  /** What the request asked of the review; a retry keeps it. */
  readonly reviewAsk?: ReviewAsk;
  readonly review?: DraftReview;
  /** What the checks let pass but the person should know (an `{{asset:}}` slot the theme has no drawing for). */
  readonly warnings?: readonly string[];
}

/** What a part is asked for with: a phrase and, if wished, one picture: a key frame of a reference, or a file. */
export interface DraftInput {
  readonly request: string;
  readonly referenceId?: string;
  readonly frame?: string;
  readonly file?: File;
  /** The text to change: the request is then an instruction, and the assistant starts from this text instead of from nothing. Not with a picture. */
  readonly base?: DraftText;
  /** The installed model that writes the part (see `assistModels`); without one the server's own. One that is not installed is refused. */
  readonly model?: string;
  /** The id of a saved provider that writes the part instead of the routing, for this draft only; `model` then names one of its models. The draft keeps it and a retry uses the same one. */
  readonly provider?: string;
  /** Asks for a scene for one script piece of one piece (no picture, no reference, no base text); `request` may then be empty. */
  readonly scene?: { readonly piece: string; readonly scriptPiece: string; readonly brief?: string };
  /** Asks for the draft to be reviewed, and rewritten from the notes when it scores under `min`. */
  readonly review?: boolean | ReviewAsk;
}

/** The two texts of a draft. */
export interface DraftText {
  readonly manifest: string;
  readonly fragment: string;
}

export const isWriting = (d: Pick<Draft, 'state'>): boolean => d.state === 'writing';

/** A failed draft whose picture the server did not keep (the age check): it cannot be tried again. The server says so in the error. */
export const pictureLost = (d: Pick<Draft, 'state' | 'withPicture' | 'error'>): boolean => d.state === 'failed' && d.withPicture && /\b(picture|image|imagen|minor|menor|age|edad)\b/i.test(d.error ?? '');
