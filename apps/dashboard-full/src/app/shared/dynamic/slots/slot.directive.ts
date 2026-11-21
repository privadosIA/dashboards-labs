import { Directive, OnDestroy, OnInit, TemplateRef, inject, input } from '@angular/core';

import { SlotOutlet } from './slot-outlet';

/** Marks an `ng-template` as the content of a schema `slot` field: `<ng-template moSlot="preview">…</ng-template>`. */
@Directive({ selector: 'ng-template[moSlot]' })
export class SlotDirective implements OnInit, OnDestroy {
  readonly moSlot = input.required<string>();

  private readonly outlet = inject(SlotOutlet);
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);

  ngOnInit(): void {
    this.outlet.set(this.moSlot(), this.template);
  }

  ngOnDestroy(): void {
    this.outlet.remove(this.moSlot());
  }
}
