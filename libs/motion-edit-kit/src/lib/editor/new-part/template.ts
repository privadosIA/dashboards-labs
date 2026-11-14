import type { DraftText } from '@lab/animation-core';

/** A small working part to start a hand-written one from: a row of bars that jump on every beat and fall back before the next. */
export const PART_TEMPLATE: DraftText = {
  manifest: JSON.stringify(
    {
      name: 'my-new-part',
      description: 'A row of bars that jump on every beat and fall back between beats, with an optional label under them',
      version: 1,
      levels: ['simple', 'medium', 'advanced'],
      cost_ms: 40,
      params: [
        { name: 'bars', type: 'int', description: 'How many bars', default: 7, min: 3, max: 15 },
        { name: 'gain', type: 'number', description: 'How high the bars jump (1 is the usual)', default: 1, min: 0.2, max: 2 },
        { name: 'label', type: 'string', description: 'Text under the bars', default: '', max_length: 24 },
      ],
    },
    null,
    2,
  ),
  fragment: `<style>
#bb{position:absolute;left:0;right:0;top:20vh;height:50vh;display:flex;align-items:flex-end;justify-content:center;gap:2.2vh}
.bb-bar{width:6vh;height:40vh;border-radius:1.2vh;background:var(--accent);transform-origin:50% 100%;transform:scaleY(.15);opacity:.9}
#bb-lab{position:absolute;left:0;right:0;top:74vh;text-align:center;font-family:var(--display);font-weight:900;font-size:6.5vh;text-transform:lowercase;color:var(--fg)}
</style>
<div id="bb"></div>
<div id="bb-lab"></div>
<script>
(function(){
  var P = window.__params, root = document.getElementById('bb'), bars = [];
  document.getElementById('bb-lab').textContent = P.label || '';
  for (var i = 0; i < P.bars; i++) { var d = document.createElement('div'); d.className = 'bb-bar'; root.appendChild(d); bars.push(d); }
  window.__partSeek = function(t, b){
    var g = P.gain, pulse = b.number >= 0 ? Math.pow(1 - Math.min(1, Math.max(0, b.position)), 2) : 0;
    bars.forEach(function(d, i){
      var wave = 0.5 + 0.5 * Math.sin(i * 1.3 + b.number * 0.9);
      var h = 0.15 + g * pulse * (0.35 + 0.5 * wave);
      d.style.transform = 'scaleY(' + Math.min(1, h) + ')';
    });
  };
})();
</script>
`,
};
