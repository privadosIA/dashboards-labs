import type { VectorDocument } from '../model/document';
import { toJson } from '../model/json';
import { renderSvg } from './render-svg';
import { RUNTIME_SOURCE } from './runtime';

/** Outside the server the wall clock is fine: loop over the document's duration on the browser's animation frames. */
const DRIVER = `(function () {
  var svg = document.documentElement;
  var model = JSON.parse(document.querySelector('script[data-vector-model]').textContent);
  var runtime = window.VectorRuntime.create(model, svg, {});
  var start = null;
  function frame(now) {
    if (start === null) start = now;
    runtime.seek(((now - start) / 1000) % model.duration);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
})();`;

const cdata = (text: string): string => `<![CDATA[${text.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;

/** One SVG file with the drawing, the model and the runtime with a looping driver. It opens in a browser; it is not for the server. */
export function toAnimatedSvg(doc: VectorDocument): string {
  const still = renderSvg(doc, 0, { size: true });
  const scripts =
    `<script type="application/json" data-vector-model="">${cdata(toJson(doc))}</script>` + `<script>${cdata(`${RUNTIME_SOURCE}\n${DRIVER}`)}</script>`;
  return still.replace(/<\/svg>\s*$/, () => `${scripts}</svg>`);
}
