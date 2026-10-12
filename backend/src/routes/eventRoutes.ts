import { Router } from 'express';
import { createEventController } from '../controllers/eventController.js';

export const eventRoutes = Router();

eventRoutes.post('/', createEventController);
