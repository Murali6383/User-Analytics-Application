import type { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  const err: any = new Error('Route not found');
  err.statusCode = 404;
  next(err);
}
