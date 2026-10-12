export type HeatmapClick = {
  _id?: string;
  clickX?: number;
  clickY?: number;
  documentWidth?: number;
  documentHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  normalizedX?: number;
  normalizedY?: number;
};

export type HeatmapPosition = {
  left: string;
  top: string;
};

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function getHeatmapPosition(point: HeatmapClick): HeatmapPosition | null {
  const { clickX, clickY } = point;
  if (
    typeof clickX !== 'number'
    || !Number.isFinite(clickX)
    || clickX < 0
    || typeof clickY !== 'number'
    || !Number.isFinite(clickY)
    || clickY < 0
  ) {
    return null;
  }

  const width = point.documentWidth || point.viewportWidth;
  const height = point.documentHeight || point.viewportHeight;
  if (
    typeof width !== 'number'
    || !Number.isFinite(width)
    || width <= 0
    || typeof height !== 'number'
    || !Number.isFinite(height)
    || height <= 0
  ) {
    return null;
  }

  const x = typeof point.normalizedX === 'number' && Number.isFinite(point.normalizedX)
    ? point.normalizedX
    : (clickX / width) * 100;
  const y = typeof point.normalizedY === 'number' && Number.isFinite(point.normalizedY)
    ? point.normalizedY
    : (clickY / height) * 100;

  return {
    left: `${clampPercentage(x)}%`,
    top: `${clampPercentage(y)}%`,
  };
}

export function validHeatmapClicks(points: HeatmapClick[]) {
  return points.filter((point) => getHeatmapPosition(point) !== null);
}
