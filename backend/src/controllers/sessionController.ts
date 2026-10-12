import type { Request, Response, NextFunction } from 'express';
import { queryPaginationSchema } from '../validation/schemas.js';
import {
  getSessionEvents,
  getSessionSummaries,
} from '../services/eventService.js';

export async function getSessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = queryPaginationSchema.parse({
      page: req.query.page,
      limit: req.query.limit,
      websiteId: req.query.websiteId,
      from: req.query.from,
      to: req.query.to,
    });

    const result = await getSessionSummaries({
      websiteId: query.websiteId,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getSessionEventsController(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const result = await getSessionEvents({
      sessionId: String(req.params.sessionId),
      websiteId: typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      page,
      limit,
    });

    if (!result.data.length) {
      return res.json({ success: true, data: [], pagination: result.pagination, emptyState: 'No events found for this session.' });
    }

    return res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    return next(error);
  }
}
