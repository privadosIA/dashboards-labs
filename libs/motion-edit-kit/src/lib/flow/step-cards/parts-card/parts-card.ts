import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { ANIMATION } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';
import { type Subscription } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { execute, failureOf } from '../../execute';
import { FlowStore } from '../../flow.store';
import { reasonText } from '../../shared/reason-text';
import { DRAFT_POLL_MS, type PartItem, type PartsResult, askPart, followDrafts, runParts, withItem } from '../../steps/parts';
import en from './dynamic/ask.en.json';
import es from './dynamic/ask.es.json';

/** How often the drafts are read while they are written (a spec shortens it). */
export const DRAFT_POLL = new InjectionToken<number>('DRAFT_POLL', { providedIn: 'root', factory: () => DRAFT_POLL_MS });

/**
 * The Parts step: each wanted part the catalog lacks is drafted by the assistant and followed; the review shows the server's previews with Approve, Ask again and Drop, lists the parts
 * the catalog already has, and suggests going back to the Script once to use what was approved (never automatically).
 */
@Component({
  selector: 'app-parts-card',
  imports: [DynamicFormComponent],
  templateUrl: './parts-card.html',
  styleUrl: './parts-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartsCard implements OnInit {
  private readonly store = inject(FlowStore);
  private readonly animation = inject(ANIMATION);
  private readonly tickets = inject(TicketService);
  private readonly pollMs = inject(DRAFT_POLL);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).flow.parts;
  protected readonly why = (reason?: string) => reasonText(this.lang, reason);
  protected readonly schema = pickSchema('flow-parts-ask', { en, es }, this.lang);

  protected readonly flow = this.store.flow;
  protected readonly step = computed(() => this.flow()?.steps.parts);
  protected readonly result = computed(() => (this.step()?.result as unknown as PartsResult | undefined) ?? { items: [] });
  protected readonly auto = computed(() => this.flow()?.autoContinue.parts === true);
  protected readonly model = computed(() => this.flow()?.plan.animation.model ?? '');
  protected readonly provider = computed(() => this.flow()?.plan.animation.provider ?? '');
  protected readonly progress = signal<PartItem[]>([]);
  protected readonly busy = signal(false);
  protected readonly asking = signal<string | null>(null);
  protected readonly form = signal<Record<string, unknown>>({});
  protected readonly valid = signal(false);
  protected readonly problem = signal('');
  protected readonly working = signal<string | null>(null);
  private running: Subscription | undefined;

  protected readonly items = computed(() => (this.step()?.status === 'running' ? this.progress() : this.result().items));
  protected readonly anyApproved = computed(() => this.result().items.some((i) => i.status === 'approved'));
  protected readonly suggest = computed(() => this.anyApproved() && !this.result().suggested);

  ngOnInit(): void {
    if (this.step()?.status === 'pending') this.run();
    this.destroyed.onDestroy(() => this.running?.unsubscribe());
  }

  protected run(): void {
    const flow = this.flow();
    if (!flow) return;
    this.running?.unsubscribe();
    this.progress.set([]);
    this.running = execute(this.store, 'parts', () => runParts(this.animation, flow.plan, this.model(), this.pollMs, this.provider()), {
      onProgress: (info) => this.progress.set((info['items'] as PartItem[]) ?? []),
      onBusy: (b) => this.busy.set(b),
    });
  }

  protected preview(address: string): string {
    return this.tickets.withTicket(address);
  }

  /** Approves the draft: the part joins the catalog. */
  protected approve(item: PartItem): void {
    if (!item.draftId || this.working()) return;
    this.working.set(item.name);
    this.problem.set('');
    this.animation
      .approveDraft(item.draftId)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (part) => {
          this.working.set(null);
          this.save(withItem(this.result(), { ...item, status: 'approved', partName: part.name }));
        },
        error: (e: unknown) => {
          this.working.set(null);
          this.problem.set(failureOf(e).reason);
        },
      });
  }

  /** Drops the draft: it is removed on the server and the part is left out. */
  protected drop(item: PartItem): void {
    if (!item.draftId || this.working()) return;
    this.working.set(item.name);
    this.problem.set('');
    this.animation
      .removeDraft(item.draftId)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => {
          this.working.set(null);
          this.save(withItem(this.result(), { ...item, status: 'dropped', preview: [] }));
        },
        error: (e: unknown) => {
          this.working.set(null);
          this.problem.set(failureOf(e).reason);
        },
      });
  }

  protected openAsk(item: PartItem): void {
    this.form.set({ request: item.request });
    this.asking.set(item.name);
  }

  /** Asks again with the edited request: a new draft replaces the old one, which is removed. */
  protected ask(item: PartItem): void {
    if (!this.valid()) return;
    const request = String(this.form()['request'] ?? '').trim();
    this.working.set(item.name);
    this.problem.set('');
    askPart(this.animation, { ...item, request }, this.model(), this.provider())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (fresh) => {
          this.working.set(null);
          this.asking.set(null);
          if (item.draftId) this.animation.removeDraft(item.draftId).subscribe({ error: () => undefined });
          this.store.setRefs({ drafts: { [item.name]: fresh.draftId ?? '' } });
          this.save(withItem(this.result(), fresh));
          this.watch(fresh);
        },
        error: (e: unknown) => {
          this.working.set(null);
          this.problem.set(failureOf(e).reason);
        },
      });
  }

  protected setAuto(on: boolean): void {
    this.store.setAuto('parts', on);
  }

  protected skip(): void {
    this.store.skip('parts');
  }

  /** Back to the Script review to use the approved parts; suggested once. */
  protected backToScript(): void {
    this.store.setResult('parts', { ...this.result(), suggested: true } as unknown as Record<string, unknown>);
    this.store.back('script');
  }

  protected continue(): void {
    this.store.continue();
  }

  private save(result: PartsResult): void {
    this.store.setResult('parts', result as unknown as Record<string, unknown>);
  }

  /** A draft asked again is followed until it is ready or failed; what comes back replaces the item while it is still the current draft of that part. */
  private watch(item: PartItem): void {
    if (item.status !== 'writing' || !item.draftId) return;
    followDrafts(this.animation, [item], this.pollMs)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe(([fresh]) => {
        const current = this.result().items.find((i) => i.name === item.name);
        if (current?.draftId === item.draftId) this.save(withItem(this.result(), fresh));
      });
  }
}
