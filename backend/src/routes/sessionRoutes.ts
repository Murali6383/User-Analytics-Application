import { Router } from 'express';
import { getSessionEventsController, getSessionsController } from '../controllers/sessionController.js';

export const sessionRoutes = Router();

sessionRoutes.get('/', getSessionsController);
sessionRoutes.get('/:sessionId/events', getSessionEventsController);
