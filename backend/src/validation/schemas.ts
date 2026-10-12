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
    scrollX: z.number().finite().nonnegative().optional(),
    scrollY: z.number().finite().nonnegative().optional(),
    devicePixelRatio: z.number().finite().positive().optional(),
    coordinateMode: z.enum(['document']).optional(),
    pageTitle: z.string().trim().max(200).optional(),
    elementTag: z.string().trim().max(50).optional(),
    elementId: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.eventType === 'click') {
      if (value.clickX === undefined || value.clickY === undefined) {
        ctx.addIssue({ code: 'custom', path: ['clickX'], message: 'clickX and clickY are required for click events' });
      }
      if (!value.viewportWidth || !value.viewportHeight || !value.documentWidth || !value.documentHeight) {
        ctx.addIssue({ code: 'custom', path: ['viewportWidth'], message: 'Positive viewport and document dimensions are required for click events' });
      }
      if (value.scrollX === undefined || value.scrollY === undefined || !value.coordinateMode) {
        ctx.addIssue({ code: 'custom', path: ['coordinateMode'], message: 'Document coordinates and scroll offsets are required for click events' });
      }
      if (value.clickX !== undefined && value.documentWidth !== undefined && value.clickX > value.documentWidth) {
        ctx.addIssue({ code: 'custom', path: ['clickX'], message: 'clickX must be within documentWidth' });
      }
      if (value.clickY !== undefined && value.documentHeight !== undefined && value.clickY > value.documentHeight) {
        ctx.addIssue({ code: 'custom', path: ['clickY'], message: 'clickY must be within documentHeight' });
      }
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
  viewportWidth: z.coerce.number().int().positive().optional(),
  viewportHeight: z.coerce.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  validateDateRange(value, ctx);
  if ((value.viewportWidth === undefined) !== (value.viewportHeight === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['viewportWidth'],
      message: 'viewportWidth and viewportHeight must be provided together',
    });
  }
});
