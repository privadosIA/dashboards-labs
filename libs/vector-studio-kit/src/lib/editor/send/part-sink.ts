import { Injectable, inject } from '@angular/core';
import { ANIMATION, type Draft } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';
import type { SinkDraft, VectorPartSink } from '@lab/vector-editor';
import { filter, map, take, takeWhile, type Observable } from 'rxjs';

/**
 * The send dialog's catalog, over the port the dashboard already has (`ANIMATION`: the server's adapter or the in-memory one) and the ticket the
 * server asks for the pictures of a draft. Provided where the port is (the route's providers), not at the root. A failure of the port reaches the
 * dialog as an `Error` whose message is the server's own words.
 */
@Injectable()
export class PartSink implements VectorPartSink {
  private readonly port = inject(ANIMATION);
  private readonly tickets = inject(TicketService);

  /** A picture of a draft with the ticket the server asks for when it has a token (an `<img>` cannot send one). */
  private src(address: string): string {
    return address.startsWith('data:') ? address : this.tickets.withTicket(address);
  }

  private draft(d: Draft): SinkDraft {
    return { id: d.id, state: d.state, problems: d.problems, ...(d.error ? { error: d.error } : {}), previews: d.preview.map((p) => this.src(p)) };
  }

  isNameFree(name: string): Observable<boolean> {
    return this.port.catalog().pipe(
      take(1),
      map((catalog) => !catalog.parts.some((p) => p.name === name)),
    );
  }

  createDraft(files: { manifest: string; fragment: string }): Observable<SinkDraft> {
    return this.port.createDraftFromText(files).pipe(map((d) => this.draft(d)));
  }

  followDraft(id: string): Observable<SinkDraft> {
    return this.port.drafts().pipe(
      map((list) => list.find((d) => d.id === id)),
      filter((d): d is Draft => !!d),
      takeWhile((d) => d.state === 'writing', true),
      map((d) => this.draft(d)),
    );
  }

  approve(id: string): Observable<void> {
    return this.port.approveDraft(id).pipe(map(() => undefined));
  }

  replace(name: string, files: { manifest: string; fragment: string }): Observable<void> {
    return this.port.replacePart(name, files).pipe(map(() => undefined));
  }
}
