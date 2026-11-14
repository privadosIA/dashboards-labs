import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, model, output } from '@angular/core';
import { moves, toAnimatedSvg, toPart, toSvg, type VectorDocument } from '@lab/vector-editor';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { BETWEEN_DOWNLOADS_MS, DOWNLOAD } from '../files/download';
import { fileBase, partNameOf } from '../files/names';

/** What Export gives: an animated SVG, a still SVG at the playhead, and the part's two files (disabled, with the reason, when the part would not move). */
@Component({
  selector: 'app-export-menu',
  templateUrl: './export-menu.html',
  styleUrl: './export-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportMenu {
  readonly doc = input.required<VectorDocument>();
  readonly playhead = input(0);
  readonly open = model(false);
  /** What was exported or why it could not be, for the page's notice. */
  readonly notice = output<string>();

  protected readonly t = textsFor(inject(LanguageService).lang).exporting;
  private readonly download = inject(DOWNLOAD);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The same rule `toPart` uses, without drawing the part: something changes over time, or there is a parameter. */
  protected readonly canPart = computed(() => moves(this.doc()) || this.doc().params.length > 0);

  /** The menu closes with Escape and with a click anywhere outside it. */
  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.open.set(false);
  }

  @HostListener('document:pointerdown', ['$event'])
  protected outside(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  protected animated(): void {
    const file = `${fileBase(this.doc())}.svg`;
    this.download(file, toAnimatedSvg(this.doc()), 'image/svg+xml');
    this.finish(file);
  }

  protected still(): void {
    const file = `${fileBase(this.doc())}-still.svg`;
    this.download(file, toSvg(this.doc(), this.playhead()), 'image/svg+xml');
    this.finish(file);
  }

  protected part(): void {
    const doc = this.doc();
    const made = toPart(doc, { name: partNameOf(doc), description: doc.name ?? '' });
    if ('problems' in made) {
      this.notice.emit(this.t.partProblem(made.problems.join(' ')));
      this.open.set(false);
      return;
    }
    this.download('manifest.json', made.manifest, 'application/json');
    setTimeout(() => this.download('part.html', made.fragment, 'text/html'), BETWEEN_DOWNLOADS_MS);
    this.finish('manifest.json, part.html');
  }

  private finish(files: string): void {
    this.open.set(false);
    this.notice.emit(this.t.done(files));
  }
}
