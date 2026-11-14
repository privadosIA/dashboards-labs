import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { Motion } from '../../motions/model';
import { MotionCards } from '../../motions/motion-cards/motion-cards';
import { MotionLibraryDialog } from '../../motion-library-dialog/motion-library.dialog';
import { MOTION_LIBRARY } from '../../motions/tokens';
import type { EditToolInfo, InputFile, VideoEdit, VideoEditRequest } from '../../video-edit/model';
import { VIDEO_EDIT } from '../../video-edit/tokens';
import { VIDEO_TOOLS } from '../registry';
import { settingsSchema } from './schemas';

type FormModel = Record<string, unknown>;

const VIDEO_FILE = /\.(mp4|mov|webm|mkv)$/i;
const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

/** The settings the form holds, as the request wants them: only the tool's own, and none that were left empty. */
export function toSettings(tool: EditToolInfo, model: FormModel): VideoEditRequest['settings'] {
  const settings: VideoEditRequest['settings'] = {};
  for (const spec of tool.settings) {
    const value = model[spec.name];
    if (value === undefined || value === null || value === '') continue;
    settings[spec.name] = value as string | number | boolean;
  }
  return settings;
}

/**
 * What a tool asks before editing: the video (or, for a tool that takes one, a motion of the library), the reference
 * image when the tool needs one, and the tool's settings. Generating sends it and closes; the history follows it.
 */
@Component({
  selector: 'app-video-tool-dialog',
  templateUrl: './video-tool.dialog.html',
  styleUrl: './video-tool.dialog.scss',
  imports: [DynamicFormComponent, MatTooltip, MotionCards],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoToolDialog {
  protected readonly tool = inject<EditToolInfo>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<VideoToolDialog, VideoEdit>>(MatDialogRef);
  private readonly port = inject(VIDEO_EDIT);
  private readonly dialog = inject(MatDialog);
  /** Only a tool that takes a motion needs the library. */
  private readonly library = this.tool.acceptsMotion ? inject(MOTION_LIBRARY) : null;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly tickets = inject(TicketService);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  protected readonly title = computed(() => VIDEO_TOOLS[this.tool.id]?.name(this.t) ?? this.tool.name);
  /** The page's own text for the tool (like the list); the server's only when the tool has no entry here. */
  protected readonly description = computed(() => VIDEO_TOOLS[this.tool.id]?.hint(this.t) ?? this.tool.description);
  protected readonly warnings = computed(() => this.t.videoTools.warnings[this.tool.id] ?? []);
  protected readonly schema = settingsSchema(this.tool.id, this.lang);
  /** The server's defaults for the settings, so the form starts where the server would. */
  protected readonly model = signal<FormModel>(Object.fromEntries(this.tool.settings.filter((s) => s.default !== undefined).map((s) => [s.name, s.default])));
  protected readonly video = signal<InputFile | null>(null);
  protected readonly image = signal<InputFile | null>(null);
  protected readonly working = signal(false);
  protected readonly error = signal('');
  private readonly videoFile = viewChild.required<ElementRef<HTMLInputElement>>('file');
  private readonly imageFile = viewChild<ElementRef<HTMLInputElement>>('imageFile');
  private readonly startVideo = viewChild<ElementRef<HTMLVideoElement>>('startVideo');

  /** The library: what it holds, whether it could be read, and the motion chosen instead of a video. */
  protected readonly motions = signal<readonly Motion[]>([]);
  protected readonly motionsStatus = signal<'loading' | 'ready' | 'error'>(this.library ? 'loading' : 'ready');
  protected readonly motionId = signal<string | null>(null);
  /** Seconds a motion must leave from where it starts: the server uses 2 of them. */
  protected readonly taken = 2;
  protected readonly chosenMotion = computed(() => this.motions().find((m) => m.id === this.motionId()) ?? null);
  /** The last second a motion can start at, so that the 2 seconds taken are inside it. */
  protected readonly startMax = computed(() => Math.max(0, Math.round(((this.chosenMotion()?.duration ?? 0) - this.taken) * 10) / 10));
  protected readonly start = computed(() => Math.min(Number(this.model()['start'] ?? 0) || 0, this.startMax()));
  protected readonly startTakes = computed(() =>
    this.t.motionLibrary.startTakes.replace('{from}', String(this.start())).replace('{to}', String(Math.round((this.start() + this.taken) * 10) / 10)),
  );

  constructor() {
    this.library
      ?.list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.motions.set(list);
          this.motionsStatus.set('ready');
        },
        error: () => this.motionsStatus.set('error'),
      });
  }

  protected chooseVideo(): void {
    this.videoFile().nativeElement.click();
  }

  protected picked(): void {
    const input = this.videoFile().nativeElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/') && !VIDEO_FILE.test(file.name)) {
      this.video.set(null);
      this.error.set(this.t.videoTools.dialog.notAVideo);
      return;
    }
    this.error.set('');
    this.video.set({ name: file.name, blob: file });
    this.selectMotion(null); // a video or a motion, never both
  }

  protected chooseImage(): void {
    this.imageFile()?.nativeElement.click();
  }

  protected pickedImage(): void {
    const input = this.imageFile()?.nativeElement;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !IMAGE_FILE.test(file.name)) {
      this.image.set(null);
      this.error.set(this.t.panel.notAnImage);
      return;
    }
    this.error.set('');
    this.image.set({ name: file.name, blob: file });
  }

  /** Chooses a ready motion (or none, with null): it replaces the video and starts at its beginning. */
  protected selectMotion(id: string | null): void {
    if (id !== null && this.motions().find((m) => m.id === id)?.state !== 'ready') return;
    this.motionId.set(id);
    if (id !== null) this.video.set(null); // a video or a motion, never both
    this.model.update((m) => ({ ...m, motion: id ?? '', start: 0 }));
  }

  /** Moves where the motion starts and shows that second on its preview. */
  protected moveStart(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.model.update((m) => ({ ...m, start: value }));
    const video = this.startVideo()?.nativeElement;
    if (video) video.currentTime = value;
  }

  protected openLibrary(): void {
    this.dialog.open(MotionLibraryDialog, { width: '40rem', maxWidth: '95vw', panelClass: 'studio-kit' });
  }

  protected generate(): void {
    const video = this.video();
    const motion = this.motionId();
    const image = this.image();
    if (this.working()) return;
    const text = this.t.videoTools.dialog;
    if (!video && !motion) return this.fail(text.videoRequired);
    if (this.tool.needsImage && !image) return this.fail(text.imageRequired);
    const settings = toSettings(this.tool, this.model());
    if (!motion && settings) delete settings['start']; // only a motion has a second to start from
    const blank = this.tool.settings.find((s) => s.required && (settings?.[s.name] === undefined || String(settings[s.name]).trim() === ''));
    if (blank) return this.fail(text.settingRequired.replace('{name}', blank.name));
    this.working.set(true);
    this.error.set('');
    const request: VideoEditRequest = {
      tool: this.tool.id,
      settings,
      ...(video ? { video } : {}),
      ...(motion ? { motion } : {}),
      ...(this.tool.needsImage && image ? { image } : {}),
    };
    this.port.create(request).subscribe({
      next: (edit) => this.ref.close(edit),
      error: (e: unknown) => {
        this.error.set(`${text.failed} ${e instanceof Error ? e.message : String(e)}`);
        this.working.set(false);
      },
    });
  }

  private fail(message: string): void {
    this.error.set(message);
  }

  protected cancel(): void {
    this.ref.close();
  }
}
