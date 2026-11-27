import { Injectable, computed, inject, signal } from '@angular/core';

import { ProjectSummary } from './api.models';
import { EnvironmentStore } from './environment.store';

/** The output modes a project can have, in the order the selector lists them. */
export const PROJECT_MODES = ['video', 'images', 'music', 'models3d'] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

const STORAGE_KEY = 'mo.modes';
const ANIMATIONS_KEY = 'mo.animations';

/** The mode the server gives the runs of music-motion pieces (projects `api-mm-`, never listed); not a project mode. */
export const ANIMATION_MODE = 'animation' as const;
const ORIGINS_KEY = 'mo.origins';

/** Where a project was made: on the desktop (the editor, the command line) or on the phone page (Crear). */
export const PROJECT_ORIGINS = ['desktop', 'mobile'] as const;
export type ProjectOrigin = (typeof PROJECT_ORIGINS)[number];

/** The prefix of the projects the Crear page makes: they are the mobile ones, whichever device made them. */
export const MOBILE_PREFIX = 'mobile-';

/** The origin of a project, from its name. */
export function originOf(projectId: string): ProjectOrigin {
  return projectId.startsWith(MOBILE_PREFIX) ? 'mobile' : 'desktop';
}

const ALL_ORIGINS: ReadonlySet<ProjectOrigin> = new Set(PROJECT_ORIGINS);

/**
 * The projects of the chosen modes (and origins), plus those with no mode (an invalid YAML, say): they must stay reachable. An animation of the music mode has no
 * project mode (the server says `video` for it, but it is not a video project): it is listed when the Animation option is on, whatever the project modes chosen.
 */
export function visibleProjects(projects: readonly ProjectSummary[], chosen: ReadonlySet<ProjectMode>, origins: ReadonlySet<ProjectOrigin> = ALL_ORIGINS, animations = false): ProjectSummary[] {
  return projects.filter((p) => origins.has(originOf(p.id)) && (p.kind === 'music_motion' ? animations : p.mode === '' || chosen.has(p.mode)));
}

/** The runs of the chosen modes and origins: a run takes the mode of its project; one whose project is gone (no mode) always stays by mode. */
export function visibleRuns<R extends { project: string; mode?: string }>(runs: readonly R[], projects: readonly ProjectSummary[], chosen: ReadonlySet<ProjectMode>, origins: ReadonlySet<ProjectOrigin> = ALL_ORIGINS, animations = false): R[] {
  const modeOf = new Map(projects.map((p) => [p.id, p.mode]));
  return runs.filter((r) => {
    if (r.mode === ANIMATION_MODE) return animations;
    if (!origins.has(originOf(r.project))) return false;
    const m = modeOf.get(r.project);
    return !m || chosen.has(m);
  });
}

/** The modes that have runs and are not chosen, with how many each has (among the origins chosen). */
export function hiddenRunModes<R extends { project: string; mode?: string }>(runs: readonly R[], projects: readonly ProjectSummary[], chosen: ReadonlySet<ProjectMode>, origins: ReadonlySet<ProjectOrigin> = ALL_ORIGINS, animations = false): { mode: ProjectMode | typeof ANIMATION_MODE; count: number }[] {
  const modeOf = new Map(projects.map((p) => [p.id, p.mode]));
  const here = runs.filter((r) => origins.has(originOf(r.project)));
  const hidden: { mode: ProjectMode | typeof ANIMATION_MODE; count: number }[] = PROJECT_MODES.filter((m) => !chosen.has(m))
    .map((mode) => ({ mode, count: here.filter((r) => r.mode !== ANIMATION_MODE && modeOf.get(r.project) === mode).length }))
    .filter((h) => h.count > 0);
  const anim = animations ? 0 : here.filter((r) => r.mode === ANIMATION_MODE).length;
  if (anim > 0) hidden.push({ mode: ANIMATION_MODE, count: anim });
  return hidden;
}

/** The modes that have projects and are not chosen, with how many each has (among the origins chosen). */
export function hiddenModes(projects: readonly ProjectSummary[], chosen: ReadonlySet<ProjectMode>, origins: ReadonlySet<ProjectOrigin> = ALL_ORIGINS): { mode: ProjectMode; count: number }[] {
  const here = projects.filter((p) => origins.has(originOf(p.id)));
  return PROJECT_MODES.filter((m) => !chosen.has(m))
    .map((mode) => ({ mode, count: here.filter((p) => p.mode === mode && p.kind !== 'music_motion').length }))
    .filter((h) => h.count > 0);
}

/** How many animations are left out because the Animation option is off (among the origins chosen); 0 when it is on. */
export function hiddenAnimations(projects: readonly ProjectSummary[], animations: boolean, origins: ReadonlySet<ProjectOrigin> = ALL_ORIGINS): number {
  return animations ? 0 : projects.filter((p) => p.kind === 'music_motion' && origins.has(originOf(p.id))).length;
}

/**
 * The modes the user wants to see in the projects list and the gallery: one preference for both screens,
 * `video` by default, remembered in the browser. The browser may refuse to store it (private window,
 * blocked data): the default then applies and nothing is reported.
 */
@Injectable({ providedIn: 'root' })
export class ModeFilterStore {
  private readonly env = inject(EnvironmentStore);
  readonly modes = signal<ReadonlySet<ProjectMode>>(this.read());
  /** The modes a person can choose: 3D models only on a machine with Blender. */
  readonly offered = computed<readonly ProjectMode[]>(() => (this.env.blenderReady() ? PROJECT_MODES : PROJECT_MODES.filter((m) => m !== 'models3d')));
  /**
   * The modes the screens list. Without Blender the 3D models mode cannot be chosen, so what already exists of it is always listed
   * (read-only, with a note) instead of being lost from sight.
   */
  readonly active = computed<ReadonlySet<ProjectMode>>(() => (this.env.blenderReady() ? this.modes() : new Set<ProjectMode>([...this.modes(), 'models3d'])));
  /** Desktop and phone, both by default: the same preference for every screen that tells the modes apart. */
  readonly origins = signal<ReadonlySet<ProjectOrigin>>(this.readOrigins());
  /** Whether the animations are listed, in Runs and in the projects list (off by default; the gallery never has them). */
  readonly animations = signal<boolean>(this.readAnimations());
  private knownIds: Set<string> | null = null;

  private read(): ReadonlySet<ProjectMode> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = (JSON.parse(raw) as unknown[]).filter((m): m is ProjectMode => PROJECT_MODES.includes(m as ProjectMode));
        return new Set(list);
      }
    } catch {
      // no storage, or unreadable: the default
    }
    return new Set<ProjectMode>(['video']);
  }

  private readAnimations(): boolean {
    try {
      return localStorage.getItem(ANIMATIONS_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /** Lists (or not) the runs of animations. */
  setAnimations(on: boolean): void {
    this.animations.set(on);
    try {
      localStorage.setItem(ANIMATIONS_KEY, String(on));
    } catch {
      // not stored: it holds for this visit
    }
  }

  private readOrigins(): ReadonlySet<ProjectOrigin> {
    try {
      const raw = localStorage.getItem(ORIGINS_KEY);
      if (raw) {
        const list = (JSON.parse(raw) as unknown[]).filter((o): o is ProjectOrigin => PROJECT_ORIGINS.includes(o as ProjectOrigin));
        return new Set(list);
      }
    } catch {
      // no storage, or unreadable: the default
    }
    return new Set<ProjectOrigin>(PROJECT_ORIGINS);
  }

  /** Chooses these origins (and only these). */
  setOrigins(origins: readonly ProjectOrigin[]): void {
    const next = new Set(origins.filter((o) => PROJECT_ORIGINS.includes(o)));
    this.origins.set(next);
    try {
      localStorage.setItem(ORIGINS_KEY, JSON.stringify(PROJECT_ORIGINS.filter((o) => next.has(o))));
    } catch {
      // not stored: it holds for this visit
    }
  }

  /** Chooses these modes (and only these). */
  set(modes: readonly ProjectMode[]): void {
    const next = new Set(modes.filter((m) => PROJECT_MODES.includes(m)));
    this.modes.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(PROJECT_MODES.filter((m) => next.has(m))));
    } catch {
      // not stored: it holds for this visit
    }
  }

  /** Chooses one more mode, if it is a mode and not chosen yet. */
  add(mode: string): void {
    if (!PROJECT_MODES.includes(mode as ProjectMode) || this.modes().has(mode as ProjectMode)) return;
    this.set([...this.modes(), mode as ProjectMode]);
  }

  /** Shows every mode and both origins. */
  showAll(): void {
    this.set([...PROJECT_MODES]);
    this.setOrigins([...PROJECT_ORIGINS]);
    this.setAnimations(true);
  }

  /**
   * Called with every listing: a project that was not there before (created, imported, restored) adds its
   * mode to the choice, so what the user just made is not hidden. The first listing only records what exists.
   */
  revealNew(projects: readonly ProjectSummary[]): void {
    const ids = new Set(projects.map((p) => p.id));
    const before = this.knownIds;
    this.knownIds = ids;
    if (!before) return;
    for (const p of projects) {
      if (before.has(p.id)) continue;
      if (p.mode) this.add(p.mode);
      const origin = originOf(p.id);
      if (!this.origins().has(origin)) this.setOrigins([...this.origins(), origin]);
    }
  }
}
