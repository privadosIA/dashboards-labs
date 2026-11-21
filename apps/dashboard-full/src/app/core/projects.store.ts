import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProjectPatch, ProjectRestored, ProjectSummary } from './api.models';
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

  /** Changes a project's name, client or label by field, then reads the list again so every screen sees the new values. */
  async patch(id: string, body: ProjectPatch): Promise<ProjectSummary> {
    const project = await firstValueFrom(this.api.patchProject(id, body));
    await this.load();
    return project;
  }

  /** Restores a version of a project's definition, then reads the list again. */
  async restore(id: string, version: number): Promise<ProjectRestored> {
    const answer = await firstValueFrom(this.api.restoreProjectVersion(id, version));
    await this.load();
    return answer;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteProject(id));
    await this.load();
  }
}
