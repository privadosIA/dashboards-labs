import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { RetouchDialog } from '../../retouch-dialog/retouch.dialog';
import { InfoTip } from '../../shared/info-tip/info-tip';
import { blobToDataUrl, dataUrlToBlob } from '../../shared/data-url';
import type { InputLimit, ModelInputs, ReferenceFile, References, StartImage } from '../../video/model';

type Kind = 'images' | 'videos' | 'audios';

const ACCEPT: Record<Kind, string> = { images: 'image/*', videos: 'video/*', audios: 'audio/*' };

/** How long a video or an audio is, when the browser can read it; undefined when it cannot (the server then decides). */
export function readSeconds(file: File, kind: 'video' | 'audio'): Promise<number | undefined> {
  return new Promise((resolve) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (seconds?: number): void => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    element.preload = 'metadata';
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : undefined);
    element.onerror = () => done(undefined);
    element.src = url;
  });
}

/** The reference images, videos and audios of a clip, with the limits of the chosen model: it only holds the files; the panel decides what they mean. */
@Component({
  selector: 'app-references',
  templateUrl: './references.html',
  styleUrl: './references.scss',
  imports: [InfoTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferencesList {
  readonly references = model.required<References>();
  /** What the chosen model takes; a kind it gives no limit for is not drawn. */
  readonly limits = input.required<ModelInputs>();

  private readonly dialog = inject(MatDialog);
  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly error = signal('');
  protected readonly dragging = signal(false);

  protected readonly kinds = computed(() => {
    const l = this.limits();
    const all: { kind: Kind; title: string; limit: InputLimit | undefined; accept: string }[] = [
      { kind: 'images', title: this.t.inputs.images, limit: l.referenceImages, accept: ACCEPT.images },
      { kind: 'videos', title: this.t.inputs.videos, limit: l.referenceVideos, accept: ACCEPT.videos },
      { kind: 'audios', title: this.t.inputs.audios, limit: l.referenceAudios, accept: ACCEPT.audios },
    ];
    return all.filter((k) => k.limit && k.limit.max > 0).map((k) => ({ ...k, limit: k.limit as InputLimit }));
  });

  protected files(kind: Kind): readonly ReferenceFile[] {
    return this.references()[kind];
  }

  /** Every chosen file in one list: the images first (their order is what the prompt names), then the videos and the audios. */
  protected readonly entries = computed(() => {
    const refs = this.references();
    return (['images', 'videos', 'audios'] as const).flatMap((kind) => refs[kind].map((file, index) => ({ kind, index, file })));
  });

  /** What the one picker takes: the kinds the model has a limit for. */
  protected readonly accept = computed(() => this.kinds().map((k) => k.accept).join(','));

  protected count(kind: Kind, limit: InputLimit): string {
    return this.t.inputs.count.replace('{n}', String(this.files(kind).length)).replace('{max}', String(limit.max));
  }

  protected full(kind: Kind, limit: InputLimit): boolean {
    return this.files(kind).length >= limit.max;
  }

  /** Nothing more can be added: every kind the model takes is at its maximum. */
  protected readonly allFull = computed(() => this.kinds().every((k) => this.full(k.kind, k.limit)));

  protected limitNote(limit: InputLimit): string {
    return limit.maxSeconds === undefined ? '' : this.t.inputs.maxSeconds.replace('{n}', String(limit.maxSeconds));
  }

  protected maxNote(limit: InputLimit): string {
    return this.t.inputs.maxReached.replace('{max}', String(limit.max));
  }

  private readonly urls = new WeakMap<Blob, string>();

  /** The address of a chosen file's preview, made once per file (it is read on every change detection). */
  protected url(file: ReferenceFile): string {
    let url = this.urls.get(file.blob);
    if (!url) this.urls.set(file.blob, (url = URL.createObjectURL(file.blob)));
    return url;
  }

  /** The kind a file belongs to by its type; the server gets each kind in its own part, so the list sorts them. */
  private kindOf(file: File): Kind | undefined {
    return file.type.startsWith('image/') ? 'images' : file.type.startsWith('video/') ? 'videos' : file.type.startsWith('audio/') ? 'audios' : undefined;
  }

  protected add(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    return this.addFiles(chosen);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.allFull()) this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    return this.allFull() ? Promise.resolve() : this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private async addFiles(chosen: File[]): Promise<void> {
    this.error.set('');
    const next: Record<Kind, ReferenceFile[]> = { images: [...this.files('images')], videos: [...this.files('videos')], audios: [...this.files('audios')] };
    for (const file of chosen) {
      const kind = this.kindOf(file);
      const limit = this.kinds().find((k) => k.kind === kind)?.limit;
      if (!kind || !limit) {
        this.error.set(this.t.inputs.wrongType.replace('{name}', file.name));
        continue;
      }
      if (next[kind].length >= limit.max) {
        this.error.set(this.maxNote(limit));
        continue;
      }
      const seconds = kind === 'images' ? undefined : await readSeconds(file, kind === 'videos' ? 'video' : 'audio');
      if (seconds !== undefined && limit.maxSeconds !== undefined && seconds > limit.maxSeconds) {
        this.error.set(this.t.inputs.tooLong.replace('{name}', file.name).replace('{n}', String(limit.maxSeconds)));
        continue;
      }
      next[kind].push({ name: file.name, blob: file, ...(seconds !== undefined ? { seconds } : {}) });
    }
    this.references.set({ ...this.references(), ...next });
  }

  /** Opens the retouch for a reference image; the variant chosen there takes its place, and cancelling leaves it as it was. */
  protected async retouch(index: number): Promise<void> {
    const file = this.files('images')[index];
    if (!file) return;
    const data: StartImage = { name: file.name, dataUrl: await blobToDataUrl(file.blob) };
    this.dialog
      .open<RetouchDialog, StartImage, StartImage>(RetouchDialog, { data, width: '46rem', maxWidth: '95vw', panelClass: 'studio-kit' })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        const next = [...this.files('images')];
        next[index] = { name: result.name, blob: dataUrlToBlob(result.dataUrl) };
        this.references.set({ ...this.references(), images: next });
      });
  }

  protected remove(kind: Kind, index: number): void {
    this.error.set('');
    this.references.set({ ...this.references(), [kind]: this.files(kind).filter((_, i) => i !== index) });
  }

  protected move(kind: Kind, index: number, by: -1 | 1): void {
    const next = [...this.files(kind)];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    this.references.set({ ...this.references(), [kind]: next });
  }
}
