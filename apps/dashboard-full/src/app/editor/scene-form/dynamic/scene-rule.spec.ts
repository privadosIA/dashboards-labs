import { AbstractControl } from '@angular/forms';

import { SCENE_VALIDATORS, sceneRuleState } from './validations';

describe('sceneRule validator', () => {
  const rule = SCENE_VALIDATORS.find((v) => v.name === 'sceneRule')!;
  const run = (name: string) => rule.validate({} as AbstractControl, { rule: name });
  const message = (name: string) => (rule.message as (a: Record<string, unknown>, f: unknown) => string)({ rule: name }, {});

  afterEach(() => (sceneRuleState.errors = {}));

  it('passes while the editor finds nothing wrong', () => {
    expect(run('id')).toBe(true);
  });

  it('fails with the editor\'s own message for that rule only', () => {
    sceneRuleState.errors = { id: 'Id duplicado', prompt: undefined };
    expect(run('id')).toBe(false);
    expect(message('id')).toBe('Id duplicado');
    expect(run('prompt')).toBe(true);
  });
});
