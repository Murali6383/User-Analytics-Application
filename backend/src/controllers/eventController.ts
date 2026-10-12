import type { NextFunction, Request, Response } from 'express';
import { trackingEventSchema } from '../validation/schemas.js';
import { createEvent } from '../services/eventService.js';

export async function createEventController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body;
    const parsed = trackingEventSchema.safeParse(payload);
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
    return next(error);
  }
}
