import { fromParamsModel, toParamsModel, buildParamsSchema } from './params-schema';
import { cards, counter, toggle } from './testing/parts';
import type { MotionPartsTexts } from './texts';

const parts = [toggle, counter, cards];
const t: MotionPartsTexts = { levels: 'Levels', aboveLevel: '(above)', noParams: 'None.', range: 'It must be from {min} to {max}.', whole: 'It must be a whole number.', maxLength: 'It can have up to {max} characters.', required: 'This value is needed.' };
const fields = (part: (typeof parts)[number]) => buildParamsSchema(part, t).fields as unknown as { key: string; type: string; defaultValue?: unknown; options?: { value: string }[]; validation?: Record<string, unknown> & { messages: Record<string, string> } }[];

describe('the schema of a part\'s parameters', () => {
  it('draws a text with its length limit and its default', () => {
    const f = fields(toggle).find((x) => x.key === 'label')!;
    expect(f).toMatchObject({ type: 'text', defaultValue: 'allow', validation: { maxLength: 20 } });
    expect(f.validation!.messages['maxLength']).toBe('It can have up to 20 characters.');
  });

  it('draws a switch for a bool, with its default', () => {
    expect(fields(toggle).find((x) => x.key === 'on')).toMatchObject({ type: 'checkbox', defaultValue: true });
  });

  it('draws a whole-number field for an int, with its limits, default and a pattern that refuses a fraction', () => {
    const f = fields(counter).find((x) => x.key === 'to')!;
    expect(f).toMatchObject({ type: 'number', defaultValue: 100, validation: { required: true, min: 1, max: 999, pattern: '^-?[0-9]+$' } });
    expect(f.validation!.messages['min']).toBe('It must be from 1 to 999.');
    expect(f.validation!.messages['pattern']).toBe('It must be a whole number.');
  });

  it('draws a number field for a number, which takes a fraction, with its limits', () => {
    const f = fields(counter).find((x) => x.key === 'speed')!;
    expect(f).toMatchObject({ type: 'number', defaultValue: 1.5, validation: { min: 0.5, max: 4 } });
    expect(f.validation).not.toHaveProperty('pattern');
  });

  it('draws a selector offering exactly the options of an enum', () => {
    const f = fields(cards).find((x) => x.key === 'align')!;
    expect(f.type).toBe('select');
    expect(f.options!.map((o) => o.value)).toEqual(['left', 'center']);
    expect(f.defaultValue).toBe('left');
  });

  it('has nothing but the lock for a part with no parameters', () => {
    const none = { ...toggle, params: [] };
    expect(fields(none).map((f) => f.key)).toEqual(['locked']);
  });

  it('leaves out a default that does not read as its type', () => {
    const odd = { ...counter, params: [{ name: 'n', type: 'int' as const, default: 'abc', min: 1, max: 5 }] };
    expect(fields(odd).find((f) => f.key === 'n')).not.toHaveProperty('defaultValue');
  });
});

describe('the values of the form', () => {
  it('start from the piece\'s and take the part\'s default for what it has none of', () => {
    expect(toParamsModel(counter, { to: 7 })).toEqual({ to: 7, speed: 1.5 });
    expect(toParamsModel(toggle, undefined)).toEqual({ label: 'allow', on: true });
    expect(toParamsModel(toggle, { on: false })).toEqual({ label: 'allow', on: false });
  });

  it('come back as the types the server wants', () => {
    expect(fromParamsModel(counter, { to: '12', speed: '2.5' })).toEqual({ to: 12, speed: 2.5 });
    expect(fromParamsModel(toggle, { label: 'hola', on: false })).toEqual({ label: 'hola', on: false });
    expect(fromParamsModel(cards, { align: 'center' })).toEqual({ align: 'center' });
  });

  it('leave out a number that is empty, not a number, or a fraction for a whole-number parameter', () => {
    expect(fromParamsModel(counter, { to: '', speed: 'abc' })).toEqual({});
    expect(fromParamsModel(counter, { to: 2.5, speed: null })).toEqual({});
    expect(fromParamsModel(counter, { to: 0, speed: 0 })).toEqual({ to: 0, speed: 0 });
  });

  it('take a switch that is not ticked as false', () => {
    expect(fromParamsModel(toggle, { label: 'x' })).toEqual({ label: 'x', on: false });
  });
});
