import { validateEdit } from './validate';
import type { EditToolInfo, VideoEditRequest } from './model';

const file = { name: 'a.mp4', blob: new Blob(['x']) };
const image = { name: 'p.png', blob: new Blob(['x']) };
const tool = (over: Partial<EditToolInfo>): EditToolInfo => ({ id: 'scale', name: 'Scale', description: '', available: true, needsImage: false, acceptsMotion: false, notes: [], settings: [], ...over });
const TOOLS: EditToolInfo[] = [
  tool({ id: 'scale', settings: [{ name: 'factor', kind: 'choice', values: [2, 4] }] }),
  tool({ id: 'extend', name: 'Extend', settings: [{ name: 'seconds', kind: 'integer', min: 2, max: 10 }, { name: 'prompt', kind: 'string', required: true }] }),
  tool({ id: 'remove-background', name: 'Remove background', settings: [{ name: 'background', kind: 'color' }, { name: 'alpha', kind: 'boolean' }] }),
  tool({ id: 'depth', name: 'Depth', available: false, reason: 'not installed' }),
  tool({ id: 'motion-control', name: 'Motion Control', needsImage: true, acceptsMotion: true, settings: [{ name: 'strength', kind: 'number', min: 0.2, max: 1 }] }),
];
const request = (over: Partial<VideoEditRequest>): VideoEditRequest => ({ tool: 'scale', settings: {}, video: file, ...over });
const codes = (r: VideoEditRequest) => validateEdit(r, TOOLS).map((p) => p.code);

describe('validateEdit', () => {
  it('accepts a request with a video and settings inside the limits', () => {
    expect(codes(request({ settings: { factor: 2 } }))).toEqual([]);
    expect(codes(request({ tool: 'extend', settings: { seconds: 10, prompt: 'go on' } }))).toEqual([]);
    expect(codes(request({ tool: 'remove-background', settings: { background: '#00ff00', alpha: true } }))).toEqual([]);
  });

  it('refuses an unknown tool and one that is not available, with the reason', () => {
    expect(codes(request({ tool: 'interpolate' }))).toEqual(['tool']);
    const [problem] = validateEdit(request({ tool: 'depth' }), TOOLS);
    expect(problem).toMatchObject({ code: 'tool' });
    expect(problem.message).toContain('not installed');
  });

  it('refuses a setting outside its limits, naming it', () => {
    const [problem] = validateEdit(request({ tool: 'extend', settings: { seconds: 12, prompt: 'go on' } }), TOOLS);
    expect(problem).toMatchObject({ code: 'setting', setting: 'seconds' });
    expect(problem.message).toContain('2 to 10');
    expect(codes(request({ tool: 'extend', settings: { seconds: 2.5, prompt: 'go on' } }))).toEqual(['setting']);
    expect(codes(request({ settings: { factor: 3 } }))).toEqual(['setting']);
    expect(codes(request({ tool: 'remove-background', settings: { background: 'green' } }))).toEqual(['setting']);
    expect(codes(request({ settings: { speed: 1 } }))).toEqual(['setting']);
  });

  it('wants a video, or a motion for the tools that take one, never both', () => {
    expect(codes(request({ video: undefined }))).toEqual(['video-required']);
    expect(codes(request({ tool: 'motion-control', video: undefined, motion: 'm1', image }))).toEqual([]);
    expect(codes(request({ tool: 'motion-control', motion: 'm1', image }))).toEqual(['video-and-motion']);
    expect(codes(request({ video: undefined, motion: 'm1' }))).toEqual(['motion-not-accepted']);
  });

  it('wants the image exactly when the tool needs one', () => {
    expect(codes(request({ tool: 'motion-control' }))).toEqual(['image-required']);
    expect(codes(request({ image }))).toEqual(['image-surplus']);
  });

  it('wants the settings the server marks as required, not blank', () => {
    expect(codes(request({ tool: 'extend', settings: {} }))).toEqual(['setting']);
    expect(codes(request({ tool: 'extend', settings: { prompt: '  ' } }))).toEqual(['setting']);
    expect(codes(request({ tool: 'extend', settings: { prompt: 'the dog runs' } }))).toEqual([]);
  });
});
