import { Injectable, Injector, computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { DfOption } from '@core/dynamic-forms';

import { EnvironmentStore } from '../../../core/environment.store';
import { OptionSourceRegistry } from '../../../shared/dynamic/option-sources';
import { selectableVoices, speakerLabel } from '../../asset-options';
import { EditorStore } from '../../editor.store';

/** The endpoints a scene schema can ask for (`options: { source: "remote", endpoint }`). */
export const SCENE_OPTIONS = {
  voices: 'scene:voices',
  speakers: 'scene:speakers',
  loras: 'scene:loras',
} as const;

/**
 * Options that come from the machine, not from the file: the installed voices,
 * the speakers of the voice in use and the LoRAs. Each answer is a stream that
 * keeps following the inventory and the scene on screen, so a dropdown never
 * shows a stale list. A value the scene holds that is no longer installed stays
 * in the list, so choosing nothing else never rewrites it.
 */
@Injectable()
export class SceneOptionSources {
  private readonly env = inject(EnvironmentStore);
  private readonly store = inject(EditorStore);
  private readonly injector = inject(Injector);

  private readonly scene = computed(() => this.store.config()?.scenes[this.store.selected()]);

  private readonly voices = computed<DfOption[]>(() => {
    const names = selectableVoices(this.env.voices().map((v) => v.name)).map((n) => `voices/${n}`);
    const own = this.scene()?.voice;
    const all = own && !names.includes(own) ? [...names, own] : names;
    const installed = (v: string) => this.env.voices().some((x) => `voices/${x.name}` === v);
    return [
      { value: '', label: $localize`:@@scene.voiceDefault:The project's` },
      ...all.map((v) => ({ value: v, label: installed(v) ? v : `${v} ${$localize`:@@defaults.missing: ⚠ not on disk`}` })),
    ];
  });

  private readonly speakers = computed<DfOption[]>(() => {
    const voice = this.scene()?.voice || this.store.config()?.defaults.voice || '';
    const found = this.env.voices().find((v) => `voices/${v.name}` === voice)?.speakers ?? [];
    return found.map((sp) => ({ value: sp.id, label: speakerLabel(sp.name) }));
  });

  private readonly loras = computed<DfOption[]>(() => {
    const names = this.env.loras().map((l) => l.name);
    const current = this.scene()?.lora;
    const all = current && !names.includes(current) ? [current, ...names] : names;
    return [{ value: '', label: $localize`:@@scene.loraNone:— no LoRA —` }, ...all.map((n) => ({ value: n, label: n }))];
  });

  constructor() {
    const registry = inject(OptionSourceRegistry);
    registry.register(SCENE_OPTIONS.voices, () => toObservable(this.voices, { injector: this.injector }));
    registry.register(SCENE_OPTIONS.speakers, () => toObservable(this.speakers, { injector: this.injector }));
    registry.register(SCENE_OPTIONS.loras, () => toObservable(this.loras, { injector: this.injector }));
  }
}
