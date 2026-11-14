import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { hasSvgFeature } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';
import { fromPart, newDocument, slug, toJson, VectorDescribe, VectorEditorPage, VectorSend, VectorStore, type ImportReport } from '@lab/vector-editor';
import { catchError, of } from 'rxjs';

import { Handoff } from '../core/handoff';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { DOWNLOAD } from './files/download';
import { animateExample } from './files/example';
import { EXAMPLE_SVG } from './files/example-svg';
import { fileBase } from './files/names';
import { kindOf, openText, type OpenMode } from './files/open-file';
import { clearDraft, DRAFT_DELAY_MS, readDraft, writeDraft, type Draft } from './draft-storage';
import { ExportMenu } from './export-menu/export-menu';
import { rememberedModel, rememberModel, SvgSink } from './describe/svg-sink';
import { HelpDialog } from './help/help-dialog';
import { PartSink } from './send/part-sink';

interface Notice {
  text: string;
  problem: boolean;
}

/**
 * The editor: the library's layout with the dashboard's toolbar. Open takes an `.svg` (a new document, or a node added to the current one) or a
 * `.vector.json`; Save writes the document as `.vector.json`; Export gives the animated SVG, a still or the part's files. The document in progress
 * is kept in the browser a second after each change and offered on the next visit; leaving with changes asks first.
 */
@Component({
  selector: 'app-editor-page',
  imports: [ExportMenu, HelpDialog, VectorDescribe, VectorEditorPage, VectorSend],
  providers: [PartSink, SvgSink],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage {
  readonly store = new VectorStore(newDocument());

  protected readonly t = textsFor(inject(LanguageService).lang).editor;
  private readonly texts = textsFor(inject(LanguageService).lang);
  private readonly download = inject(DOWNLOAD);
  protected readonly sink = inject(PartSink);
  protected readonly svgSink = inject(SvgSink);
  protected readonly preferredModel = rememberedModel();
  /** Describe is offered only when the server says it can write a drawing: a server without the operation never lists the feature. */
  private readonly port = inject(ANIMATION);
  private readonly destroyedRef = inject(DestroyRef);
  private readonly catalog = toSignal(this.port.catalog().pipe(catchError(() => of(null))), { initialValue: null });
  protected readonly canDescribe = computed(() => hasSvgFeature(this.catalog()));
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected readonly draft = signal<Draft | null>(readDraft());
  protected readonly pending = signal<{ name: string; text: string } | undefined>(undefined);
  protected readonly notice = signal<Notice | undefined>(undefined);
  protected readonly helpOpen = signal(false);
  protected readonly exportOpen = signal(false);
  protected readonly sendOpen = signal(false);
  protected readonly describeOpen = signal(false);

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // The draft follows the document: a second after the last change it is written, and when the document is back to what was saved it is dropped.
    effect(() => {
      const doc = this.store.doc();
      const dirty = this.store.dirty();
      untracked(() => {
        if (this.timer) clearTimeout(this.timer);
        if (!dirty) {
          if (!this.draft()) clearDraft();
          return;
        }
        this.timer = setTimeout(() => this.keep(), DRAFT_DELAY_MS);
        void doc;
      });
    });
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
    // A part the catalog opened comes as a saved document: it is what the server has.
    const opened = inject(Handoff).take();
    if (opened) {
      this.store.load(opened);
      this.say(this.texts.catalog.opened(opened.partName ?? ''), false);
    } else {
      // A link from another place names the part to open (`editor?part=<name>`): it is opened as the catalog's Open does, and the name leaves the address so a reload does not open it again.
      const asked = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('part');
      if (asked) this.openByName(asked);
      // With nothing to go on (no draft of a last visit, no part asked for, an empty page) the editor starts with the example, with its first layer selected, so that what it
      // does is already in front of the person; it is not a change, so nothing is saved as a draft and leaving does not ask.
      else if (!this.draft() && this.store.doc().nodes.length === 0) this.startWithExample();
    }
  }

  private openByName(name: string): void {
    void inject(Router, { optional: true })?.navigate([], { queryParams: { part: null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.port
      .partText(name)
      .pipe(takeUntilDestroyed(this.destroyedRef))
      .subscribe({
        next: (text) => {
          const made = fromPart({ manifest: text.manifest, fragment: text.fragment });
          if (!('doc' in made)) return this.say(this.t.cannotOpen(`"${name}": ${made.problem}`), true);
          this.store.load({ ...made.doc, name: made.doc.name ?? name, partName: name });
          this.say(this.texts.catalog.opened(name), false);
        },
        error: (e: unknown) => this.say(this.t.cannotOpen(`"${name}": ${e instanceof Error ? e.message : String(e)}`), true),
      });
  }

  /** Whether leaving would lose changes: the route guard asks. */
  hasChanges(): boolean {
    return this.store.dirty();
  }

  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty()) event.preventDefault();
  }

  private keep(): void {
    if (!this.store.dirty()) return;
    const result = writeDraft({ doc: this.store.doc(), at: Date.now() });
    if (result === 'too-big') this.say(this.t.draftTooBig, true);
    else if (result === 'refused') this.say(this.t.draftRefused, true);
  }

  // — the draft of the last visit —

  protected when(at: number): string {
    return new Date(at).toLocaleString();
  }

  protected continueDraft(): void {
    const d = this.draft();
    if (d) this.store.adopt(d.doc);
    this.draft.set(null);
  }

  protected discardDraft(): void {
    clearDraft();
    this.draft.set(null);
  }

  // — files in —

  protected chooseFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected async fileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!kindOf(file.name)) return this.say(this.t.notAFile(file.name), true);
    await this.openFile(file.name, await file.text());
  }

  /** Opens what a file holds. A `.svg` over a document that has something asks whether it is a new document or an addition. */
  async openFile(name: string, text: string): Promise<void> {
    if (kindOf(name) === 'svg' && this.store.doc().nodes.length > 0) {
      this.pending.set({ name, text });
      return;
    }
    this.open(name, text, 'new');
  }

  protected openPending(mode: OpenMode): void {
    const p = this.pending();
    this.pending.set(undefined);
    if (p) this.open(p.name, p.text, mode);
  }

  private open(name: string, text: string, mode: OpenMode): void {
    const opened = openText(name, text, this.store.doc(), mode);
    if ('problem' in opened) return this.say(this.t.cannotOpen(opened.problem), true);
    if (opened.kind === 'json') this.store.load(opened.doc);
    else if (mode === 'new') {
      // A document of ours is what a file has; an imported SVG is work not yet kept, so the saved document stays the empty one.
      this.store.load(newDocument());
      this.store.adopt(opened.doc);
    } else this.store.apply(() => opened.doc);
    this.store.clearSelection();
    this.say(opened.report ? this.describe(name, opened.report) : this.t.imported(name), false);
  }

  private describe(name: string, r: ImportReport): string {
    const removed = Object.values(r.removed).reduce((a, b) => a + b, 0);
    const parts = [removed > 0 ? this.t.importedCleaned(name, removed) : this.t.imported(name)];
    if (r.warnings.includes('large')) parts.push(this.t.importLarge);
    if (r.styledByCss.length) parts.push(this.t.importStyled(r.styledByCss.length));
    if (r.tooDeep) parts.push(this.t.importDeep(r.tooDeep));
    return parts.join(' ');
  }

  /**
   * A drawing the model wrote: it is opened as a file named after the description, so the cleaning, the question of a new document or an addition and the
   * notice are the ones a file has. What is not an SVG is a problem and changes nothing.
   */
  protected async described(w: { svg: string; description: string; model: string; provider: string }): Promise<void> {
    // Only a model of the routing is worth remembering: the model of an external provider is not installed here.
    if (!w.provider) rememberModel(w.model);
    const base = slug(w.description).slice(0, 40).replace(/-+$/, '') || 'drawing';
    await this.openFile(`${base}.svg`, w.svg);
  }

  /** The example, quietly and as the saved state: its first layer is selected and its properties are on show. */
  private startWithExample(): void {
    const opened = openText('example.svg', EXAMPLE_SVG, newDocument(), 'new');
    if ('problem' in opened) return;
    const doc = animateExample({ ...opened.doc, name: this.t.example });
    this.store.load(doc);
    const first = doc.nodes[0];
    if (first) this.store.select([first.id]);
  }

  /** Loads the example: a logo with its elements already animated, so Play shows something at once. */
  protected async loadExample(): Promise<void> {
    try {
      const opened = openText('example.svg', EXAMPLE_SVG, newDocument(), 'new');
      if ('problem' in opened) throw new Error(opened.problem);
      this.store.load(newDocument());
      this.store.adopt(animateExample({ ...opened.doc, name: this.t.example }));
      this.store.clearSelection();
      this.say(this.t.imported('example.svg'), false);
    } catch {
      this.say(this.t.exampleFailed, true);
    }
  }

  // — files out —

  protected save(): void {
    const file = `${fileBase(this.store.doc())}.vector.json`;
    this.download(file, toJson(this.store.doc()), 'application/json');
    this.store.markSaved();
    clearDraft();
    this.say(this.t.saved(file), false);
  }

  protected rename(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.store.apply((d) => ({ ...d, name: name.trim() === '' ? undefined : name }), 'name');
  }

  /** The part was approved or replaced: the document remembers its name, so the next send can replace it. */
  protected sent(name: string): void {
    this.store.apply((d) => ({ ...d, partName: name }));
  }

  protected say(text: string, problem = false): void {
    this.notice.set({ text, problem });
  }

  // — the keyboard —

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'o') {
      e.preventDefault();
      this.chooseFile();
    } else if (mod && key === 's') {
      e.preventDefault();
      this.save();
    } else if (mod && key === 'e') {
      e.preventDefault();
      this.exportOpen.update((o) => !o);
    } else if (mod && key === 'z' && !typing && !target?.closest('[data-testid="vector-canvas"]')) {
      e.preventDefault();
      if (e.shiftKey) this.store.redo();
      else this.store.undo();
    } else if (e.key === '?' && !typing && !mod) {
      e.preventDefault();
      this.helpOpen.set(true);
    }
  }
}
