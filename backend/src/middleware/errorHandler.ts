import type { NextFunction, Request, Response } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Something went wrong';

  res.status(statusCode).json({
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'production' ? undefined : err.details || undefined,
  });
}
