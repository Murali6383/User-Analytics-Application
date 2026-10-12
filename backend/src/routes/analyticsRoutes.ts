import { Router } from 'express';
import { getHeatmapController, getHealthController, getOverviewController, getPagesController } from '../controllers/analyticsController.js';

export const analyticsRoutes = Router();

analyticsRoutes.get('/overview', getOverviewController);
analyticsRoutes.get('/analytics/overview', getOverviewController);
analyticsRoutes.get('/pages', getPagesController);
analyticsRoutes.get('/heatmap', getHeatmapController);
analyticsRoutes.get('/health', getHealthController);
