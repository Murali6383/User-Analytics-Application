import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: err.issues,
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Something went wrong';

  if (statusCode >= 500) {
    console.error('InsightTrack request failed:', err);
  }

  return res.status(statusCode).json({
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'production' ? undefined : err.details || undefined,
  });
}
