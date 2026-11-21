import { defaultParams, readDefault, type PartParam } from './model';
import { blank, cards, counter, toggle } from './testing/parts';

const param = (type: PartParam['type'], def: string): PartParam => ({ name: 'p', type, default: def });

describe('the default of a parameter', () => {
  it('is read by its type: a whole number, a number, a switch, a text', () => {
    expect(readDefault(param('int', '100'))).toBe(100);
    expect(readDefault(param('number', '1.5'))).toBe(1.5);
    expect(readDefault(param('bool', 'true'))).toBe(true);
    expect(readDefault(param('bool', 'false'))).toBe(false);
    expect(readDefault(param('string', 'allow'))).toBe('allow');
    expect(readDefault(param('enum', 'left'))).toBe('left');
  });

  it('is left out when the text does not read as its type', () => {
    expect(readDefault(param('int', '1.5'))).toBeUndefined();
    expect(readDefault(param('int', ''))).toBeUndefined();
    expect(readDefault(param('number', 'fast'))).toBeUndefined();
    expect(readDefault(param('bool', 'yes'))).toBeUndefined();
  });
});

describe('the values a part starts with', () => {
  it('are the defaults of its parameters, read by type', () => {
    expect(defaultParams(toggle)).toEqual({ label: 'allow', on: true });
    expect(defaultParams(counter)).toEqual({ to: 100, speed: 1.5 });
    expect(defaultParams(cards)).toEqual({ align: 'left' });
  });

  it('are nothing for a part with no parameters, and leave out a default that does not read', () => {
    expect(defaultParams(blank)).toEqual({});
    expect(defaultParams({ ...counter, params: [{ name: 'to', type: 'int', default: 'many' }] })).toEqual({});
  });
});
