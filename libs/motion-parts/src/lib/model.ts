/** What a dashboard knows of a catalog part: the server's description of it, as the form of its parameters needs it. */

/** The levels of detail a part can be drawn at. */
export type PartLevel = 'simple' | 'medium' | 'advanced';

export type ParamType = 'string' | 'int' | 'number' | 'bool' | 'enum';

export interface PartParam {
  readonly name: string;
  readonly type: ParamType;
  /** The default as the server writes it: a text that `type` says how to read. */
  readonly default: string;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly maxLength?: number;
  readonly options?: readonly string[];
  /** A script may change this parameter over a piece with keyframes (the part reads it on every frame). Absent means it cannot. */
  readonly animatable?: boolean;
}

export interface Part {
  readonly name: string;
  readonly description: string;
  readonly levels: readonly PartLevel[];
  readonly costMs: number;
  /** Only used when something names it: the fixed rule does not choose it. */
  readonly manual: boolean;
  /** Where it comes from: the ones that come with the server, or the ones the person approved. Absent when the server did not say. */
  readonly source?: 'builtin' | 'user';
  /** Who draws the lyric when this is a piece's main part: the page (absent) or the part itself (`own`). */
  readonly verse?: 'page' | 'own';
  /** The same for the word hit. An extra part cannot own either. */
  readonly hit?: 'page' | 'own';
  /** Set on a scene written for one script piece of one piece. Such parts are kept out of the catalog unless asked for. */
  readonly scene?: { readonly piece: string; readonly scriptPiece: string };
  readonly params: readonly PartParam[];
}

/** The default of a parameter read by its type; `undefined` when the text does not read as that type. */
export function readDefault(param: PartParam): string | number | boolean | undefined {
  switch (param.type) {
    case 'int': {
      const n = Number(param.default);
      return param.default.trim() !== '' && Number.isInteger(n) ? n : undefined;
    }
    case 'number': {
      const n = Number(param.default);
      return param.default.trim() !== '' && Number.isFinite(n) ? n : undefined;
    }
    case 'bool':
      return param.default === 'true' ? true : param.default === 'false' ? false : undefined;
    default:
      return param.default;
  }
}

/** The values a part starts with: each parameter's default, the ones that do not read left out. */
export function defaultParams(part: Part): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of part.params) {
    const v = readDefault(p);
    if (v !== undefined) out[p.name] = v;
  }
  return out;
}
