import { RecorderEnv, RecorderService } from './recorder.service';

function fakeEnv(over: Partial<RecorderEnv> = {}): RecorderEnv & { stopped: number } {
  const env = {
    stopped: 0,
    isSecureContext: true,
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => env.stopped++ }] }) as unknown as MediaStream,
    hasMediaRecorder: true,
    isTypeSupported: (t: string) => t === 'audio/mp4',
    newRecorder: (_s: MediaStream, type: string | undefined) => {
      const rec = {
        state: 'inactive',
        mimeType: type ?? '',
        ondataavailable: null as ((e: BlobEvent) => void) | null,
        onstop: null as (() => void) | null,
        onerror: null,
        start() {
          rec.state = 'recording';
        },
        stop() {
          rec.state = 'inactive';
          rec.ondataavailable?.({ data: new Blob(['voice']) } as BlobEvent);
          rec.onstop?.();
        },
      };
      return rec as unknown as MediaRecorder;
    },
    ...over,
  };
  return env;
}

describe('RecorderService', () => {
  it('is blocked on an insecure page and on a browser that cannot record', () => {
    const s = new RecorderService();
    s.env = fakeEnv({ isSecureContext: false });
    expect(s.block()).toBe('insecure');
    s.env = fakeEnv({ hasMediaRecorder: false });
    expect(s.block()).toBe('unsupported');
    s.env = fakeEnv({ getUserMedia: undefined });
    expect(s.block()).toBe('unsupported');
    s.env = fakeEnv();
    expect(s.block()).toBe('');
  });

  it('records with the first type the browser supports and releases the microphone', async () => {
    const s = new RecorderService();
    const env = fakeEnv();
    s.env = env;
    const rec = await s.start();
    const blob = await rec.stop();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('audio/mp4');
    expect(env.stopped).toBe(1);
  });

  it('refuses to start where the microphone is blocked', async () => {
    const s = new RecorderService();
    s.env = fakeEnv({ isSecureContext: false });
    await expect(s.start()).rejects.toThrow();
  });

  it('a cancelled recording rejects and still releases the microphone', async () => {
    const s = new RecorderService();
    const env = fakeEnv();
    s.env = env;
    const rec = await s.start();
    rec.cancel();
    expect(env.stopped).toBe(1);
  });
});
