import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ANIMATION } from '@lab/animation-core';
import { type AnimationDataset, type ImportPlan, planAnimationImport, readCurrentState, validateAnimationDataset } from '@lab/animation-dataset';
import { DATASET_PORT, DatasetFailed, type DatasetPreview as ServerPreview } from '@lab/dataset-import';
import { catchError, debounce, defer, from, map, of, startWith, switchMap, timer } from 'rxjs';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { type KindDef, isTupleKind } from '../kinds/kinds';
import { type Marker, parseText, writeText } from '../generate/markers';
import { type Tuple } from '../generate/tuples';
import { type ReportRow, reportRows } from './report';
import { NO_STATUS, type PreviewStatus } from './status';

interface Row {
  /** The entry as a tuple when it reads as one; null for a line the parser cannot read. */
  readonly tuple: Tuple | null;
  readonly text: string;
  readonly prompt: string;
  readonly markers: readonly Marker[];
}

type Server =
  | { readonly state: 'idle' }
  | { readonly state: 'busy' }
  | { readonly state: 'tuples'; readonly preview: ServerPreview; readonly rows: readonly ReportRow[] }
  | { readonly state: 'piece'; readonly dataset: AnimationDataset; readonly plan: ImportPlan }
  | { readonly state: 'failed'; readonly reason: string; readonly problems: readonly string[] };

const isTuple = (e: unknown): e is Tuple => Array.isArray(e) && e.length >= 4 && e.slice(0, 4).every((x) => typeof x === 'string');

/**
 * The dataset as the person will create it: the entries as a table with their markers read into columns, the raw file as text, each editable and kept in step (a line that cannot be read stays as it is and is marked),
 * and below them what the server made of it (its own report and counts, again after every edit) or, for the animated piece, the validator's problems and what importing it would do. Nothing is created here.
 */
@Component({
  selector: 'lab-dataset-preview',
  templateUrl: './dataset-preview.html',
  styleUrl: './dataset-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetPreview {
  private readonly port = inject(DATASET_PORT);
  private readonly animation = inject(ANIMATION);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).preview;

  readonly kind = input.required<KindDef>();
  /** The dataset as text: the tuples as JSON, or the piece's JSON (two-way). */
  readonly raw = model('');
  /** How long the server waits for the person to stop typing before it reads again. */
  readonly debounceMs = input(500);
  /** What the preview knows now, each time it changes. */
  readonly status = output<PreviewStatus>();

  protected readonly tupleKind = computed(() => isTupleKind(this.kind()));
  private readonly order = computed<'markers-first' | 'prompt-first'>(() => (this.kind().mode === 'music' ? 'prompt-first' : 'markers-first'));

  /** The raw text read as a JSON list, entry by entry; or why it is not one. */
  protected readonly list = computed<{ ok: true; items: unknown[] } | { ok: false; error: string }>(() => {
    const raw = this.raw().trim();
    if (!raw) return { ok: true, items: [] };
    try {
      const data: unknown = JSON.parse(raw);
      return Array.isArray(data) ? { ok: true, items: data } : { ok: false, error: this.t.unreadable('not a list') };
    } catch (e) {
      return { ok: false, error: this.t.unreadable(e instanceof Error ? e.message : String(e)) };
    }
  });

  protected readonly rows = computed<Row[]>(() => {
    const l = this.list();
    if (!l.ok) return [];
    return l.items.map((e) => {
      if (!isTuple(e)) return { tuple: null, text: JSON.stringify(e), prompt: '', markers: [] };
      const parsed = parseText(e[3]);
      return { tuple: [e[0], e[1], e[2], e[3]] as Tuple, text: e[3], prompt: parsed.prompt, markers: parsed.markers };
    });
  });

  /** The columns of the table: the kind's markers, with `Param <name>` shown together in one. */
  protected readonly columns = computed(() => this.kind().markers.filter((m) => m !== 'Param'));
  protected readonly hasParams = computed(() => this.kind().markers.includes('Param'));

  private readonly result = toSignal(
    toObservable(computed(() => ({ kind: this.kind(), raw: this.raw() }))).pipe(
      debounce(() => timer(this.debounceMs())),
      switchMap(({ kind, raw }): ReturnType<DatasetPreview['read']> => this.read(kind, raw)),
    ),
    { initialValue: { state: 'idle' } as Server },
  );
  protected readonly server = computed(() => this.result());

  protected readonly rejectedById = computed(() => {
    const s = this.server();
    return s.state === 'tuples' ? new Map(s.rows.filter((r) => r.rejected).map((r) => [r.id, r.rejected as string])) : new Map<string, string>();
  });
  protected readonly problems = computed(() => {
    const s = this.server();
    return s.state === 'failed' ? s.problems : [];
  });

  constructor() {
    effect(() => {
      const s = this.server();
      const list = this.list();
      const busy = s.state === 'busy' || (this.raw().trim() !== '' && s.state === 'idle');
      const readable = !this.tupleKind() || list.ok;
      untracked(() => this.status.emit(this.statusOf(s, readable, busy)));
    });
  }

  private statusOf(s: Server, readable: boolean, busy: boolean): PreviewStatus {
    if (!readable) return { ...NO_STATUS, problem: this.t.unreadable('') };
    switch (s.state) {
      case 'tuples':
        return { ...NO_STATUS, valid: s.preview.imported > 0, entries: s.preview.entries, imported: s.preview.imported, rejected: s.preview.rejected, yaml: s.preview.yaml };
      case 'piece':
        return { ...NO_STATUS, valid: true, entries: 1, imported: 1, dataset: s.dataset, plan: s.plan };
      case 'failed':
        return { ...NO_STATUS, problem: s.reason };
      default:
        return { ...NO_STATUS, busy };
    }
  }

  private read(kind: KindDef, raw: string) {
    if (!raw.trim()) return of<Server>({ state: 'idle' });
    if (!isTupleKind(kind)) {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (e) {
        return of<Server>({ state: 'failed', reason: this.t.unreadable(e instanceof Error ? e.message : String(e)), problems: [] });
      }
      const check = validateAnimationDataset(json, this.lang);
      if (!check.ok) return of<Server>({ state: 'failed', reason: this.t.problems, problems: check.problems });
      return from(readCurrentState(this.animation, check.dataset)).pipe(
        map((current): Server => ({ state: 'piece', dataset: check.dataset, plan: planAnimationImport(check.dataset, current) })),
        catchError((e: unknown) => of<Server>({ state: 'failed', reason: this.t.previewFailed(e instanceof Error ? e.message : String(e)), problems: [] })),
        startWith<Server>({ state: 'busy' }),
      );
    }
    // A file that is not a JSON list is not sent: the table pane already says why it cannot be read.
    try {
      if (!Array.isArray(JSON.parse(raw))) return of<Server>({ state: 'idle' });
    } catch {
      return of<Server>({ state: 'idle' });
    }
    return defer(() => this.port.preview(raw, kind.mode as 'video' | 'motion' | 'music', kind.images ? { outputMode: 'images' } : undefined)).pipe(
      map((preview): Server => ({ state: 'tuples', preview, rows: reportRows(preview.report) })),
      catchError((e: unknown) => of<Server>({ state: 'failed', reason: this.t.previewFailed(e instanceof DatasetFailed ? e.detail || e.kind : e instanceof Error ? e.message : String(e)), problems: [] })),
      startWith<Server>({ state: 'busy' }),
    );
  }

  /** The value of the first marker of a row with that name. */
  protected cell(row: Row, name: string): string {
    return row.markers.find((m) => m.name === name)?.value ?? '';
  }

  protected params(row: Row): string {
    return row.markers
      .filter((m) => m.name.startsWith('Param '))
      .map((m) => `${m.name.slice(6)}=${m.value}`)
      .join(', ');
  }

  private replace(index: number, tuple: Tuple): void {
    const l = this.list();
    if (!l.ok) return;
    const next = [...l.items];
    next[index] = tuple;
    this.raw.set(JSON.stringify(next, null, 2));
  }

  protected editId(index: number, row: Row, value: string): void {
    if (row.tuple) this.replace(index, [value, row.tuple[1], row.tuple[2], row.tuple[3]]);
  }

  protected editTitle(index: number, row: Row, value: string): void {
    if (row.tuple) this.replace(index, [row.tuple[0], value, row.tuple[2], row.tuple[3]]);
  }

  protected editText(index: number, row: Row, value: string): void {
    if (row.tuple) this.replace(index, [row.tuple[0], row.tuple[1], row.tuple[2], writeText(value, row.markers, this.order())]);
  }

  protected editMarker(index: number, row: Row, name: string, value: string): void {
    if (!row.tuple) return;
    const has = row.markers.some((m) => m.name === name);
    const markers = has ? row.markers.map((m) => (m.name === name ? { name, value } : m)).filter((m) => m.value.trim() !== '' || m.name === 'Instrumental') : value.trim() ? [...row.markers, { name, value }] : [...row.markers];
    this.replace(index, [row.tuple[0], row.tuple[1], row.tuple[2], writeText(row.prompt, markers, this.order())]);
  }

  protected onRaw(event: Event): void {
    this.raw.set((event.target as HTMLTextAreaElement).value);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
