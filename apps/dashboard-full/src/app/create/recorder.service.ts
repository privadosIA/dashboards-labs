import { Injectable } from '@angular/core';

/** The longest a spoken request can be, in seconds: the server refuses more. */
export const MAX_RECORDING_SECONDS = 60;

/** The recording types a browser may offer, in the order this page prefers them. */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** Why the microphone cannot be used, or '' when it can be tried. */
export type MicrophoneBlock = '' | 'insecure' | 'unsupported';

/** The seam to the browser, replaced in tests. */
export interface RecorderEnv {
  isSecureContext: boolean;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  hasMediaRecorder: boolean;
  isTypeSupported: (t: string) => boolean;
  newRecorder: (stream: MediaStream, type: string | undefined) => MediaRecorder;
}

export function browserEnv(): RecorderEnv {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
    getUserMedia: md?.getUserMedia?.bind(md),
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    isTypeSupported: (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
    newRecorder: (stream, type) => new MediaRecorder(stream, type ? { mimeType: type } : undefined),
  };
}

/** A recording in progress. */
export interface Recording {
  /** Stops and resolves with the audio; rejects when nothing was recorded. */
  stop(): Promise<Blob>;
  /** Stops and throws the audio away. */
  cancel(): void;
}

/**
 * Records the microphone with MediaRecorder. The type is the first the browser supports (WebM/Opus on
 * Chrome and Android, MP4/AAC on Safari); the server reads either. The recording stops by itself after
 * MAX_RECORDING_SECONDS and `onLimit` says so.
 */
@Injectable({ providedIn: 'root' })
export class RecorderService {
  /** The browser, replaceable in tests. */
  env: RecorderEnv = browserEnv();

  /** Whether the microphone can be offered here, and why not. */
  block(): MicrophoneBlock {
    if (!this.env.isSecureContext) return 'insecure';
    if (!this.env.getUserMedia || !this.env.hasMediaRecorder) return 'unsupported';
    return '';
  }

  async start(onLimit: () => void = () => undefined): Promise<Recording> {
    if (this.block() !== '') throw new Error('microphone unavailable');
    const stream = await this.env.getUserMedia!({ audio: true });
    const type = TYPES.find((t) => this.env.isTypeSupported(t));
    const rec = this.env.newRecorder(stream, type);
    const chunks: Blob[] = [];
    let cancelled = false;
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearTimeout(timer);
        if (cancelled || chunks.length === 0) reject(new Error('nothing recorded'));
        else resolve(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }));
      };
      rec.onerror = () => reject(new Error('recording failed'));
    });
    const timer = window.setTimeout(() => {
      if (rec.state !== 'inactive') {
        rec.stop();
        onLimit();
      }
    }, MAX_RECORDING_SECONDS * 1000);
    rec.start();
    return {
      stop: () => {
        if (rec.state !== 'inactive') rec.stop();
        return finished;
      },
      cancel: () => {
        cancelled = true;
        if (rec.state !== 'inactive') rec.stop();
        finished.catch(() => undefined);
      },
    };
  }
}
