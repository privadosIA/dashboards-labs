import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChildren } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ConditionEvaluatorService, DynamicFormComponent, ValidatorRegistryService } from '@core/dynamic-forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { SliderFieldComponent } from '../../shared/slider-field/slider-field.component';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { MotionCatalogStore } from '../../core/motion-catalog.store';
import { SceneMotionPartComponent } from './blocks/scene-motion-part/scene-motion-part.component';
import { ScenePictureModeComponent } from './blocks/scene-picture-mode/scene-picture-mode.component';
import { ScenePictureSourceComponent } from './blocks/scene-picture-source/scene-picture-source.component';
import { SceneInitComponent } from './blocks/scene-init/scene-init.component';
import { SceneQualityComponent } from './blocks/scene-quality/scene-quality.component';
import { ScenePicturesComponent } from './blocks/scene-pictures/scene-pictures.component';
import { SceneListenComponent } from './blocks/scene-listen/scene-listen.component';
import { ScenePreviewComponent } from './blocks/scene-preview/scene-preview.component';
import { AssistActionsComponent } from '../assist-actions/assist-actions.component';
import { DescribeReferenceComponent } from '../describe-reference/describe-reference.component';
import { DescribeProposal, DescribeStore } from '../describe-reference/describe.store';
import { ClipTrimComponent } from '../clip-trim/clip-trim.component';
import { MotionPageComponent } from '../motion-page/motion-page.component';
import { AvailabilityStore } from '../../core/availability.store';
import { ModelNoticeComponent } from '../../shared/model-notice/model-notice.component';
import { AssistantStore } from '../assistant.store';
import { EditorStore } from '../editor.store';
import { MOTION_TYPES } from '../scene-validators';
import { revalidate } from '../../shared/dynamic/revalidate';
import { FieldOverride, placeholdersOnly, withFieldOverrides } from '../../shared/dynamic/runtime-schema';
import { schemaFor } from '../../shared/dynamic/schema-loader';
import { SlotOutlet } from '../../shared/dynamic/slots/slot-outlet';
import { Segment, splitAtSlots } from '../../shared/dynamic/slots/split-schema';
import { SlotDirective } from '../../shared/dynamic/slots/slot.directive';
import formsEn from './dynamic/forms.en.json';
import formsEs from './dynamic/forms.es.json';
import { projectPlaceholders } from './dynamic/placeholders';
import { PictureMode, SceneContext, SceneFormModel, pictureModePatch, toFormModel, toScenePatch } from './dynamic/scene-model.adapter';
import { SceneOptionSources } from './dynamic/options.provider';
import { SCENE_VALIDATORS, sceneRuleState } from './dynamic/validations';

/**
 * Detail form for the selected scene. Motion and look are preset-only
 * controls (never raw filter expressions); narration is a tts/silencio
 * toggle enforcing the exclusivity rule; images mode hides narration and
 * motion/look and shows variants instead — hidden values are kept in the
 * model, never discarded.
 */
@Component({
  selector: 'app-scene-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DynamicFormComponent,
    NgTemplateOutlet,
    SlotDirective,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SliderFieldComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatTooltipModule,
    MatIconModule,
    ScenePreviewComponent,
    SceneQualityComponent,
    SceneInitComponent,
    ScenePictureModeComponent,
    SceneMotionPartComponent,
    ScenePictureSourceComponent,
    ScenePicturesComponent,
    SceneListenComponent,
    AssistActionsComponent,
    DescribeReferenceComponent,
    ClipTrimComponent,
    MotionPageComponent,
    ModelNoticeComponent,
  ],
  providers: [SlotOutlet, SceneOptionSources],
  templateUrl: './scene-form.component.html',
  styleUrl: './scene-form.component.scss',
})
export class SceneFormComponent {
  protected readonly store = inject(EditorStore);
  protected readonly env = inject(EnvironmentStore);
  protected readonly availability = inject(AvailabilityStore);
  private readonly motionCatalog = inject(MotionCatalogStore);

  private readonly assistant = inject(AssistantStore);
  private readonly describer = inject(DescribeStore);
  private readonly api = inject(ApiService);

  /** The model that writes motion-graphic pages can run now (false while unknown): the controls that ask for one are hidden otherwise. */
  protected readonly motionAvailable = computed(() => this.availability.available('motion_graphics'));
  /** The notice that says what is missing stands where the hidden controls would be. */
  protected readonly motionMissing = computed(() => this.availability.missingModel('motion_graphics') !== null);

  constructor() {
    // The parts a scene can be drawn by come from the server's catalog; one that has none simply does not offer the way.
    void this.motionCatalog.load();
    // What the schema cites by name exists only while the scene form does.
    inject(SceneOptionSources);
    const registry = inject(ValidatorRegistryService);
    SCENE_VALIDATORS.forEach((v) => registry.register(v));
    // The editor's own validation feeds the errors the schema's `sceneRule` validators show.
    effect(() => {
      sceneRuleState.errors = this.errors();
      // Checked again, and shown at once: the editor has always said what is wrong without waiting for a save.
      this.forms().forEach((f) => revalidate(f.form));
    });
    // The form follows the scene on screen. Handing it a new model does not rebuild the controls (they keep focus and caret).
    effect(() => {
      const scene = this.scene();
      const ctx = this.context();
      untracked(() => {
        if (!scene) return;
        const model = toFormModel(scene, ctx) as unknown as Record<string, unknown>;
        this.formModel.set(model);
        this.formInput.set(structuredClone(model));
      });
    });
    // A scene with its own picture needs the project's pictures to show them.
    effect(() => {
      const sc = this.scene();
      if ((sc?.image !== undefined || sc?.init_image !== undefined || sc?.clip !== undefined) && !this.store.sourcesLoaded()) {
        untracked(() => void this.store.loadSources());
      }
    });
    // A scene that starts from a picture offers to edit it, when an editing model is installed.
    effect(() => {
      if (this.scene()?.init_image !== undefined) untracked(() => void this.store.loadCatalog());
    });
    // A request in flight belongs to the scene it was asked from: leaving the
    // scene or the editor cancels it and drops its result.
    effect(() => {
      this.store.selected();
      untracked(() => {
        this.assistant.reset();
        this.describer.reset();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.assistant.reset();
      this.describer.reset();
    });
  }

  /** The animation as Wan made it (a run that kept tmp/): its first half is the forward part a trim counts in. */
  protected animationUrl(sceneId: string): string {
    return this.api.artifactUrl(this.store.projectId(), `tmp/scene_${sceneId}.anim.mp4`);
  }

  protected readonly motionTypes = MOTION_TYPES;

  protected readonly index = computed(() => this.store.selected());
  protected readonly scene = computed(() => this.store.config()?.scenes[this.index()]);
  protected readonly errors = computed(
    () => this.store.validation()?.scenes[this.index()] ?? {},
  );
  protected readonly videoMode = computed(() => this.store.config()?.output.mode !== 'images');
  protected readonly serverErrorHere = computed(() => {
    const err = this.store.serverError();
    return err && err.sceneId === this.scene()?.id ? err.message : null;
  });

  /** The scene uses a picture of its own instead of generating one. */
  protected readonly ownImage = computed(() => this.videoMode() && this.scene()?.image !== undefined);
  /** The scene uses a video of its own instead of generating and animating a picture. */
  protected readonly ownClip = computed(() => this.videoMode() && this.scene()?.clip !== undefined);
  /** The scene is an animated page, written by the model and drawn with Chrome, instead of a picture. */
  protected readonly motionScene = computed(() => this.videoMode() && this.scene()?.motion_graphic !== undefined && this.scene()?.motion_part === undefined);
  /** The scene is drawn by a part of the music-motion catalog (a part named `auto` also carries a description). */
  protected readonly partScene = computed(() => this.videoMode() && this.scene()?.motion_part !== undefined);
  /** The way is offered when the server has the catalog (or the scene already is drawn by a part). */
  protected readonly partAllowed = computed(() => this.motionCatalog.available() || this.partScene());
  /** The scene's picture is drawn from a prompt (neither its own picture, its own clip, a motion graphic nor a part). */
  protected readonly generated = computed(() => !this.ownImage() && !this.ownClip() && !this.motionScene() && !this.partScene());
  // --- the schema form ---------------------------------------------------------

  /** The schema of the language the page runs in, with what the project gives as placeholders. */
  private readonly placeholders = computed(() => projectPlaceholders(this.store.config()), {
    // Typing in the form changes the config on every key: only a change of what the project gives rebuilds the schema.
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  /** What depends on the engine the project animates with: AnimateDiff takes 8 to 32 frames, Wan any 4n+1. */
  private readonly engineLimits = computed<Record<string, FieldOverride>>(() => ({
    'animation.frames': { attributes: this.isAnimateDiff() ? { min: 8, max: 32 } : { min: 1 } },
  }));
  protected readonly schema = computed(() =>
    withFieldOverrides(schemaFor({ es: formsEs, en: formsEn }), { ...placeholdersOnly(this.placeholders()), ...mergeOverrides(this.placeholders(), this.engineLimits()) }),
  );

  /** The schema cut at its blocks: runs of fields drawn by the library, and the templates of what is not a field. */
  protected readonly segments = computed<Segment[]>(() => splitAtSlots(this.schema()));
  protected readonly slots = inject(SlotOutlet);
  private readonly conditions = inject(ConditionEvaluatorService);
  private readonly forms = viewChildren(DynamicFormComponent);

  /** Whether a block of the form is shown now (its `showWhen` / `hideWhen` read the context). */
  protected slotVisible(segment: Segment): boolean {
    if (segment.kind !== 'slot' || !segment.logic) return true;
    const model = this.formModel();
    const ctx = this.context();
    const { showWhen, hideWhen } = segment.logic;
    if (hideWhen && this.conditions.evaluate(hideWhen, model, undefined, ctx)) return false;
    return showWhen ? this.conditions.evaluate(showWhen, model, undefined, ctx) : true;
  }

  /** What decides which blocks of the form exist (the schema's conditions read it). */
  protected readonly context = computed<SceneContext>(() => ({
    video: this.videoMode(),
    images: !this.videoMode(),
    generated: this.generated(),
    autoPart: this.partScene() && this.scene()?.motion_part === 'auto',
    qualityOn: !this.ownClip() && !this.motionScene() && !this.partScene(),
    cameraOn: this.videoMode() && !this.ownClip() && !this.motionScene() && !this.partScene(),
    overlayBlock: this.videoMode() && (!!this.scene()?.overlay || this.motionAvailable() || this.motionMissing()),
    animateImagesNote: !this.videoMode() && !!this.scene()?.animate,
    animates: this.animates(),
    hasSpeakers: this.voiceSpeakers().length > 1,
    effectiveSpeaker: this.effectiveSpeaker(),
  }));

  /** What the form shows; it follows the scene on screen unless the change came from the form itself. */
  protected readonly formModel = signal<Record<string, unknown>>({});
  /** What the library gets: a copy, because it writes the user's edits into the object it is given (formModel stays what the scene said). */
  protected readonly formInput = signal<Record<string, unknown>>({});

  /** Controls that appear later (a section that opens) show their errors at once too. */
  protected onFormStatus(): void {
    this.forms().forEach((f) => f.form.markAllAsTouched());
  }

  /** The form changed: the editor's store takes the difference as the patch it always took. */
  protected onFormChange(model: unknown): void {
    const scene = this.scene();
    if (!scene) return;
    const patch = toScenePatch(scene, model as SceneFormModel, this.formModel() as unknown as SceneFormModel);
    if (Object.keys(patch).length === 0) return;
    this.patch(patch as Record<string, unknown>);
  }

  protected readonly pictureMode = computed<PictureMode>(() =>
    this.partScene() ? 'part' : this.motionScene() ? 'motion' : this.ownClip() ? 'clip' : this.ownImage() ? 'own' : 'ai',
  );

  /** Choosing how the scene's picture is made clears what the other modes would hold. */
  protected setPictureMode(mode: PictureMode): void {
    const scene = this.scene();
    if (scene) this.patch(pictureModePatch(scene, mode) as Record<string, unknown>);
  }

  /** Adds the scene's overlay (a title over its video) or removes it. */
  protected setOverlay(on: boolean): void {
    this.patch({ overlay: on ? { text: '' } : undefined });
  }

  /** The voice the scene is narrated with: its own, else the project's. */
  protected readonly effectiveVoice = computed(() => this.scene()?.voice || this.store.config()?.defaults.voice || '');

  /** The speakers of the voice the scene is narrated with, when that model holds several. */
  protected readonly voiceSpeakers = computed(
    () => this.env.voices().find((v) => `voices/${v.name}` === this.effectiveVoice())?.speakers ?? [],
  );
  /** The chosen speaker: the scene's own, else the project's for the project's voice, else the first. */
  protected readonly effectiveSpeaker = computed(() => {
    const s = this.scene();
    if (s?.speaker !== undefined) return s.speaker;
    return s?.voice ? 0 : (this.store.config()?.defaults.voice_speaker ?? 0);
  });

  protected readonly narrationMode = computed(() =>
    this.scene()?.silence_seconds != null ? 'silence' : 'tts',
  );

  // --- this scene's quality ----------------------------------------------------

  /** The scene animates, so its animation settings apply (Wan, or AnimateDiff when the project uses it). */
  protected readonly animates = computed(() => this.videoMode() && !!this.scene()?.animate);

  protected readonly isAnimateDiff = computed(() => this.store.config()?.defaults.animate?.engine === 'animatediff');

  protected patch(patch: Record<string, unknown>): void {
    this.store.updateScene(this.index(), patch);
  }

  protected setNarration(mode: string): void {
    if (mode === 'silence') {
      this.patch({ silence_seconds: 2.0, tts_text: '' });
    } else {
      this.patch({ silence_seconds: undefined });
    }
  }

  protected setMotionIntensity(value: number): void {
    const m = this.scene()?.motion;
    if (m) {
      this.patch({ motion: { ...m, intensity: value } });
    }
  }


  /** An empty motion prompt means "use the scene prompt" and is not written. */
  /** The prompt a reference was described as: it replaces the scene's prompt and records the model; a clip's movement goes to an animated scene. */
  protected applyDescription(p: DescribeProposal): void {
    if (p.shots) {
      // A split clip: one new scene per kept shot after this one; the scene itself is untouched.
      const model = describedBy(p);
      this.store.insertScenes(
        this.store.selected(),
        p.shots.map((sh) => ({ prompt: sh.prompt.trim(), motion: sh.motion, seconds: sh.end - sh.start, model })),
      );
      return;
    }
    const patch: Record<string, unknown> = { prompt: p.prompt, described_by: describedBy(p) };
    if (p.motion && this.animates()) patch['motion_prompt'] = p.motion;
    this.patch(patch);
  }

  protected setMotionPrompt(value: string): void {
    this.patch({ motion_prompt: value });
  }

  protected setGrain(value: number): void {
    const look = this.scene()?.look ?? { grain: 0, white_balance: 'neutral' };
    this.patch({ look: { ...look, grain: value } });
  }

  protected setWhiteBalance(wb: string): void {
    const look = this.scene()?.look ?? { grain: 0, white_balance: 'neutral' };
    this.patch({ look: { ...look, white_balance: wb } });
  }
}

/** What a scene records as the descriptor: the model alone for the built-in Ollama, `provider:model` for any other. */
function describedBy(p: DescribeProposal): string {
  return p.provider && p.provider !== 'ollama' ? `${p.provider}:${p.model}` : p.model;
}

/** The overrides of two sources for the same keys, merged (a key can take a placeholder and attributes). */
function mergeOverrides(placeholders: Record<string, string>, limits: Record<string, FieldOverride>): Record<string, FieldOverride> {
  const out: Record<string, FieldOverride> = {};
  for (const [k, v] of Object.entries(limits)) out[k] = { ...v, ...(placeholders[k] !== undefined ? { placeholder: placeholders[k] } : {}) };
  return out;
}
