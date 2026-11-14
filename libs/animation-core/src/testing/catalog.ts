import { type Catalog, type Level, type Part } from '../lib/model';

/** A small catalog for the specs of the libraries above and of this one. */
const param = (name: string, type: Part['params'][number]['type'], def: string, extra: object = {}) => ({ name, type, default: def, ...extra });
const ALL: readonly Level[] = ['simple', 'medium', 'advanced'];

export const CATALOG: Catalog = {
  parts: [
    { name: 'toggle', description: 'A switch that flips on the beat', levels: ALL, costMs: 55, manual: false, params: [param('label', 'string', 'allow', { maxLength: 20 }), param('on', 'bool', 'true')] },
    { name: 'counter', description: 'A number that counts up with the loudness', levels: ALL, costMs: 55, manual: false, params: [param('to', 'int', '100', { min: 1, max: 999 }), param('speed', 'number', '1.5', { min: 0.5, max: 4 })] },
    { name: 'parallax-cards', description: 'Cards that slide at different depths', levels: ['medium', 'advanced'], costMs: 85, manual: false, params: [param('count', 'int', '3', { min: 1, max: 6 }), param('align', 'enum', 'left', { options: ['left', 'center', 'right'] })] },
    { name: 'wire-sphere', description: 'A 3D wireframe sphere that pulses', levels: ['advanced'], costMs: 85, manual: false, params: [param('detail', 'int', '12', { min: 4, max: 32 })] },
    { name: 'blank', description: 'Draws nothing of its own: the piece is its stage', levels: ALL, costMs: 40, manual: true, params: [] },
  ],
  characters: [{ name: 'bot', description: 'A small round robot', poses: ['idle', 'wave'], expressions: ['neutral', 'happy'] }],
  backgrounds: [{ name: 'stage', description: 'A plain stage floor' }],
  levels: ALL,
  styles: ['typographic', 'illustrated'],
  frameRates: [24, 30, 60],
  actions: ['enter', 'exit', 'bounce', 'look', 'wave', 'slide'],
  fonts: ['Inter', 'Space Grotesk', 'Playfair Display', 'DM Serif Display', 'JetBrains Mono', 'Bebas Neue'],
  modes: ['dark', 'light'],
  features: [],
};

export const BUILT_IN_PART_NAMES: readonly string[] = CATALOG.parts.map((p) => p.name);
