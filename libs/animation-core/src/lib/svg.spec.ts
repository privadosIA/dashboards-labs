import { hasSvgFeature } from './svg';

describe('hasSvgFeature', () => {
  it('reads the feature from the catalog', () => {
    expect(hasSvgFeature({ features: ['animate', 'layers', 'svg'] })).toBe(true);
    expect(hasSvgFeature({ features: ['animate', 'layers'] })).toBe(false);
    expect(hasSvgFeature({ features: [] })).toBe(false);
    expect(hasSvgFeature(null)).toBe(false);
    expect(hasSvgFeature(undefined)).toBe(false);
  });
});
