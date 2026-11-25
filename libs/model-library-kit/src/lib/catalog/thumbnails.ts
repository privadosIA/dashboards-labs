import { DestroyRef, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { MODEL_LIBRARY_PORT } from '../port';

/** The pictures of the models as addresses an `<img>` can use, asked once each. A model with no picture (the server cannot draw it) answers `null`, and the addresses are given back when the screen that asked is gone. */
@Injectable()
export class Thumbnails {
  private readonly port = inject(MODEL_LIBRARY_PORT);
  private readonly kept = new Map<string, Promise<string | null>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.kept.values()) void url.then((u) => u && URL.revokeObjectURL(u));
      this.kept.clear();
    });
  }

  url(pack: string, name: string): Promise<string | null> {
    const key = `${pack}/${name}`;
    let url = this.kept.get(key);
    if (!url) {
      url = firstValueFrom(this.port.thumbnail(pack, name)).then(
        (blob) => URL.createObjectURL(blob),
        () => null,
      );
      this.kept.set(key, url);
    }
    return url;
  }
}
