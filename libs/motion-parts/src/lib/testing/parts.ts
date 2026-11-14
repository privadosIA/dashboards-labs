import type { Part } from '../model';

const param = (name: string, type: Part['params'][number]['type'], def: string, extra: object = {}) => ({ name, type, default: def, ...extra });
const ALL = ['simple', 'medium', 'advanced'] as const;

/** A few parts shaped like the server's, for the tests of this library: one of each type of parameter. */
export const toggle: Part = { name: 'toggle', description: 'A switch', levels: ALL, costMs: 55, manual: false, params: [param('label', 'string', 'allow', { maxLength: 20 }), param('on', 'bool', 'true')] };
export const counter: Part = { name: 'counter', description: 'A counter', levels: ALL, costMs: 55, manual: false, params: [param('to', 'int', '100', { min: 1, max: 999 }), param('speed', 'number', '1.5', { min: 0.5, max: 4 })] };
export const cards: Part = { name: 'cards', description: 'Cards', levels: ['medium', 'advanced'], costMs: 85, manual: true, params: [param('align', 'enum', 'left', { options: ['left', 'center'] })] };
export const blank: Part = { name: 'blank', description: 'Draws nothing', levels: ALL, costMs: 40, manual: true, params: [] };
