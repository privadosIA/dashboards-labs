import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { defaultClientColor, isClientColor } from '../shared/client-color';
import { ClientLabel, ProjectKind } from './api.models';
import { ApiService } from './api.service';

/** A name the server accepts as a client label: `embedded`, `unknown` or one to 32 lowercase letters, digits or hyphens. */
export const CLIENT_NAME = /^[a-z0-9-]{1,32}$/;

/** True when the label is one the server accepts as a client name; an empty one removes the label. */
export const validClient = (client: string): boolean => client.trim() === '' || CLIENT_NAME.test(client.trim());

/**
 * The client labels the server reports (`GET /api/clients`): their colour, their count and the order of their use. The one place that knows a label's colour,
 * so the chips, the badges and the forms never keep a colour of their own. When the list cannot be read it stays empty and nothing else stops working.
 */
@Injectable({ providedIn: 'root' })
export class ClientLabelsStore {
  private readonly api = inject(ApiService);

  /** The labels in the order the server gives them (newest use first). */
  readonly labels = signal<ClientLabel[]>([]);
  readonly loaded = signal(false);
  private readonly colors = computed(() => new Map(this.labels().map((l) => [l.name, l.color])));

  /** Reads the labels again. A failure leaves the list as it was (empty at the start): the chips just do not appear. */
  async load(): Promise<void> {
    try {
      this.labels.set(await firstValueFrom(this.api.listClients()));
    } catch {
      /* the screen works without the chips */
    } finally {
      this.loaded.set(true);
    }
  }

  /** The colour of a label: the server's, or for a label the list does not have yet the one the contract works out from the name. */
  colorOf(name: string | undefined | null): string {
    const label = name || 'unknown';
    const known = this.colors().get(label);
    return isClientColor(known) ? known : defaultClientColor(label);
  }

  /** Keeps a colour with the server (`null` restores the default one) and shows it at once; a refusal leaves the colour as it was and is thrown for the caller to explain. */
  async setColor(name: string, color: string | null): Promise<void> {
    const answer = await firstValueFrom(this.api.setClientColor(name, color));
    const had = this.labels().some((l) => l.name === name);
    this.labels.update((list) => (had ? list.map((l) => (l.name === name ? { ...l, color: answer.color } : l)) : list));
    if (!had) await this.load();
  }

  /** Changes the label of an item (`null` removes it), then reads the labels again so the counts follow. A refusal is thrown and nothing changes. */
  async setClient(id: string, client: string | null, kind?: ProjectKind): Promise<void> {
    await firstValueFrom(this.api.setClient(id, client, kind));
    await this.load();
  }
}
