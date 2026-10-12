import { z } from 'zod';

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, 'pageUrl must be a valid absolute http(s) URL');

export const trackingEventSchema = z
  .object({
    eventId: z.string().uuid().optional(),
    websiteId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    eventType: z.enum(['page_view', 'click']),
    pageUrl: urlSchema,
    timestamp: z.string().datetime(),
    clickX: z.number().finite().nonnegative().optional(),
    clickY: z.number().finite().nonnegative().optional(),
    viewportWidth: z.number().finite().nonnegative().optional(),
    viewportHeight: z.number().finite().nonnegative().optional(),
    documentWidth: z.number().finite().nonnegative().optional(),
    documentHeight: z.number().finite().nonnegative().optional(),
    pageTitle: z.string().trim().max(200).optional(),
    elementTag: z.string().trim().max(50).optional(),
    elementId: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.eventType === 'click' && (value.clickX === undefined || value.clickY === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['clickX'], message: 'clickX is required for click events' });
      ctx.addIssue({ code: 'custom', path: ['clickY'], message: 'clickY is required for click events' });
    }
  });

const analyticsFilterObject = z.object({
  websiteId: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function validateDateRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
    if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be earlier than or equal to to' });
    }
}

export const analyticsFilterSchema = analyticsFilterObject.superRefine(validateDateRange);

export const queryPaginationSchema = analyticsFilterObject.extend({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  search: z.string().trim().max(128).optional(),
  sortBy: z.enum(['lastSeen', 'firstSeen', 'totalEvents', 'pageViews', 'clicks']).optional().default('lastSeen'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).superRefine(validateDateRange);

export const heatmapQuerySchema = analyticsFilterObject.extend({
  websiteId: z.string().trim().min(1),
  pageUrl: urlSchema,
  limit: z.coerce.number().int().min(1).max(200).optional().default(200),
}).superRefine(validateDateRange);
