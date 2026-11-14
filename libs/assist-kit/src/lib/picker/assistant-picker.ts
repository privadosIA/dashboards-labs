import { TemplatePortal } from '@angular/cdk/portal';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, TemplateRef, ViewContainerRef, computed, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { catchError, forkJoin, of } from 'rxjs';

import { AssistLanguage } from '../language';
import type { Assistant } from '../model';
import { ASSIST_PROVIDERS, type NewProvider, type ProviderInfo } from '../providers';
import { ASSIST_SLOTS } from '../slots';
import { assistTextsFor } from '../texts';
import { AddProvider } from './add-provider/add-provider';
import en from './dynamic/assistant.en.json';
import es from './dynamic/assistant.es.json';

/**
 * One provider and one model for the whole run: the providers the server lists (the built-in Ollama, other Ollamas and OpenAI-compatible servers; external ones marked), the models of the
 * chosen one, the server's consent for a remote provider (asked before anything is sent; declining leaves the choice as it was) and, when there is no Ollama to talk to and no saved
 * provider, a form to add an external one. Nothing here writes the routing.
 */
@Component({
  selector: 'lab-assistant-picker',
  imports: [AddProvider, DynamicFormComponent, NgTemplateOutlet],
  templateUrl: './assistant-picker.html',
  styleUrl: './assistant-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantPicker implements OnInit {
  private readonly providersPort = inject(ASSIST_PROVIDERS);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(AssistLanguage).lang;
  protected readonly t = assistTextsFor(this.lang);
  private readonly base = pickSchema('assist-picker', { en, es }, this.lang);

  /** The pair this picker edits (two-way). */
  readonly value = model<Assistant>({ provider: '', model: '' });
  /** The models of the server's own routing, listed by the plan card (`assistModels`), for when no provider is chosen. */
  readonly routingModels = input<readonly string[]>([]);
  /** Whether the Add form is offered (the plan card does; Propose again does not). */
  readonly allowAdd = input(true);
  /** Offer Add provider at all times (a button that opens the form), not only when the built-in Ollama does not answer. */
  readonly alwaysAdd = input(false);
  /** The host's own words for the title, the hint and the consent sentence, when the picker's (written for the guided flow) do not fit its screen. */
  readonly title = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly consentSentence = input<((name: string, address: string) => string) | null>(null);

  private readonly addForm = viewChild(AddProvider);
  private readonly addTemplate = viewChild.required<TemplateRef<unknown>>('addTemplate');
  private readonly container = inject(ViewContainerRef);
  /** Where the page wants the form to add a provider, if it has a place for it. */
  protected readonly slots = inject(ASSIST_SLOTS, { optional: true });

  protected readonly providers = signal<ProviderInfo[] | null>(null);
  protected readonly reachable = signal<boolean | null>(null);
  private readonly loaded = signal<string[]>([]);
  /** The models to choose from: the routing's when no provider is chosen, else the chosen provider's. */
  protected readonly models = computed(() => (this.value().provider ? this.loaded() : [...this.routingModels()]));
  protected readonly form = signal<Record<string, unknown>>({ provider: '', model: '' });
  /** A remote provider waiting for the person's consent. */
  protected readonly consent = signal<ProviderInfo | null>(null);
  protected readonly consentProblem = signal('');
  private readonly consented = new Set<string>();
  /** The provider to go back to when the consent is declined. */
  private settled = '';
  private lastSeen = '';

  /** No Ollama to talk to and nothing else saved: the only way on is an external provider. */
  protected readonly noOllama = computed(() => this.reachable() === false && (this.providers() ?? []).every((p) => p.builtin || p.blocked));
  protected readonly schema = computed<DfFormSchema>(() => this.withOptions());
  protected readonly consentLine = (name: string, address: string): string => (this.consentSentence() ?? this.t.consentText)(name, address);
  /** The person pressed Add provider (only where `alwaysAdd` puts the button). */
  protected readonly addOpen = signal(false);
  /** The button that opens the form is shown: the host asked for it to be always there and the form is not already open for lack of Ollama. */
  protected readonly showAddButton = computed(() => this.allowAdd() && this.alwaysAdd() && !this.noOllama());
  /** The form to add an external provider is offered: the host allows it and either there is no other way on or the person asked for it. */
  protected readonly showAdd = computed(() => this.allowAdd() && (this.noOllama() || (this.alwaysAdd() && this.addOpen())));

  constructor() {
    // The page's place for the form, if it has one, shows it while it is offered and is emptied when it is not (or when this picker goes).
    effect(() => {
      const show = this.showAdd();
      const template = this.addTemplate();
      untracked(() => this.slots?.add.set(show && this.slots ? new TemplatePortal(template, this.container) : null));
    });
    inject(DestroyRef).onDestroy(() => this.slots?.add.set(null));
    // The person changed the provider or the model in the form.
    effect(() => {
      const f = this.form();
      untracked(() => this.changed(String(f['provider'] ?? ''), String(f['model'] ?? '')));
    });
  }

  ngOnInit(): void {
    const v = this.value();
    this.settled = v.provider;
    this.lastSeen = v.provider;
    this.form.set({ provider: v.provider, model: v.model });
    forkJoin([this.providersPort.list().pipe(catchError(() => of([] as ProviderInfo[]))), this.providersPort.reachable()])
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe(([list, reachable]) => {
        this.providers.set(list);
        this.reachable.set(reachable);
      });
    if (v.provider) this.loadModels(v.provider);
  }

  private changed(provider: string, modelName: string): void {
    if (provider !== this.lastSeen) {
      this.lastSeen = provider;
      const info = (this.providers() ?? []).find((p) => p.id === provider);
      if (info?.remote && !this.consented.has(info.id)) {
        // asked before anything is sent: the choice waits for the answer
        this.consent.set(info);
        this.consentProblem.set('');
        return;
      }
      this.select(provider);
      return;
    }
    if (modelName !== this.value().model) this.value.set({ provider: this.value().provider, model: modelName });
  }

  private select(provider: string, modelName = ''): void {
    this.settled = provider;
    this.value.set({ provider, model: modelName });
    this.form.set({ provider, model: modelName });
    this.lastSeen = provider;
    this.loadModels(provider, modelName);
  }

  private loadModels(provider: string, preferred = ''): void {
    if (!provider) return;
    this.providersPort
      .models(provider)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((names) => {
        this.loaded.set(names);
        const info = (this.providers() ?? []).find((p) => p.id === provider);
        const wanted = preferred || this.value().model || info?.model || '';
        if (wanted && wanted !== this.value().model) {
          this.value.set({ provider, model: wanted });
          this.form.set({ provider, model: wanted });
        }
      });
  }

  /** The person accepts: the server records the consent, and the provider is used. */
  protected accept(): void {
    const info = this.consent();
    if (!info) return;
    this.providersPort
      .acknowledge(info.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => {
          this.consented.add(info.id);
          this.consent.set(null);
          this.select(info.id);
        },
        error: (e: unknown) => this.consentProblem.set(e instanceof Error ? e.message : String(e)),
      });
  }

  /** The person declines: nothing was sent and the choice goes back to what it was. */
  protected decline(): void {
    this.consent.set(null);
    this.consentProblem.set('');
    this.lastSeen = this.settled;
    this.form.set({ provider: this.settled, model: this.value().model });
  }

  /** Adds an external provider, asks for its consent and uses it. */
  protected add(input: NewProvider): void {
    const form = this.addForm();
    form?.working.set(true);
    form?.problem.set('');
    this.providersPort
      .add(input)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (info) => {
          form?.working.set(false);
          this.addOpen.set(false);
          this.providers.update((list) => [...(list ?? []), info]);
          if (info.remote) {
            this.consent.set(info);
            this.consentProblem.set('');
          } else this.select(info.id, info.model);
        },
        error: (e: unknown) => {
          form?.working.set(false);
          form?.problem.set(e instanceof Error ? e.message : String(e));
        },
      });
  }

  private withOptions(): DfFormSchema {
    const providers = (this.providers() ?? []).filter((p) => !p.blocked);
    const names = this.models();
    return {
      ...this.base,
      fields: this.base.fields.map((f) => {
        if (!('key' in f)) return f;
        if (f.key === 'provider') return { ...f, options: [{ value: '', label: this.t.routing }, ...providers.map((p) => ({ value: p.id, label: p.remote && !p.builtin ? `${p.name} (${this.t.external})` : p.name }))] };
        if (f.key === 'model') return names.length ? { ...f, options: [{ value: '', label: '—' }, ...names.map((n) => ({ value: n, label: n }))] } : { ...f, type: 'text' };
        return f;
      }),
    } as DfFormSchema;
  }
}
