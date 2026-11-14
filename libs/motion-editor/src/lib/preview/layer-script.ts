import type { ScenePart } from './scene-model';

/**
 * What a page needs to draw the items of the layers that touch a piece: the server's own text, word for word, so a part behaves the same in the page
 * the browser builds and in the one the server draws. Each item sits in a wrapper the page's seek shows only between the item's `from` and `to` (song
 * seconds) and registers its seek apart (`window.__layers`); the page calls it with the seconds from the item's start. The beat clock a part reads is the piece's own.
 */
export const LAYER_SEEK = `
    var LY = window.__layers || [], abs = ((window.__scene && window.__scene.song_start) || 0) + t;
    for (var li = 0; li < LY.length; li++) {
      var on = abs >= LY[li].from - 1e-9 && abs < LY[li].to;
      LY[li].el.style.display = on ? 'contents' : 'none';
      if (on && LY[li].seek) LY[li].seek(abs - LY[li].from, beat);
    }`;

/** The line of the page's seek the layer calls are added after. */
export const SEEK_LOOP = 'for (var i = 0; i < seeks.length; i++) seeks[i](t, beat);';

/** The script that, after a layer item's fragment, registers its seek apart from the piece's own parts and clears it for the next fragment. */
export function layerRegistration(hand: string, n: number, from: number, to: number): string {
  return `<script>(function(){${hand}window.__layers=window.__layers||[];window.__layers.push({el:document.getElementById('layer-${n}'),from:${from},to:${to},seek:typeof window.__partSeek==='function'?window.__partSeek:null});window.__partSeek=null;})();</script>`;
}

/** The wrapper of the block of item `n`: hidden until the page's seek shows it. */
export const layerWrapper = (n: number, block: string): string => `<div class="layer" id="layer-${n}" style="display:none">${block}</div>`;

/** An item of a layer as a scene draws it: its part, and where it shows in song seconds. */
export interface SceneLayerItem {
  readonly part: ScenePart;
  readonly from: number;
  readonly to: number;
}
