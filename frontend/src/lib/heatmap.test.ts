import { describe, expect, it } from 'vitest';
import { getHeatmapPosition, validHeatmapClicks } from './heatmap';

describe('heatmap coordinates', () => {
  it('maps document coordinates to percentages that scale with the preview', () => {
    expect(getHeatmapPosition({
      clickX: 600,
      clickY: 900,
      documentWidth: 1200,
      documentHeight: 1800,
    })).toEqual({ left: '50%', top: '50%' });
  });

  it('uses normalized backend coordinates and keeps positions in bounds', () => {
    expect(getHeatmapPosition({
      clickX: 600,
      clickY: 900,
      documentWidth: 1200,
      documentHeight: 1800,
      normalizedX: 125,
      normalizedY: -10,
    })).toEqual({ left: '100%', top: '0%' });
  });

  it('skips malformed or dimensionless click events', () => {
    expect(validHeatmapClicks([
      { clickX: 1, clickY: 2, documentWidth: 100, documentHeight: 100 },
      { clickX: Number.NaN, clickY: 2, documentWidth: 100, documentHeight: 100 },
      { clickX: 1, clickY: 2, documentWidth: 0, documentHeight: 100 },
    ])).toHaveLength(1);
  });
});
