import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { allIds } from './model/document';
import { fromJson, toJson } from './model/json';
import { sampleDocument } from '../testing/sample-document';
import { SAMPLE_SVG } from '../testing/sample-svg';

describe('the sample', () => {
  it('has an SVG file and a text that are the same', () => {
    expect(readFileSync(join(process.cwd(), 'libs/vector-editor/src/testing/sample.svg'), 'utf8').trimEnd()).toBe(SAMPLE_SVG);
  });

  it('is a valid document whose every selectable node has its element in the markup', () => {
    const doc = fromJson(toJson(sampleDocument()));
    for (const id of allIds(doc.nodes).filter((i) => i !== 'sample')) expect(doc.nodes[0].kind === 'import' && doc.nodes[0].source).toContain(`id="${id}"`);
  });
});
