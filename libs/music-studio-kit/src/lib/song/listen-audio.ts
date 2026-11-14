/** The seconds of a file that are listened to: the server takes up to 60 and at least 4, and 30 are enough to hear a style. */
export const LISTEN_SECONDS = 30;
/** The sample rate of the piece sent: speech and style do not need more, and it keeps the file near 1 MB. */
const RATE = 16000;
/** The biggest file the browser is asked to decode (it is read whole into memory). */
export const MAX_DECODE_BYTES = 200 * 1024 * 1024;
/** The biggest file the server takes as it is. */
export const MAX_RAW_BYTES = 10 * 1024 * 1024;

/** The piece of a file of `duration` seconds that is listened to: its middle, or all of it when it is short. */
export function listeningWindow(duration: number): { start: number; seconds: number } {
  if (duration <= LISTEN_SECONDS) return { start: 0, seconds: duration };
  return { start: (duration - LISTEN_SECONDS) / 2, seconds: LISTEN_SECONDS };
}

/** Mono 16 bit PCM samples written as a WAV file. Samples outside -1 to 1 are clipped. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const bytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  samples.forEach((x, i) => {
    const clipped = Math.max(-1, Math.min(1, x));
    view.setInt16(44 + i * 2, clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff), true);
  });
  return new Blob([view], { type: 'audio/wav' });
}

/**
 * The piece of an audio or video file the server listens to: the file is decoded by the browser (whatever it can read),
 * the middle 30 seconds are mixed to mono at 16 kHz and written as a WAV. A file the browser cannot decode is handed over
 * as it is when the server takes it (at most 10 MB), and refused with `Error('unreadable')` otherwise.
 */
export async function toListeningWav(file: File): Promise<Blob> {
  if (file.size <= MAX_DECODE_BYTES) {
    try {
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      void context.close();
      const { start, seconds } = listeningWindow(buffer.duration);
      const offline = new OfflineAudioContext(1, Math.max(1, Math.round(seconds * RATE)), RATE);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(0, start, seconds);
      const rendered = await offline.startRendering();
      return encodeWav(rendered.getChannelData(0), RATE);
    } catch {
      // not a file the browser can decode: the server may still read it as it is
    }
  }
  if (file.size <= MAX_RAW_BYTES) return file;
  throw new Error('unreadable');
}
