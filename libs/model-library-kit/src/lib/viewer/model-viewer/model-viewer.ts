import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { type Subscription, firstValueFrom } from 'rxjs';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { LibraryFailed, type LibraryModel, MODEL_LIBRARY_PORT } from '../../port';
import { VIEWER_ENGINE } from '../engine-loader';
import { viewerColors } from '../theme-colors';
import type { ViewerEngine } from '../viewer-engine';

/** What the viewer opens: a model of the catalog, or just where to find it (a finished generation knows `<pack>/<name>` and the viewer reads the rest from the catalog). */
export interface ViewerData {
  readonly model?: LibraryModel;
  readonly pack: string;
  readonly name: string;
}

export type ViewerPhase = 'loading' | 'ready' | 'notServed' | 'unreadable' | 'noWebgl' | 'failed';

const STEP = 0.18;

/**
 * Shows one model in 3D: it reads the `.glb` through the library's port (with progress and cancel), draws it with three.js (loaded only now), lets the person turn it, zoom, reset the view, play its animations and see its wireframe,
 * and lists what is known of it. A server that does not serve the file, a file that cannot be read and a browser with no WebGL leave the model's picture where the 3D view would be, with the reason in words. Closing it cancels the
 * download and frees the renderer.
 */
@Component({
  selector: 'lab-model-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './model-viewer.html',
  styleUrl: './model-viewer.scss',
})
export class ModelViewerDialog {
  protected readonly data = inject<ViewerData>(MAT_DIALOG_DATA);
  private readonly port = inject(MODEL_LIBRARY_PORT);
  private readonly loadEngine = inject(VIEWER_ENGINE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.viewer;
  protected readonly c = this.texts.catalog;

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly model = signal<LibraryModel | undefined>(this.data.model);
  protected readonly phase = signal<ViewerPhase>('loading');
  protected readonly why = signal('');
  protected readonly progress = signal<{ loaded: number; total: number | null }>({ loaded: 0, total: null });
  protected readonly fileBytes = signal(0);
  protected readonly clips = signal<readonly string[]>([]);
  protected readonly clip = signal('');
  protected readonly playing = signal(false);
  protected readonly wire = signal(false);
  protected readonly triangles = signal<number | null>(null);
  protected readonly picture = signal('');
  /** The model names pictures in other files, which the server does not serve with it: the viewer draws it without them and says so. */
  protected readonly pictureless = computed(() => this.phase() === 'ready' && (this.model()?.needs.length ?? 0) > 0);
  protected readonly title = computed(() => this.t.title(this.data.name));
  protected readonly note = computed(() => {
    switch (this.phase()) {
      case 'notServed':
        return this.t.notServed;
      case 'unreadable':
        return this.t.unreadable(this.why());
      case 'noWebgl':
        return this.t.noWebgl;
      case 'failed':
        return this.t.failed(this.why());
      default:
        return '';
    }
  });
  /** The first of the two numbers the progress says, as a size; `null` while the server has not said the size. */
  protected readonly percent = computed(() => {
    const { loaded, total } = this.progress();
    return total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  });
  protected readonly sizeText = (bytes: number): string => this.texts.packs.size(bytes);

  private engine?: ViewerEngine;
  private download?: Subscription;
  private frameId = 0;
  private last = 0;
  private observer?: MutationObserver;
  private resizer?: ResizeObserver;
  private thumbnailUrl = '';
  private gone = false;

  constructor() {
    afterNextRender(() => this.start());
    this.destroyRef.onDestroy(() => this.stop());
  }

  protected retry(): void {
    this.stop(false);
    this.phase.set('loading');
    this.why.set('');
    this.progress.set({ loaded: 0, total: null });
    this.start();
  }

  private start(): void {
    void this.loadPicture();
    void this.loadModel();
    this.load();
  }

  /** The model's own record, when the opener only knew where it is. */
  private async loadModel(): Promise<void> {
    if (this.model()) return;
    try {
      const page = await firstValueFrom(this.port.catalog({ pack: this.data.pack, q: this.data.name, limit: 24 }));
      this.model.set(page.models.find((m) => m.pack === this.data.pack && m.name === this.data.name));
      this.triangles.set(this.model()?.triangles ?? null);
    } catch {
      // the information stays as the file gives it
    }
  }

  private async loadPicture(): Promise<void> {
    if (this.thumbnailUrl) return;
    try {
      const blob = await firstValueFrom(this.port.thumbnail(this.data.pack, this.data.name));
      if (this.gone) return;
      this.thumbnailUrl = URL.createObjectURL(blob);
      this.picture.set(this.thumbnailUrl);
    } catch {
      // a model with no picture shows the words only
    }
  }

  private load(): void {
    this.download = this.port.file(this.data.pack, this.data.name).subscribe({
      next: (step) => {
        this.progress.set({ loaded: step.loaded, total: step.total });
        if (step.bytes) void this.show(step.bytes);
      },
      error: (e: unknown) => {
        if (e instanceof LibraryFailed && e.status === 404) this.phase.set('notServed');
        else {
          this.why.set(e instanceof Error ? e.message : String(e));
          this.phase.set('failed');
        }
      },
    });
  }

  private async show(bytes: ArrayBuffer): Promise<void> {
    this.fileBytes.set(bytes.byteLength);
    const mod = await this.loadEngine();
    if (this.gone) return;
    // a retry shows the loading state again and the bytes can come before the canvas is drawn: wait for the view
    if (!this.canvas()) await new Promise<void>((done) => afterNextRender(() => done(), { injector: this.injector }));
    if (this.gone) return;
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !mod.webglAvailable()) {
      this.phase.set('noWebgl');
      return;
    }
    try {
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      this.engine = new mod.ViewerEngine({ canvas, colors: viewerColors(this.host.nativeElement), reducedMotion: reduced });
      const stats = await this.engine.load(bytes);
      if (this.gone) return;
      this.triangles.set(stats.triangles);
      this.clips.set(stats.clips);
      this.clip.set(this.engine.clipName);
      this.phase.set('ready');
      this.watch();
      this.fit();
      this.last = performance.now();
      this.frameId = requestAnimationFrame(this.tick);
    } catch (e) {
      this.engine?.dispose();
      this.engine = undefined;
      if (this.gone) return;
      this.why.set(e instanceof Error ? e.message : String(e));
      this.phase.set('unreadable');
    }
  }

  private readonly tick = (now: number): void => {
    const seconds = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.engine?.frame(seconds);
    this.frameId = requestAnimationFrame(this.tick);
  };

  /** Keeps the drawing the size of its place and the colours those of the theme. */
  private watch(): void {
    const stage = this.stage()?.nativeElement;
    if (stage && typeof ResizeObserver !== 'undefined') {
      this.resizer = new ResizeObserver(() => this.fit());
      this.resizer.observe(stage);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => this.engine?.setColors(viewerColors(this.host.nativeElement)));
      this.observer.observe(document.documentElement, { attributes: true });
    }
  }

  private fit(): void {
    const stage = this.stage()?.nativeElement;
    if (stage) this.engine?.resize(stage.clientWidth, stage.clientHeight);
  }

  protected togglePlay(): void {
    if (!this.engine) return;
    if (this.playing()) this.engine.pause();
    else this.engine.play();
    this.playing.set(this.engine.isPlaying);
  }

  protected choose(name: string): void {
    this.engine?.choose(name);
    this.clip.set(this.engine?.clipName ?? '');
    this.playing.set(this.engine?.isPlaying ?? false);
  }

  protected toggleWire(): void {
    this.engine?.setWireframe(!this.wire());
    this.wire.set(this.engine?.wireframe ?? false);
  }

  protected reset(): void {
    this.engine?.resetView();
  }

  protected key(event: KeyboardEvent): void {
    const engine = this.engine;
    if (!engine) return;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => engine.orbit(-STEP, 0),
      ArrowRight: () => engine.orbit(STEP, 0),
      ArrowUp: () => engine.orbit(0, -STEP),
      ArrowDown: () => engine.orbit(0, STEP),
      '+': () => engine.zoom(0.15),
      '=': () => engine.zoom(0.15),
      '-': () => engine.zoom(-0.15),
      '0': () => engine.resetView(),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  }

  private stop(final = true): void {
    if (final) this.gone = true;
    this.download?.unsubscribe();
    this.download = undefined;
    cancelAnimationFrame(this.frameId);
    this.observer?.disconnect();
    this.resizer?.disconnect();
    this.observer = undefined;
    this.resizer = undefined;
    this.engine?.dispose();
    this.engine = undefined;
    this.clips.set([]);
    this.playing.set(false);
    this.wire.set(false);
    if (final && this.thumbnailUrl) URL.revokeObjectURL(this.thumbnailUrl);
  }
}
