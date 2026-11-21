import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { ApiErrorBody, ProviderInfo, ROUTING_TASKS, RoutingResponse, RoutingTask } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { RoutingStore } from '../../core/routing.store';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { ProviderBadgeComponent } from '../../shared/provider-badge/provider-badge.component';
import { AvailabilityStore } from '../../core/availability.store';

/**
 * Which provider runs each task. A remote provider asks for an explicit acknowledgement that
 * the task's pictures, clips or texts leave this computer; the choice is saved only if the user
 * accepts. Providers without the model a task needs are disabled with the reason. The server
 * owns the rules, so its reason is shown as it wrote it.
 */
@Component({
  selector: 'app-tasks-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, ProviderBadgeComponent, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './tasks-card.component.html',
  styleUrl: './tasks-card.component.scss',
})
export class TasksCardComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly store = inject(RoutingStore);
  private readonly availability = inject(AvailabilityStore);

  /** Bumped by the page when the providers change, so the options are read again. */
  readonly version = input(0);

  protected readonly tasks = ROUTING_TASKS;
  protected readonly routing = signal<RoutingResponse | null>(null);
  protected readonly providers = signal<ProviderInfo[]>([]);
  protected readonly errors = signal<Partial<Record<RoutingTask, string>>>({});
  protected readonly saving = signal(false);
  protected readonly capError = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.version();
      untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    try {
      const [r, p] = await Promise.all([firstValueFrom(this.api.getRouting()), firstValueFrom(this.api.getProviders())]);
      this.routing.set(r);
      this.providers.set(p.providers);
      this.store.set(r);
    } catch {
      // nothing to route without the server; the screen above already says so
    }
  }

  protected label(task: RoutingTask): string {
    switch (task) {
      case 'assistant':
        return $localize`:@@tasks.assistant:Prompt assistant (picture, movement, song, videoclip)`;
      case 'describe_image':
        return $localize`:@@tasks.describeImage:Describe a picture`;
      case 'describe_video':
        return $localize`:@@tasks.describeVideo:Describe a clip`;
      case 'motion_graphics':
        return $localize`:@@tasks.motionGraphics:Motion graphics and overlays (writes the page)`;
      default:
        return $localize`:@@tasks.quality:Clip quality check`;
    }
  }

  protected sends(task: RoutingTask): string {
    switch (task) {
      case 'assistant':
      case 'motion_graphics':
        return $localize`:@@tasks.sendsTexts:the texts`;
      case 'quality':
        return $localize`:@@tasks.sendsFrames:frames of your clips`;
      default:
        return $localize`:@@tasks.sendsFiles:the pictures and clips`;
    }
  }

  /** The reason a provider cannot run the task, or '' when it can. Only OpenAI-compatible providers must declare the model. */
  protected unavailable(p: ProviderInfo, task: RoutingTask): string {
    if (p.builtin || p.type !== 'openai') return '';
    if (task === 'assistant' || task === 'motion_graphics') return p.text_model ? '' : $localize`:@@tasks.noText:no text model`;
    return p.vision_model ? '' : $localize`:@@tasks.noVision:no vision model`;
  }

  protected current(task: RoutingTask): string {
    return this.routing()?.routing[task]?.provider ?? 'ollama';
  }

  /**
   * Routes a task to a provider. `select` is the selector that was changed: when the choice is
   * not saved (the user cancelled the consent, or the server refused) it is put back where it was.
   */
  protected async choose(task: RoutingTask, id: string, select?: { value: unknown }): Promise<void> {
    this.errors.update((e) => ({ ...e, [task]: undefined }));
    const p = this.providers().find((x) => x.id === id);
    let acknowledge = false;
    if (p && !p.builtin && p.remote) {
      const ok = await firstValueFrom(
        openConfirm(this.dialog, {
          title: $localize`:@@tasks.consentTitle:Send data outside this computer`,
          message: $localize`:@@tasks.consentMessage:This task will send ${this.sends(task)}:what: to ${p.name}:name: (${p.base_url}:address:), which is not this computer. Use it only if you trust that provider.`,
          confirmLabel: $localize`:@@tasks.consentConfirm:Accept and use ${p.name}:name:`,
        }),
      );
      if (!ok) {
        await this.load();
        if (select) select.value = this.current(task); // put the selector back where it was
        return;
      }
      acknowledge = true;
    }
    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.api.putRouting({ routing: { [task]: id }, ...(acknowledge ? { acknowledge_remote: true } : {}) }));
      this.routing.set(res);
      this.store.set(res);
      await this.load();
      void this.availability.refresh();
    } catch (err) {
      this.errors.update((e) => ({ ...e, [task]: reason(err) }));
      await this.load();
      if (select) select.value = this.current(task);
    } finally {
      this.saving.set(false);
    }
  }

  protected async setCap(value: string): Promise<void> {
    const n = Number(value);
    this.capError.set(null);
    if (!Number.isInteger(n) || n < 1) {
      this.capError.set($localize`:@@tasks.capInvalid:The cap must be a whole number of 1 or more.`);
      return;
    }
    try {
      const res = await firstValueFrom(this.api.putRouting({ max_calls: n }));
      this.routing.set(res);
      this.store.set(res);
    } catch (err) {
      this.capError.set(reason(err));
    }
  }
}

/** The server's reason, as it wrote it. */
function reason(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
  }
  return $localize`:@@tasks.errorGeneric:The operation could not be completed.`;
}
