import type { NextFunction, Request, Response } from 'express';
import { getHeatmap, getOverview, getPageAnalytics, getTrendData } from '../services/eventService.js';
import { getDatabaseStatus } from '../config/db.js';
import { analyticsFilterSchema, heatmapQuerySchema } from '../validation/schemas.js';

export async function getOverviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const { websiteId, from, to } = analyticsFilterSchema.parse(req.query);

    const overview = await getOverview({ websiteId, from, to });
    const trend = await getTrendData({ websiteId, from, to });

    return res.json({ success: true, ...overview, trend });
  } catch (error) {
    return next(error);
  }
}

export async function getPagesController(req: Request, res: Response, next: NextFunction) {
  try {
    const { websiteId, from, to } = analyticsFilterSchema.parse(req.query);

    const pages = await getPageAnalytics({ websiteId, from, to });
    return res.json({ success: true, data: pages });
  } catch (error) {
    return next(error);
  }
}

export async function getHeatmapController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = heatmapQuerySchema.parse(req.query);
    const heatmap = await getHeatmap(query);
    return res.json({ success: true, ...heatmap });
  } catch (error) {
    return next(error);
  }
}

export async function getHealthController(_req: Request, res: Response) {
  return res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus(),
    environment: process.env.NODE_ENV || 'development',
  });
}
