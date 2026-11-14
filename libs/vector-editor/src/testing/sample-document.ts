import { identityTransform, newDocument, type ImportNode, type VectorDocument } from '../lib/model/document';
import { SAMPLE_SVG } from './sample-svg';

const inside = (svg: string): string => svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')).trim();

/** The sample's selectable elements, as the import would build them. */
function element(id: string, name: string, tag: string, cx: number, cy: number, children: ImportNode[] = []): ImportNode {
  return {
    id,
    name,
    kind: 'import',
    source: '',
    tag,
    visible: true,
    locked: false,
    transform: { ...identityTransform(), anchorX: cx, anchorY: cy },
    opacity: 1,
    fill: { kind: 'keep' },
    stroke: { kind: 'keep' },
    tracks: {},
    children,
  };
}

/** A document over `sample.svg` with tracks on three nodes (the dot slides and swells, the logo turns, a wing changes colour) and one parameter (the text). */
export function sampleDocument(): VectorDocument {
  const dot = element('dot', 'Dot', 'circle', 50, 50);
  dot.tracks = {
    x: [
      { t: 0, value: 0, ease: 'in-out' },
      { t: 2, value: 60, ease: 'linear' },
    ],
    scaleX: [
      { t: 0, value: 1, ease: 'out' },
      { t: 4, value: 1.5, ease: 'linear' },
    ],
  };
  const wingA = element('wing-a', 'Wing A', 'path', 120, 50);
  wingA.tracks = {
    fill: [
      { t: 0, value: '#457b9d', ease: 'linear' },
      { t: 3, value: '#e63946', ease: 'linear' },
    ],
  };
  const logo = element('logo', 'Logo', 'g', 100, 50, [dot, wingA, element('wing-b', 'Wing B', 'path', 120, 50), element('label', 'Label', 'text', 115, 91)]);
  logo.tracks = {
    rotate: [
      { t: 0, value: 0, ease: 'linear' },
      { t: 4, value: 360, ease: 'linear' },
    ],
    opacity: [
      { t: 0, value: 0, ease: 'out' },
      { t: 2, value: 1, ease: 'linear' },
    ],
  };
  const root: ImportNode = {
    ...element('sample', 'Sample logo', 'svg', 100, 50, [logo, element('tag', 'Tag', 'rect', 175, 16)]),
    source: inside(SAMPLE_SVG),
  };
  return newDocument({
    viewBox: { x: 0, y: 0, width: 200, height: 100 },
    duration: 4,
    nodes: [root],
    params: [
      { name: 'title', type: 'string', description: 'The text of the logo', default: 'LOGO', max_length: 20, target: { nodeId: 'label', what: 'text' } },
    ],
  });
}
