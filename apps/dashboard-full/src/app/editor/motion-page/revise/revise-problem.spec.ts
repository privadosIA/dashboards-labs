import { HttpErrorResponse } from '@angular/common/http';

import { MAX_INSTRUCTION, reviseProblem } from './revise-problem';

const refused = (status: number, message: string) => new HttpErrorResponse({ status, error: { error: { code: 'x', message } } });

describe('reviseProblem', () => {
  it('says the limit the server takes', () => {
    expect(MAX_INSTRUCTION).toBe(1000);
  });

  it('400, 409 and 503 keep the words of the server', () => {
    expect(reviseProblem(refused(400, 'instruction: say how'), true)).toBe('instruction: say how');
    expect(reviseProblem(refused(409, 'a run is in progress'), true)).toBe('a run is in progress');
    expect(reviseProblem(refused(503, 'no model'), true)).toBe('no model');
  });

  it('404 points to writing the page first', () => {
    expect(reviseProblem(refused(404, 'x'), true)).toContain('escribe primero la página');
  });

  it('422 for a page that moves with its own script says to write another page', () => {
    expect(reviseProblem(refused(422, 'the page has no timeline block'), false)).toContain('script propio');
  });

  it('422 for a timeline that did not work out carries the last problem and the way on', () => {
    const text = reviseProblem(refused(422, 'track "a" ends after the clip'), true);
    expect(text).toContain('track "a" ends after the clip');
    expect(text).toContain('Inténtalo de nuevo');
  });

  it('an answer without a message still says something', () => {
    expect(reviseProblem(new HttpErrorResponse({ status: 500 }), true)).not.toBe('');
  });
});
