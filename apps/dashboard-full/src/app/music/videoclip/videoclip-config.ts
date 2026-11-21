import { ProjectConfig, Scene, VideoclipPlan } from '../../core/api.models';

/** The negative prompt of every picture of a videoclip: text and logos are drawn badly. */
export const VIDEOCLIP_NEGATIVE = 'text, letters, words, watermark, logo, signature, blurry, low quality';

/** The resolution the pictures start from before the plan of Easy mode chooses its own: 16:9, as a video is. */
export const VIDEOCLIP_RESOLUTION = '1024x576';

/** The name the song takes in the sources of the videoclip: `song` and the extension of the exported file. */
export function songSourceName(audioFile: string): string {
  const ext = /\.[A-Za-z0-9]+$/.exec(audioFile)?.[0].toLowerCase() ?? '.mp3';
  return `song${ext}`;
}

/** Whether the tag of a lyrics section is the chorus (the same words the server uses to move its shots more). */
export function isChorusSection(tag: string): boolean {
  return /chorus|hook|estribillo|coro/i.test(tag);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A project id made of the song's: letters, digits and `._-`, at most 64. */
export function suggestVideoclipId(projectId: string, trackId: string): string {
  const raw = `${projectId}-${trackId}-clip`.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '');
  return (raw || 'videoclip').slice(0, 64);
}

/**
 * The video project of a plan before Easy mode gives it its models: one silent scene per shot (the song is the
 * soundtrack, so nothing is narrated), each with its camera movement, the look shared by every picture, a crossfade
 * between scenes and the song at full volume without ducking (there is no narration to duck for).
 */
export function videoclipConfig(plan: VideoclipPlan, id: string, voice: string, audioFile: string): ProjectConfig {
  const scenes: Scene[] = plan.shots.map((sh) => ({
    id: sh.id,
    prompt: sh.prompt,
    negative_prompt: '',
    tts_text: '',
    speed: 1,
    lora: '',
    silence_seconds: round2(sh.duration),
    motion: { type: sh.motion, intensity: sh.intensity },
  }));
  return {
    project: id,
    output: { mode: 'video', file: `out/${id}.mp4`, contact_sheet: false },
    defaults: {
      model: '',
      voice,
      resolution: VIDEOCLIP_RESOLUTION,
      sampler: 'euler',
      steps: 8,
      fps: 24,
      subject_prompt: plan.subject_prompt,
      negative_prompt: VIDEOCLIP_NEGATIVE,
      lora_model_dir: '',
      transition_seconds: plan.transition_seconds,
    },
    scenes,
    bgm: { file: audioFile, volume: 1, fade_seconds: 1, ducking: false },
  };
}
