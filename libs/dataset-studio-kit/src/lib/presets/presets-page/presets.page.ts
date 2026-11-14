import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { PresetBrowser } from '../browser/preset-browser';
import { type ImportReport, PRESET_KINDS, type Preset, type PresetBundle } from '../model';
import { PROMPTS } from '../port';

/** The bundle of the person's own presets, as the import reads it: no ids, no dates of the store. */
export function ownBundle(presets: readonly Preset[]): PresetBundle {
  return {
    format: 'prompt-presets',
    version: 1,
    items: presets
      .filter((p) => p.own)
      .map((p) => ({ kind: p.kind, title: p.title, prompt: p.prompt, ...(p.negative ? { negative: p.negative } : {}), tags: p.tags, ...(p.engine ? { engine: p.engine } : {}), language: p.language, source: p.source, ...(p.source_id ? { source_id: p.source_id } : {}), licence: p.licence })),
  };
}

/**
 * The library as a page: the browser over every kind, a bundle file to import (every entry with its source and its licence, the ones without refused by index) and the person's own presets to export. Nothing is
 * inserted here: there is no brief on this page.
 */
@Component({
  selector: 'lab-presets-page',
  imports: [PresetBrowser],
  templateUrl: './presets.page.html',
  styleUrl: './presets.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresetsPage {
  private readonly port = inject(PROMPTS);
  protected readonly t = textsFor(inject(LanguageService).lang).presetsPage;

  protected readonly version = signal(0);
  protected readonly working = signal(false);
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly problem = signal('');
  protected readonly note = signal('');

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.report.set(null);
    this.problem.set('');
    this.working.set(true);
    try {
      let bundle: unknown;
      try {
        bundle = JSON.parse(await file.text());
      } catch {
        this.problem.set(this.t.notBundle);
        return;
      }
      const report = await firstValueFrom(this.port.importBundle(bundle));
      this.report.set(report);
      this.version.update((n) => n + 1);
    } catch (e) {
      this.problem.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.working.set(false);
    }
  }

  protected async exportOwn(): Promise<void> {
    this.note.set('');
    // the server lists at most 200 a call, newest first: ask for each kind on its own
    const lists = await Promise.all(PRESET_KINDS.map((kind) => firstValueFrom(this.port.list({ kind, limit: 200 }))));
    const bundle = ownBundle(lists.flatMap((l) => l.items));
    if (!bundle.items.length) {
      this.note.set(this.t.noOwn);
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-prompt-presets.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }
}
