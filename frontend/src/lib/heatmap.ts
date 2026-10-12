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

export function getPreviewScale(viewportWidth: number, containerWidth: number) {
  if (
    !Number.isFinite(viewportWidth)
    || viewportWidth <= 0
    || !Number.isFinite(containerWidth)
    || containerWidth <= 0
  ) return 1;
  return Math.min(1, containerWidth / viewportWidth);
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

  const width = Math.max(point.documentWidth || 0, point.viewportWidth || 0);
  const height = Math.max(point.documentHeight || 0, point.viewportHeight || 0);
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

  if (clickX > width || clickY > height) return null;

  const x = (clickX / width) * 100;
  const y = (clickY / height) * 100;
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || x < 0
    || x > 100
    || y < 0
    || y > 100
  ) return null;

  return {
    left: `${x}%`,
    top: `${y}%`,
  };
}

export function validHeatmapClicks(points: HeatmapClick[]) {
  return points.filter((point) => getHeatmapPosition(point) !== null);
}
