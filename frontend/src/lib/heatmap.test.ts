import { describe, expect, it } from 'vitest';
import { getHeatmapPosition, getPreviewScale, validHeatmapClicks } from './heatmap';

describe('heatmap coordinates', () => {
  it('maps document coordinates to percentages that scale with the preview', () => {
    expect(getHeatmapPosition({
      clickX: 600,
      clickY: 900,
      documentWidth: 1200,
      documentHeight: 1800,
    })).toEqual({ left: '50%', top: '50%' });
  });

  it('scales the captured viewport uniformly to fit without stretching', () => {
    expect(getPreviewScale(1440, 720)).toBe(0.5);
    expect(getPreviewScale(390, 720)).toBe(1);
    expect(getPreviewScale(0, 720)).toBe(1);
  });

  it('rejects coordinates that exceed the recorded document bounds', () => {
    expect(getHeatmapPosition({
      clickX: 1300,
      clickY: 900,
      documentWidth: 1200,
      documentHeight: 1800,
    })).toBeNull();
  });

  it('maps page coordinates that include scroll offset onto the full-page preview', () => {
    expect(getHeatmapPosition({
      clickX: 400,
      clickY: 1200,
      documentWidth: 800,
      documentHeight: 2400,
    })).toEqual({ left: '50%', top: '50%' });
  });

  it('uses the larger recorded viewport when the document is narrower than the viewport', () => {
    expect(getHeatmapPosition({
      clickX: 720,
      clickY: 450,
      documentWidth: 400,
      documentHeight: 500,
      viewportWidth: 1440,
      viewportHeight: 900,
    })).toEqual({ left: '50%', top: '50%' });
  });

  it('skips malformed or dimensionless click events', () => {
    expect(validHeatmapClicks([
      { clickX: 1, clickY: 2, documentWidth: 100, documentHeight: 100 },
      { clickX: Number.NaN, clickY: 2, documentWidth: 100, documentHeight: 100 },
      { clickX: 1, clickY: 2, documentWidth: 0, documentHeight: 100 },
    ])).toHaveLength(1);
  });
});
