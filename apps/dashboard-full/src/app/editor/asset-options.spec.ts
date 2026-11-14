import { selectableVoices } from './asset-options';

describe('selectableVoices', () => {
  it('keeps the .onnx voices and drops their .onnx.json companions', () => {
    expect(
      selectableVoices(['a.onnx', 'a.onnx.json', 'b.ONNX', 'b.ONNX.json', 'notes.txt']),
    ).toEqual(['a.onnx', 'b.ONNX']);
  });

  it('returns an empty list when only companions are present', () => {
    expect(selectableVoices(['a.onnx.json'])).toEqual([]);
  });
});
