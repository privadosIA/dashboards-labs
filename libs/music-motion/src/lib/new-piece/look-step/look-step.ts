import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, OnInit, computed, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { catchError, forkJoin, interval, of, take } from 'rxjs';

import { LocalStyles, type LocalStyle } from '../../animation/local-styles';
import { isAnalysing, type Preset, type Reference } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { NO_LOOK, type Look } from '../look';
import en from './dynamic/address.en.json';
import es from './dynamic/address.es.json';

/** How often a reference that is being analysed is read again, in milliseconds. */
export const ANALYSIS_POLL_MS = new InjectionToken<number>('ANALYSIS_POLL_MS', { providedIn: 'root', factory: () => 1500 });

/**
 * The first step of a new animation: the look. A reference that is already analysed, or a YouTube address that is added here and followed
 * until it is ready, or a style (the server's or an own one), or none. Nothing is made by choosing: the style of a reference is made when the
 * animation is.
 */
@Component({
  selector: 'app-look-step',
  imports: [DynamicFormComponent],
  templateUrl: './look-step.html',
  styleUrl: './look-step.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookStep implements OnInit {
  readonly look = model<Look>(NO_LOOK);

  private readonly port = inject(ANIMATION);
  private readonly ticket = inject(TicketService);
  private readonly local = inject(LocalStyles);
  private readonly destroyed = inject(DestroyRef);
  private readonly pollMs = inject(ANALYSIS_POLL_MS);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.newAnimation.look;
  protected readonly schema = pickSchema('address', { en, es }, this.lang);

  protected readonly references = signal<readonly Reference[]>([]);
  protected readonly presets = signal<readonly Preset[]>([]);
  protected readonly own = this.local.styles;
  protected readonly model = signal<Record<string, unknown>>({ address: '' });
  protected readonly valid = signal(false);
  protected readonly adding = signal(false);
  protected readonly added = signal(false);
  protected readonly refused = signal('');
  protected readonly chosen = computed(() => this.look());

  ngOnInit(): void {
    this.port
      .references()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (list) => this.references.set(this.keepNewer(list)), error: (e) => this.refused.set(failureText(e, this.texts)) });
    // The styles are an extra: a server that cannot list them still has the references.
    this.port
      .presets()
      .pipe(take(1), catchError(() => of([] as readonly Preset[])), takeUntilDestroyed(this.destroyed))
      .subscribe((list) => this.presets.set(list));
    // A reference that is being analysed is read again until it is not: an adapter need not send the list again as time goes by.
    interval(this.pollMs)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe(() => this.follow());
  }

  /** What the list says, keeping what was read later of a reference that the list still says is analysing. */
  private keepNewer(list: readonly Reference[]): readonly Reference[] {
    const now = new Map(this.references().map((r) => [r.id, r]));
    return list.map((r) => (isAnalysing(r) && now.get(r.id) && !isAnalysing(now.get(r.id)!) ? now.get(r.id)! : r));
  }

  private follow(): void {
    const waiting = this.references().filter(isAnalysing);
    if (waiting.length === 0) return;
    forkJoin(waiting.map((r) => this.port.reference(r.id).pipe(catchError(() => of(r)))))
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((read) => {
        const byId = new Map(read.map((r) => [r.id, r]));
        this.references.update((list) => list.map((r) => byId.get(r.id) ?? r));
        const chosen = this.look();
        if (chosen.kind === 'reference' && byId.get(chosen.reference.id)) this.look.set({ kind: 'reference', reference: byId.get(chosen.reference.id)! });
      });
  }

  protected frame(reference: Reference): string {
    const first = reference.analysis?.frames[0];
    return first ? this.ticket.withTicket(first) : '';
  }

  protected analysing(r: Reference): boolean {
    return isAnalysing(r);
  }

  protected isNone(): boolean {
    return this.look().kind === 'none';
  }

  protected isReference(r: Reference): boolean {
    const l = this.look();
    return l.kind === 'reference' && l.reference.id === r.id;
  }

  protected isStyle(p: Preset): boolean {
    const l = this.look();
    return l.kind === 'style' && l.presetId === p.id;
  }

  protected isOwn(s: LocalStyle): boolean {
    const l = this.look();
    return l.kind === 'own' && l.id === s.id;
  }

  protected chooseNone(): void {
    this.look.set(NO_LOOK);
  }

  protected chooseReference(r: Reference): void {
    if (r.state === 'ready') this.look.set({ kind: 'reference', reference: r });
  }

  protected chooseStyle(p: Preset): void {
    this.look.set({ kind: 'style', presetId: p.id, name: p.name });
  }

  protected chooseOwn(s: LocalStyle): void {
    this.look.set({ kind: 'own', id: s.id, name: s.name });
  }

  protected add(): void {
    const address = String(this.model()['address'] ?? '').trim();
    if (!this.valid() || this.adding() || !address) return;
    this.adding.set(true);
    this.added.set(false);
    this.refused.set('');
    this.port
      .addReference({ url: address })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (reference) => {
          this.adding.set(false);
          this.added.set(true);
          this.model.set({ address: '' });
          this.references.update((list) => [reference, ...list.filter((r) => r.id !== reference.id)]);
        },
        error: (e) => {
          this.adding.set(false);
          this.refused.set(`${this.t.refused} ${failureText(e, this.texts)}`);
        },
      });
  }
}
