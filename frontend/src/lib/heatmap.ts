export type HeatmapClick = {
  _id?: string;
  clickX?: number;
  clickY?: number;
  documentWidth?: number;
  documentHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  scrollX?: number;
  scrollY?: number;
  coordinateMode?: 'document' | 'viewport';
  normalizedX?: number;
  normalizedY?: number;
};

export type HeatmapPosition = {
  left: string;
  top: string;
};

export type HeatmapDensityPoint = HeatmapPosition & {
  count: number;
  clickX: number;
  clickY: number;
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

  const documentWidth = typeof point.documentWidth === 'number' && Number.isFinite(point.documentWidth)
    ? point.documentWidth
    : 0;
  const documentHeight = typeof point.documentHeight === 'number' && Number.isFinite(point.documentHeight)
    ? point.documentHeight
    : 0;
  const viewportWidth = typeof point.viewportWidth === 'number' && Number.isFinite(point.viewportWidth)
    ? point.viewportWidth
    : 0;
  const viewportHeight = typeof point.viewportHeight === 'number' && Number.isFinite(point.viewportHeight)
    ? point.viewportHeight
    : 0;
  const width = Math.max(documentWidth, viewportWidth);
  const height = Math.max(documentHeight, viewportHeight);
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

  const isViewportPoint = point.coordinateMode === 'viewport';
  if (isViewportPoint && (
    viewportWidth <= 0
    || viewportHeight <= 0
    || clickX > viewportWidth
    || clickY > viewportHeight
    || (point.scrollX !== undefined && (!Number.isFinite(point.scrollX) || point.scrollX < 0))
    || (point.scrollY !== undefined && (!Number.isFinite(point.scrollY) || point.scrollY < 0))
  )) return null;
  const pageX = clickX + (isViewportPoint ? point.scrollX || 0 : 0);
  const pageY = clickY + (isViewportPoint ? point.scrollY || 0 : 0);
  if (pageX > width || pageY > height) return null;

  const x = (pageX / width) * 100;
  const y = (pageY / height) * 100;
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

export function buildHeatmapDensity(points: HeatmapClick[]): HeatmapDensityPoint[] {
  const density = new Map<string, HeatmapDensityPoint>();
  for (const point of points) {
    const position = getHeatmapPosition(point);
    if (!position || typeof point.clickX !== 'number' || typeof point.clickY !== 'number') continue;
    const key = `${position.left}:${position.top}`;
    const existing = density.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    density.set(key, {
      ...position,
      count: 1,
      clickX: point.clickX,
      clickY: point.clickY,
    });
  }
  return Array.from(density.values());
}

export function validHeatmapClicks(points: HeatmapClick[]) {
  return points.filter((point) => getHeatmapPosition(point) !== null);
}
