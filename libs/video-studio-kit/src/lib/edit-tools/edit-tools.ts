import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { blobToDataUrl } from '../shared/data-url';
import type { EditToolInfo } from '../video-edit/model';
import { MotionLibraryDialog } from '../motion-library-dialog/motion-library.dialog';
import { VIDEO_EDIT } from '../video-edit/tokens';
import type { StartImage } from '../video/model';
import { MAX_IMAGE_BYTES } from '../create-panel/start-image/start-image';
import { EDIT_TOOLS, VIDEO_TOOLS, type EditTool } from './registry';
import { VideoToolDialog } from './video-tool-dialog/video-tool.dialog';

/** A video tool of the server with the look the registry gives it. */
interface VideoRow {
  info: EditToolInfo;
  icon: string;
  name: string;
  hint: string;
}

/**
 * The Edit tab: the tools of the registry, each a row, and under them the video tools the server lists (the ones the
 * registry knows, in the server's order; one that cannot run is shown disabled with its reason). A tool that needs an
 * image asks for it with a file chooser.
 */
@Component({
  selector: 'app-edit-tools',
  templateUrl: './edit-tools.html',
  styleUrl: './edit-tools.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditTools {
  /** An image a tool made, to be the start image of the Create tab. */
  readonly startImage = output<StartImage>();

  private readonly dialog = inject(MatDialog);
  private readonly videoEdit = inject(VIDEO_EDIT);
  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly tools: readonly EditTool[] = EDIT_TOOLS;
  protected readonly error = signal('');
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');

  /** Whether the server's tools are being read, were read, or could not be (the image tools work either way). */
  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly listed = signal<readonly EditToolInfo[]>([]);
  protected readonly videoRows = computed<readonly VideoRow[]>(() =>
    this.listed().flatMap((info) => {
      const entry = VIDEO_TOOLS[info.id];
      return entry ? [{ info, icon: entry.icon, name: entry.name(this.t), hint: info.available ? entry.hint(this.t) : (info.reason ?? entry.hint(this.t)) }] : [];
    }),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.status.set('loading');
    this.videoEdit.tools().subscribe({
      next: (tools) => {
        this.listed.set(tools);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  /** Opens the chooser and resolves with the image once the file is read; null when nothing valid was chosen. */
  private pick(): Promise<StartImage | null> {
    return new Promise((resolve) => {
      const input = this.file().nativeElement;
      input.onchange = async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return resolve(null);
        if (!file.type.startsWith('image/')) return resolve(this.refuse(this.t.panel.notAnImage));
        if (file.size > MAX_IMAGE_BYTES) return resolve(this.refuse(this.t.panel.imageTooBig));
        this.error.set('');
        resolve({ name: file.name, dataUrl: await blobToDataUrl(file) });
      };
      input.click();
    });
  }

  private refuse(message: string): null {
    this.error.set(message);
    return null;
  }

  protected run(tool: EditTool): void {
    void tool.run({ dialog: this.dialog, pickImage: () => this.pick(), useAsStartImage: (image) => this.startImage.emit(image) });
  }

  protected openLibrary(): void {
    this.dialog.open(MotionLibraryDialog, { width: '40rem', maxWidth: '95vw', panelClass: 'studio-kit' });
  }

  protected runVideo(row: VideoRow): void {
    if (!row.info.available) return;
    this.dialog.open<VideoToolDialog, EditToolInfo>(VideoToolDialog, { data: row.info, width: '34rem', maxWidth: '95vw', panelClass: 'studio-kit' });
  }
}
