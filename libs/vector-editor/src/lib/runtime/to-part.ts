import type { Param, VectorDocument } from '../model/document';
import { toJson } from '../model/json';
import { renderSvg } from './render-svg';
import { RUNTIME_SOURCE } from './runtime';

export interface PartOptions {
  name: string;
  description: string;
  levels?: Array<'simple' | 'medium' | 'advanced'>;
  cost_ms?: number;
}

/** The two files of a part, as the port takes them (`manifest` is JSON text). */
export interface PartFiles {
  manifest: string;
  fragment: string;
}

export type ToPartResult = (PartFiles & { bytes: number; bodyBytes: number }) | { problems: string[] };

/**
 * What the server takes in the JSON body of a part sent as text: 8 MiB for the manifest and the fragment together (`maxDraftJSON` in its draft handler,
 * `x-max-body-bytes: 8388608` in the contract; it was 64 KiB until 2026-11-11, which is what asked for the change). A picture counts twice (in the
 * drawing and in the model) and base64 makes it a third bigger.
 */
export const SERVER_BODY_LIMIT = 8 * 1024 * 1024;

/** The size of the request that sends these files, as the server counts it. */
export const bodyBytes = (files: PartFiles): number => new TextEncoder().encode(JSON.stringify({ manifest: files.manifest, fragment: files.fragment })).length;

export const DOES_NOT_MOVE = 'the part does not move';

/**
 * Whether anything in the document changes over time: a track whose keyframes are not all the same value, or a beat link that does something
 * (a pulse or a loudness link with an amount, an alternate between two different values). A part that only pulses on the beat moves inside a piece.
 */
export function moves(doc: VectorDocument): boolean {
  const some = (nodes: VectorDocument['nodes']): boolean =>
    nodes.some(
      (n) =>
        Object.values(n.tracks).some((frames) => !!frames && new Set(frames.map((f) => f.value)).size > 1) ||
        Object.values(n.beat ?? {}).some((l) => !!l && (l.kind === 'alternate' ? l.values[0] !== l.values[1] : l.amount !== 0)) ||
        some(n.children),
    );
  return some(doc.nodes);
}

function manifestParam(p: Param): Record<string, unknown> {
  const colour = p.target.what === 'fill' || p.target.what === 'stroke';
  const description = colour && !/colou?r/i.test(p.description) ? `${p.description} (a colour: #rgb or #rrggbb)` : p.description;
  if (p.type === 'number') return { name: p.name, type: 'number', description, default: Number(p.default), min: p.min ?? 0, max: p.max ?? 100 };
  return { name: p.name, type: 'string', description, default: p.default, max_length: p.max_length ?? (colour ? 9 : 40) };
}

const GLUE = `(function () {
  var model = JSON.parse(document.querySelector('script[data-vector-model]').textContent);
  var runtime = window.VectorRuntime.create(model, document.querySelector('[data-vector-root]'), window.__params || {});
  window.__partSeek = function (t, beat) { runtime.seek(t, beat); };
  runtime.seek(0);
})();`;

/** Inside a `<script>` the model must not be able to close the tag: `<` is written as its escape, which JSON reads back. */
export const embedJson = (doc: VectorDocument): string => toJson(doc).replace(/</g, '\\u003c');

/**
 * The part of the user's a document makes: a manifest with the document's parameters and a fragment with the drawing at 0 s, the model it
 * can be opened again from, the runtime and the glue that sets `window.__partSeek`. A document where nothing moves is refused here, as the
 * server would refuse it.
 */
export function toPart(doc: VectorDocument, options: PartOptions): ToPartResult {
  if (!moves(doc) && doc.params.length === 0) return { problems: [DOES_NOT_MOVE] };
  const manifest = JSON.stringify(
    {
      name: options.name,
      description: options.description,
      version: 1,
      levels: options.levels ?? ['simple', 'medium', 'advanced'],
      cost_ms: options.cost_ms ?? 40,
      params: doc.params.map(manifestParam),
    },
    null,
    2,
  );
  const frame = doc.background ? ` background: ${doc.background};` : '';
  const fragment = [
    '<style>',
    `.vector-part { position: absolute; inset: 0; overflow: hidden;${frame} }`,
    '.vector-part > svg { display: block; width: 100vw; height: 100vh; }',
    '</style>',
    `<div class="vector-part">${renderSvg(doc, 0, { html: true })}</div>`,
    `<script type="application/json" data-vector-model>${embedJson(doc)}</script>`,
    `<script>${RUNTIME_SOURCE}</script>`,
    `<script>${GLUE}</script>`,
    '',
  ].join('\n');
  return { manifest, fragment, bytes: new TextEncoder().encode(fragment).length, bodyBytes: bodyBytes({ manifest, fragment }) };
}
