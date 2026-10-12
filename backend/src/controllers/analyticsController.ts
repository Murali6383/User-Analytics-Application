import type { NextFunction, Request, Response } from 'express';
import { getHeatmap, getOverview, getPageAnalytics, getTrendData } from '../services/eventService.js';
import { getDatabaseStatus } from '../config/db.js';

export async function getOverviewController(_req: Request, res: Response, next: NextFunction) {
  try {
    const websiteId = typeof _req.query.websiteId === 'string' ? _req.query.websiteId : undefined;
    const from = typeof _req.query.from === 'string' ? _req.query.from : undefined;
    const to = typeof _req.query.to === 'string' ? _req.query.to : undefined;

    const overview = await getOverview({ websiteId, from, to });
    const trend = await getTrendData({ websiteId, from, to });

    return res.json({ success: true, ...overview, trend });
  } catch (error) {
    return next(error);
  }
}

export async function getPagesController(req: Request, res: Response, next: NextFunction) {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;

    const pages = await getPageAnalytics({ websiteId, from, to });
    return res.json({ success: true, data: pages });
  } catch (error) {
    return next(error);
  }
}

export async function getHeatmapController(req: Request, res: Response, next: NextFunction) {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const pageUrl = typeof req.query.pageUrl === 'string' ? req.query.pageUrl : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const limit = Number(req.query.limit || 200);

    if (!websiteId || !pageUrl) {
      return res.status(400).json({ success: false, error: 'websiteId and pageUrl are required.' });
    }

    const heatmap = await getHeatmap({ websiteId, pageUrl, from, to, limit });
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
