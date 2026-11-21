import { Injectable, TemplateRef, signal } from '@angular/core';

/**
 * The templates a component hands to its schema, by name. A schema field of
 * type `slot` shows the template registered under `props.slot`, so a block that
 * is not a form field yet keeps its place in the form while the rest moves to
 * the schema. A component provides its own instance.
 */
@Injectable()
export class SlotOutlet {
  readonly templates = signal<Record<string, TemplateRef<unknown>>>({});

  set(name: string, template: TemplateRef<unknown>): void {
    this.templates.update((t) => ({ ...t, [name]: template }));
  }

  remove(name: string): void {
    this.templates.update(({ [name]: _gone, ...rest }) => rest);
  }
}
