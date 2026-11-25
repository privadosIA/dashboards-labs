import type { ViewerColors } from './viewer-engine';

const FALLBACK: ViewerColors = { background: 0x1b2420, sky: 0xffffff, ground: 0x2a332f };

/** What a CSS colour (any form the browser accepts, `oklch` and `color-mix` included) is, as `0xrrggbb`; `null` where the page cannot say (no canvas). */
export function toHex(css: string, doc: Document = document): number | null {
  const plain = fromRgbText(css);
  if (plain !== null || /^var\(|^$/.test(css.trim())) return plain;
  try {
    const ctx = doc.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) return fromRgbText(css);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return (r << 16) | (g << 8) | b;
  } catch {
    return fromRgbText(css);
  }
}

function fromRgbText(css: string): number | null {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(css.trim());
  return m ? (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]) : null;
}

/** The colours the viewer draws with, read from the host's tokens (`--lab-surface-high` for the background, its `--lab-surface` for the ground): they follow the theme when read again. */
export function viewerColors(host: HTMLElement): ViewerColors {
  const doc = host.ownerDocument;
  const read = (token: string): number | null => {
    const probe = doc.createElement('span');
    probe.style.color = `var(${token})`;
    probe.style.display = 'none';
    host.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value ? toHex(value, doc) : null;
  };
  return { background: read('--lab-surface-high') ?? FALLBACK.background, sky: FALLBACK.sky, ground: read('--lab-surface') ?? FALLBACK.ground };
}
