import { AbstractControl, FormArray, FormGroup } from '@angular/forms';

/**
 * Runs every validator of the form again and shows what they find. A validator
 * that reads state outside the form (the editor's own validation) is only
 * checked when its control changes; this is for when that state changed.
 */
export function revalidate(form: FormGroup): void {
  const walk = (control: AbstractControl): void => {
    if (control instanceof FormGroup || control instanceof FormArray) {
      Object.values(control.controls).forEach(walk);
    }
    control.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  };
  walk(form);
  form.markAllAsTouched();
  form.updateValueAndValidity();
}
