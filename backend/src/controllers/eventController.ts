import type { NextFunction, Request, Response } from 'express';
import { trackingEventSchema } from '../validation/schemas.js';
import { createEvent } from '../services/eventService.js';

export async function createEventController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = trackingEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event payload',
        details: parsed.error.issues,
      });
    }

    const event = await createEvent(parsed.data);
    return res.status(201).json({ success: true, data: event });
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 11000
      && typeof req.body === 'object'
      && req.body !== null
      && 'eventId' in req.body
    ) {
      return res.status(200).json({ success: true, duplicate: true });
    }
    return next(error);
  }
}
