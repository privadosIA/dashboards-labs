import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { EngineReason } from '../../core/api.models';
import { EnginesStore } from '../../core/engines.store';
import { PanelComponent } from '../../shared/panel/panel.component';

/**
 * LAION-CLAP, the optional service that hears the sound of an audio (it does not make music). It runs only as a .NET service: there is no Docker option for it, and
 * the card says so. It shows whether the service is up, starts and stops it, and says why it cannot start when the server says so.
 */
@Component({
  selector: 'app-clap-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatIconModule],
  templateUrl: './clap-card.component.html',
  styleUrl: './clap-card.component.scss',
})
export class ClapCardComponent implements OnInit {
  protected readonly engines = inject(EnginesStore);

  /** What the server says of the service; a server that does not list it has no card. */
  protected readonly entry = computed(() => this.engines.data()?.['clap'] ?? null);
  protected readonly state = computed(() => this.entry()?.container?.state ?? 'stopped');
  protected readonly running = computed(() => this.state() === 'running' || this.state() === 'starting');
  /** It can be started: it is installed and only stopped (or already up). */
  protected readonly canStart = computed(() => {
    const e = this.entry();
    return !!e && (e.available || e.reason === 'not_running');
  });
  /** Why it cannot start, when it is something other than being stopped. */
  protected readonly blocked = computed(() => {
    const e = this.entry();
    return e && !e.available && e.reason && e.reason !== 'not_running' ? e : null;
  });

  constructor() {
    // A service that is starting is read again until it is up.
    effect((onCleanup) => {
      if (this.state() !== 'starting') return;
      const timer = setInterval(() => void this.engines.refresh(), 2000);
      onCleanup(() => clearInterval(timer));
    });
  }

  ngOnInit(): void {
    void this.engines.refresh();
  }

  protected reasonText(reason: EngineReason, detail?: string): string {
    switch (reason) {
      case 'no_service':
        return $localize`:@@clap.noService:The .NET service is not installed: bash scripts/get-services.sh installs it.`;
      case 'no_weights':
        return $localize`:@@clap.noWeights:The weights of the model are not downloaded.`;
      case 'no_gpu':
        return $localize`:@@clap.noGpu:There is no GPU with free memory for it.`;
      default:
        return detail ?? reason;
    }
  }

  protected start(): Promise<void> {
    return this.engines.start('clap');
  }

  protected stop(): Promise<void> {
    return this.engines.stop('clap');
  }
}
