import { FormControl, FormGroup } from '@angular/forms';

import { revalidate } from './revalidate';

describe('revalidate', () => {
  it('runs the validators again and touches every control', () => {
    let fails = false;
    const control = new FormControl('x', () => (fails ? { outside: true } : null));
    const form = new FormGroup({ inner: new FormGroup({ control }) });
    expect(control.valid).toBe(true);
    fails = true;
    revalidate(form);
    expect(control.valid).toBe(false);
    expect(control.touched).toBe(true);
    expect(form.valid).toBe(false);
  });
});
