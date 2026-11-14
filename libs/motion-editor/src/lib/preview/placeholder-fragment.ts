import type { ScenePart } from './scene-model';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\{/g, '&#123;');

/**
 * The fragment that stands in for a part whose text could not be read (a part that comes with the server): a centred card with the part's
 * name, its description and its parameter values, over the design's colours, that pulses with the beat so the timing is still visible.
 * It follows the part contract like any other fragment: it reads the beat, draws from `(t, beat)` and keeps no clock of its own.
 */
export function placeholderFragment(part: ScenePart): string {
  const id = `ph-${part.name.replace(/[^a-z0-9]+/gi, '-')}`;
  const rows = Object.entries(part.params)
    .map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(String(v))}</li>`)
    .join('');
  return (
    `<style>#${id}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:30%;max-width:70%;padding:2.4% 3%;` +
    `border:2px dashed var(--accent);border-radius:14px;background:color-mix(in srgb,var(--bg) 82%,var(--fg));color:var(--fg);` +
    `font-family:var(--body);text-align:center}#${id} h3{margin:0 0 .3em;font-family:var(--display);font-size:3.6vh}` +
    `#${id} p{margin:0 0 .5em;opacity:.75;font-size:2.2vh}#${id} ul{list-style:none;margin:0;padding:0;font-size:2vh;opacity:.9}` +
    `#${id} b{color:var(--accent);margin-right:.4em}</style>` +
    `<div id="${id}"><h3>${esc(part.name)}</h3><p>${esc(part.description)}</p><ul>${rows}</ul></div>` +
    `<script>(function(){var el=document.getElementById(${JSON.stringify(id)});window.__partSeek=function(t,beat){` +
    `var p=beat&&beat.position?beat.position:0;var k=1+0.04*Math.sin(Math.PI*p);el.style.transform='translate(-50%,-50%) scale('+k+')';};})();</script>`
  );
}
