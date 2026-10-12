import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { apiRateLimiter, eventRateLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { analyticsRoutes } from './routes/analyticsRoutes.js';
import { eventRoutes } from './routes/eventRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', apiRateLimiter);

app.get('/api', (_req, res) => {
  res.json({ success: true, message: 'InsightTrack API ready' });
});

app.use('/api/events', eventRateLimiter, eventRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api', analyticsRoutes);

app.use(notFoundHandler);
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Malformed JSON payload.' });
  }
  return errorHandler(err, _req, res, _next);
});
