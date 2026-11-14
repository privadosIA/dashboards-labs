import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProjectSummary } from './api.models';
import { ApiService } from './api.service';
import { ModeFilterStore } from './mode-filter.store';

/**
 * Projects state: the server owns the truth; this caches the last listing
 * as signals and funnels every mutation through the API, reloading after
 * each one.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  private readonly api = inject(ApiService);
  private readonly modes = inject(ModeFilterStore);

  readonly projects = signal<ProjectSummary[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.api.listProjects());
      this.projects.set(list);
      this.modes.revealNew(list); // a project that was not there before adds its mode to what the user sees
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async create(id: string): Promise<void> {
    await firstValueFrom(this.api.createProject(id));
    await this.load();
  }

  async duplicate(id: string, newId: string): Promise<void> {
    await firstValueFrom(this.api.duplicateProject(id, newId));
    await this.load();
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteProject(id));
    await this.load();
  }
}
