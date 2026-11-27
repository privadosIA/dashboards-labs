import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProjectKind, ProjectPatch, ProjectRestored, ProjectSummary } from './api.models';
import { ApiService, isManagedId } from './api.service';
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
  /**
   * What can be opened, run and shown as a project: the list without the animations of the music mode (`managed=all`). The server gives an animation a project
   * mode (`video`) although it has no project to open, so the gallery and the run launcher read this one; only the projects list shows the animations.
   */
  readonly workable = computed(() => this.projects().filter((p) => p.kind !== 'music_motion'));
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

  /**
   * Changes a project's name, client or label by field, then reads the list again so every screen sees the new values. An item of the generation API
   * (`api-gen-`, `api-edit-`, `api-vid-`, `api-m3d-`) takes its client label by the route of its kind and its name and adult label by the project one, so a change of
   * both is sent in two requests; the list is read again whatever was applied.
   */
  async patch(id: string, body: ProjectPatch, kind?: ProjectKind): Promise<ProjectSummary> {
    if (body.client === undefined || !isManagedId(id, kind)) {
      const project = await firstValueFrom(this.api.patchProject(id, body));
      await this.load();
      return project;
    }
    const { client, ...rest } = body;
    let applied = false;
    try {
      if (Object.keys(rest).length > 0) {
        await firstValueFrom(this.api.patchProject(id, rest));
        applied = true;
      }
      await firstValueFrom(this.api.setClient(id, client, kind));
      applied = true;
    } finally {
      if (applied) await this.load();
    }
    return this.projects().find((p) => p.id === id) ?? { id, name: id, mode: '', scene_count: 0, client: client ?? 'unknown' };
  }

  /** Restores a version of a project's definition, then reads the list again. */
  async restore(id: string, version: number): Promise<ProjectRestored> {
    const answer = await firstValueFrom(this.api.restoreProjectVersion(id, version));
    await this.load();
    return answer;
  }

  async remove(id: string, kind?: ProjectKind): Promise<void> {
    await firstValueFrom(this.api.deleteProject(id, kind));
    await this.load();
  }
}
