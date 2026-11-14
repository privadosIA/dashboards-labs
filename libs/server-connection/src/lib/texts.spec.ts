import { connectionTexts } from './texts';

const keys = (value: unknown, prefix = ''): string[] =>
  Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'object' && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('the texts of the connection', () => {
  it('have the same keys in both languages and none empty', () => {
    expect(keys(connectionTexts('es'))).toEqual(keys(connectionTexts('en')));
    for (const lang of ['es', 'en'] as const) {
      expect(JSON.stringify(connectionTexts(lang))).not.toContain('""');
    }
  });

  it('are different between the languages', () => {
    expect(connectionTexts('en').dialog.title).toBe('Server connection');
    expect(connectionTexts('es').dialog.title).toBe('Conexión con el servidor');
  });
});
