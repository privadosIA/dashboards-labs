import { Injectable, inject, signal } from '@angular/core';

import { ApiService } from './api.service';

/** Whether this server has the 3D model library: the first read of its packs says (a server older than the library answers 404). Asked once, when something first needs to know. */
@Injectable({ providedIn: 'root' })
export class ModelLibraryAvailability {
  readonly available = signal(false);

  constructor() {
    inject(ApiService)
      .listModelPacks()
      .subscribe({ next: () => this.available.set(true), error: () => this.available.set(false) });
  }
}
