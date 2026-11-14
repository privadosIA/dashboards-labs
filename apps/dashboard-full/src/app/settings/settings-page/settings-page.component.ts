import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { ApiErrorBody, BrowserSettings, DiffRhythm2Settings, HeartMulaSettings, MotionModelSettings, OllamaSettings, OllamaTestResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { MotionModelCardComponent } from '../motion-model-card/motion-model-card.component';
import { DiffRhythm2CardComponent } from '../diffrhythm2-card/diffrhythm2-card.component';
import { HeartMulaCardComponent } from '../heartmula-card/heartmula-card.component';
import { MonitoringCardComponent } from '../monitoring-card/monitoring-card.component';
import { DatabaseCardComponent } from '../database-card/database-card.component';
import { BrowserCardComponent } from '../browser-card/browser-card.component';
import { ProvidersCardComponent } from '../providers-card/providers-card.component';
import { TasksCardComponent } from '../tasks-card/tasks-card.component';
import { AvailabilityStore } from '../../core/availability.store';

/**
 * The server's settings. For now: the address of Ollama, which the prompt
 * assistant, "describe a reference" and the quality check use. The address in
 * use and where it comes from are always shown; the typed one can be tested
 * before it is saved, and a saved one takes effect without a restart. The
 * server owns the rules (valid address, whether it is another machine), so
 * nothing is checked here.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, PageHeaderComponent, DatabaseCardComponent, MonitoringCardComponent, BrowserCardComponent, HeartMulaCardComponent, DiffRhythm2CardComponent, MotionModelCardComponent, ProvidersCardComponent, TasksCardComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly availability = inject(AvailabilityStore);

  protected readonly ollama = signal<OllamaSettings | null>(null);
  protected readonly browser = signal<BrowserSettings | null>(null);
  protected readonly heartmula = signal<HeartMulaSettings | null>(null);
  protected readonly diffrhythm2 = signal<DiffRhythm2Settings | null>(null);
  protected readonly motionModel = signal<MotionModelSettings | null>(null);
  protected readonly input = signal('');
  protected readonly test = signal<OllamaTestResult | null>(null);
  protected readonly testing = signal(false);
  protected readonly saving = signal(false);
  /** The server's reason for refusing the typed address. */
  protected readonly error = signal<string | null>(null);
  protected readonly loadFailed = signal(false);
  /** Bumped when the providers change, so the Tasks card re-reads its options. */
  protected readonly providersVersion = signal(0);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.getSettings());
      this.ollama.set(res.ollama);
      this.input.set(res.ollama.saved);
      this.browser.set(res.browser ?? null);
      this.heartmula.set(res.heartmula ?? null);
      this.diffrhythm2.set(res.diffrhythm2 ?? null);
      this.motionModel.set(res.motion_model ?? null);
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected sourceLabel(source: OllamaSettings['source']): string {
    switch (source) {
      case 'setting':
        return $localize`:@@settings.sourceSetting:setting saved here`;
      case 'env':
        return $localize`:@@settings.sourceEnv:OLLAMA_HOST variable`;
      default:
        return $localize`:@@settings.sourceDefault:default`;
    }
  }

  /** The warning applies to the address in use and to the one just tested. */
  protected remote(): boolean {
    return !!this.ollama()?.remote || !!this.test()?.remote;
  }

  protected edit(value: string): void {
    this.input.set(value);
    this.error.set(null);
  }

  protected async runTest(): Promise<void> {
    this.testing.set(true);
    this.error.set(null);
    this.test.set(null);
    try {
      this.test.set(await firstValueFrom(this.api.testOllama(this.input().trim() || undefined)));
    } catch (err) {
      this.error.set(reason(err));
    } finally {
      this.testing.set(false);
    }
  }

  protected async save(): Promise<void> {
    await this.put(this.input().trim());
  }

  /** Removes the saved address: the environment's (or the default) is used again. */
  protected async useEnvironment(): Promise<void> {
    await this.put('');
  }

  private async put(value: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.putOllamaHost(value));
      this.ollama.set(res.ollama);
      this.input.set(res.ollama.saved);
      this.test.set(null);
      void this.availability.refresh(); // the models of the new address decide which controls show
    } catch (err) {
      this.error.set(reason(err));
    } finally {
      this.saving.set(false);
    }
  }
}

/** The server's reason, as it wrote it. */
function reason(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
  }
  return $localize`:@@settings.errorGeneric:The operation could not be completed.`;
}
