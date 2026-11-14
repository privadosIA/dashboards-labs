import { MixClip } from '../../core/api.models';
import { AudioPlayerService } from '../../core/audio-player.service';
import { LiveMix } from './live-mix';

class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  preload = '';
  volume = 1;
  currentTime = 0;
  duration = 30;
  paused = true;
  constructor() {
    FakeAudio.all.push(this);
  }
  addEventListener(): void {}
  removeAttribute(): void {}
  load(): void {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

describe('LiveMix', () => {
  let clips: MixClip[];
  let players: AudioPlayerService;
  let mix: LiveMix;
  let now: number;
  const files: Record<string, string> = { a: '/a.mp3', b: '/b.mp3', c: '/c.mp3' };

  /** Advances the clock by `seconds` and runs one frame. */
  const advance = (seconds: number) => {
    now += seconds * 1000;
    (mix as unknown as { loop(t: number): void }).loop(now);
  };
  const audioFor = (url: string) => FakeAudio.all.find((a) => a.src === url)!;

  beforeEach(() => {
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    FakeAudio.all = [];
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    clips = [{ track: 'a' }, { track: 'b', start: 10 }];
    players = new AudioPlayerService();
    mix = new LiveMix(
      () => clips,
      (c) => files[c.track ?? ''] ?? null,
      players,
    );
  });
  afterEach(() => {
    mix.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays each clip at its place: one from the start, another when its turn comes', () => {
    mix.play();
    advance(1);
    expect(audioFor('/a.mp3').paused).toBe(false);
    expect(audioFor('/b.mp3').paused).toBe(true); // starts at second 10
    advance(9.5); // second 10.5
    expect(audioFor('/b.mp3').paused).toBe(false);
    expect(audioFor('/b.mp3').currentTime).toBeCloseTo(0.5, 1);
    expect(mix.position()).toBeCloseTo(10.5, 1);
  });

  it('applies the trims: a clip plays from trim_start and is paused after trim_end', () => {
    clips = [{ track: 'a', trim_start: 5, trim_end: 8 }];
    mix.play();
    advance(1);
    expect(audioFor('/a.mp3').currentTime).toBeCloseTo(6, 1);
    advance(2.5); // past the 3 s used
    expect(audioFor('/a.mp3').paused).toBe(true);
  });

  it('a muted clip is neither heard nor loaded', () => {
    clips = [{ track: 'a', mute: true }, { track: 'b' }];
    mix.play();
    advance(1);
    expect(FakeAudio.all.map((a) => a.src)).toEqual(['/b.mp3']);
  });

  it('a clip whose track has no song yet is skipped', () => {
    clips = [{ track: 'zzz' }, { track: 'a' }];
    mix.play();
    advance(1);
    expect(FakeAudio.all.map((a) => a.src)).toEqual(['/a.mp3']);
    expect(mix.playing()).toBe(true);
  });

  it('scales every clip by the mix\'s master volume, as it is now', () => {
    let master = 0.5;
    mix.dispose();
    mix = new LiveMix(
      () => clips,
      (c) => files[c.track ?? ''] ?? null,
      players,
      () => master,
    );
    clips = [{ track: 'a', gain: 0.8 }];
    mix.play();
    expect(audioFor('/a.mp3').volume).toBeCloseTo(0.4);
    master = 1;
    advance(0.1);
    expect(audioFor('/a.mp3').volume).toBeCloseTo(0.8);
  });

  it('what is edited while it plays is heard at once: volume and fades', () => {
    mix.play();
    advance(1);
    expect(audioFor('/a.mp3').volume).toBe(1);
    clips = [{ track: 'a', gain: 0.5 }, clips[1]]; // the project changed
    advance(0.1);
    expect(audioFor('/a.mp3').volume).toBeCloseTo(0.5);
    clips = [{ track: 'a', fade_out: 10 }, clips[1]];
    audioFor('/a.mp3').currentTime = 25;
    advance(0.1); // 5 s from the end of a 10 s fade out
    expect(audioFor('/a.mp3').currentTime).toBeCloseTo(1.2, 0); // put back where the mix is, not at 25
  });

  it('a clip moved on the timeline while it plays follows', () => {
    mix.play();
    advance(2);
    clips = [{ track: 'a', start: 5 }, clips[1]]; // a now starts later than the playback position
    advance(0.1);
    expect(audioFor('/a.mp3').paused).toBe(true);
    advance(3.5);
    expect(audioFor('/a.mp3').paused).toBe(false);
  });

  it('pauses where it is and plays on from there', () => {
    mix.play();
    advance(3);
    mix.pause();
    expect(mix.playing()).toBe(false);
    expect(mix.position()).toBeCloseTo(3, 1);
    expect(audioFor('/a.mp3').paused).toBe(true);
    now += 5000; // time passes while paused
    mix.play();
    advance(1);
    expect(mix.position()).toBeCloseTo(4, 1);
  });

  it('stop forgets the position, and the end of the mix stops it', () => {
    mix.play();
    advance(2);
    mix.stop();
    expect(mix.position()).toBeNull();
    clips = [{ track: 'a', trim_end: 3 }];
    mix.play();
    advance(2);
    expect(mix.playing()).toBe(true);
    advance(2); // beyond the last clip
    expect(mix.playing()).toBe(false);
    expect(mix.position()).toBeNull();
  });

  it('seek moves the bar even when nothing plays, and playing starts from there', () => {
    mix.seek(12);
    expect(mix.position()).toBe(12);
    expect(mix.playing()).toBe(false);
    mix.play();
    advance(1);
    expect(mix.position()).toBeCloseTo(13, 1);
    expect(audioFor('/b.mp3').currentTime).toBeCloseTo(3, 1);
    mix.seek(2); // while playing
    advance(0.1);
    expect(audioFor('/b.mp3').paused).toBe(true);
    expect(audioFor('/a.mp3').currentTime).toBeCloseTo(2.1, 0);
  });

  it('gives its turn when another player starts, and takes it when it plays', () => {
    mix.play();
    const el = { pause: vi.fn() } as unknown as HTMLMediaElement;
    players.started(el); // another player starts
    expect(mix.playing()).toBe(false);
    mix.play();
    expect(mix.playing()).toBe(true);
    expect(el.pause).toHaveBeenCalledTimes(1); // the player that had the turn is paused when the mix takes it
  });
});
