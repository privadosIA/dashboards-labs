import { PreviewClock, quantise, type ClockAudio, type ClockScheduler } from './clock';

class Scheduler implements ClockScheduler {
  ms = 0;
  private next = 1;
  private cbs = new Map<number, () => void>();
  request(cb: () => void): number {
    const id = this.next++;
    this.cbs.set(id, cb);
    return id;
  }
  cancel(id: number): void {
    this.cbs.delete(id);
  }
  now(): number {
    return this.ms;
  }
  /** Moves time and runs the frame that was asked for. */
  frame(ms = 16): void {
    this.ms += ms;
    const run = [...this.cbs.values()];
    this.cbs.clear();
    run.forEach((cb) => cb());
  }
  get pending(): number {
    return this.cbs.size;
  }
}

class FakeAudio implements ClockAudio {
  currentTime = 0;
  paused = true;
  src = 'a.mp3?ticket=1';
  plays = 0;
  private listeners: (() => void)[] = [];
  play(): Promise<void> {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(_t: 'error', l: () => void): void {
    this.listeners.push(l);
  }
  removeEventListener(_t: 'error', l: () => void): void {
    this.listeners = this.listeners.filter((x) => x !== l);
  }
  fail(): void {
    this.listeners.slice().forEach((l) => l());
  }
}

const setup = (audio: FakeAudio | null = null, refresh?: () => Promise<string>) => {
  const scheduler = new Scheduler();
  const clock = new PreviewClock({ scheduler, refresh });
  clock.configure(20, 30, audio);
  return { clock, scheduler };
};

describe('PreviewClock', () => {
  it('follows the audio element on every frame while it plays', () => {
    const audio = new FakeAudio();
    const { clock, scheduler } = setup(audio);
    clock.seek(5);
    clock.play();
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(5);
    audio.currentTime = 5.4;
    scheduler.frame();
    expect(clock.time()).toBe(5.4);
    audio.currentTime = 6.1;
    scheduler.frame();
    expect(clock.time()).toBe(6.1);
    expect(clock.hasAudio()).toBe(true);
  });

  it('runs on its own clock without audio', () => {
    const { clock, scheduler } = setup();
    expect(clock.hasAudio()).toBe(false);
    clock.play();
    scheduler.frame(500);
    scheduler.frame(500);
    expect(clock.time()).toBeCloseTo(1, 6);
    clock.pause();
    scheduler.frame(500);
    expect(clock.time()).toBeCloseTo(1, 6);
    expect(scheduler.pending).toBe(0);
  });

  it('steps one frame of the piece\'s rate and pauses the audio there', () => {
    const audio = new FakeAudio();
    const { clock } = setup(audio);
    clock.seek(10);
    clock.play();
    clock.step(1);
    expect(clock.time()).toBeCloseTo(10.0333, 3);
    expect(clock.playing()).toBe(false);
    expect(audio.paused).toBe(true);
    expect(audio.currentTime).toBeCloseTo(10.0333, 3);
    clock.step(-1);
    expect(clock.time()).toBeCloseTo(10, 6);
  });

  it('never goes before 0 or past the end, and pauses at the end', () => {
    const { clock, scheduler } = setup();
    clock.seek(-3);
    expect(clock.time()).toBe(0);
    clock.seek(99);
    expect(clock.time()).toBe(20);
    clock.seek(19.9);
    clock.play();
    scheduler.frame(300);
    expect(clock.time()).toBe(20);
    expect(clock.playing()).toBe(false);
  });

  it('starts again from 0 when played at the end', () => {
    const { clock } = setup();
    clock.seek(20);
    clock.play();
    expect(clock.time()).toBe(0);
    expect(clock.playing()).toBe(true);
  });

  it('rounds the time it shows down to the frame grid when asked', () => {
    const { clock } = setup();
    clock.seek(1.05);
    expect(clock.shown()).toBe(1.05);
    clock.snapToFrames.set(true);
    expect(clock.shown()).toBeCloseTo(1.0333, 3);
    expect(quantise(2, 30)).toBe(2);
    expect(quantise(1.0999999, 30)).toBeCloseTo(1.0667, 3);
  });

  it('asks once for a new address when the audio fails, and goes on with it', async () => {
    const audio = new FakeAudio();
    const refresh = vi.fn().mockResolvedValue('a.mp3?ticket=2');
    const { clock } = setup(audio, refresh);
    clock.seek(3);
    clock.play();
    audio.fail();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe('a.mp3?ticket=2');
    expect(audio.currentTime).toBe(3);
    expect(clock.hasAudio()).toBe(true);
  });

  it('runs without audio when the second failure comes', async () => {
    const audio = new FakeAudio();
    const refresh = vi.fn().mockResolvedValue('a.mp3?ticket=2');
    const { clock } = setup(audio, refresh);
    audio.fail();
    await new Promise((r) => setTimeout(r, 0));
    audio.fail();
    await new Promise((r) => setTimeout(r, 0));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clock.hasAudio()).toBe(false);
  });
});
