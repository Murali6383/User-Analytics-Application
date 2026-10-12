import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: err.issues,
    });
  }

  const databaseUnavailable = mongoose.connection.readyState !== 1
    && typeof err?.name === 'string'
    && (err.name.startsWith('Mongo') || err.name.startsWith('Mongoose'));
  const statusCode = databaseUnavailable ? 503 : err.statusCode || err.status || 500;
  const message = statusCode >= 500 ? 'Service temporarily unavailable' : err.message || 'Request failed';

  if (statusCode >= 500) {
    console.error('InsightTrack request failed:', err);
  }

  if (statusCode === 503) res.setHeader('Retry-After', '5');
  return res.status(statusCode).json({
    success: false,
    error: message,
    details: statusCode >= 500 ? undefined : err.details || undefined,
  });
}
