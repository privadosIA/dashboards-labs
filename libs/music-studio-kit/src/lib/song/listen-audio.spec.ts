import { LISTEN_SECONDS, encodeWav, listeningWindow } from './listen-audio';

describe('listeningWindow', () => {
  it('is the middle 30 seconds of a longer piece', () => {
    expect(LISTEN_SECONDS).toBe(30);
    expect(listeningWindow(200)).toEqual({ start: 85, seconds: 30 });
  });

  it('is the whole piece when it is not longer than that', () => {
    expect(listeningWindow(12.5)).toEqual({ start: 0, seconds: 12.5 });
    expect(listeningWindow(30)).toEqual({ start: 0, seconds: 30 });
  });
});

describe('encodeWav', () => {
  const view = async (blob: Blob) => new DataView(await blob.arrayBuffer());
  const text = (v: DataView, at: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(at + i)));

  it('writes a mono 16 bit PCM file with the header of a WAV', async () => {
    const wav = await view(encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000));
    expect(text(wav, 0, 4)).toBe('RIFF');
    expect(text(wav, 8, 4)).toBe('WAVE');
    expect(wav.getUint16(20, true)).toBe(1); // PCM
    expect(wav.getUint16(22, true)).toBe(1); // mono
    expect(wav.getUint32(24, true)).toBe(16000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(text(wav, 36, 4)).toBe('data');
    expect(wav.getUint32(40, true)).toBe(8);
    expect(wav.byteLength).toBe(44 + 8);
  });

  it('scales the samples to 16 bits and clips what is out of range', async () => {
    const wav = await view(encodeWav(new Float32Array([0, 0.5, -0.5, 1, 3, -3]), 8000));
    const sample = (i: number) => wav.getInt16(44 + i * 2, true);
    expect([0, 1, 2, 3, 4, 5].map(sample)).toEqual([0, 16384, -16384, 32767, 32767, -32768]);
  });

  it('is a blob of type audio/wav', () => {
    expect(encodeWav(new Float32Array(4), 16000).type).toBe('audio/wav');
  });
});
