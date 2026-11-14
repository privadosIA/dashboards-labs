import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as core from '../public-api';

const PURE = ['model.ts', 'port.ts', 'failure.ts', 'script-edit.ts'];

describe('@lab/animation-core', () => {
  it.each(PURE)('%s imports nothing from @angular', (file) => {
// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
    const text = readFileSync(join(process.cwd(), 'libs/animation-core/src/lib', file), 'utf8');
    expect(text).not.toMatch(/from\s+['"]@angular\//);
  });

  it('exports the model, the port token, the failure and the script edits', () => {
    for (const name of ['ANIMATION', 'AnimationFailure', 'failureOf', 'defaultParams', 'MAX_EXTRA_PARTS', 'moveCut', 'setParams', 'addExtra', 'MIN_SECONDS']) {
      expect(Object.keys(core)).toContain(name);
    }
  });
});
