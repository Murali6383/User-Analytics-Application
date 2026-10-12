import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  createEvent: vi.fn(),
  getHeatmap: vi.fn(),
  getOverview: vi.fn(),
  getPageAnalytics: vi.fn(),
  getSessionEvents: vi.fn(),
  getSessionSummaries: vi.fn(),
  getTrendData: vi.fn(),
}));

vi.mock('../src/services/eventService.js', () => services);

import { app } from '../src/app.js';

describe('analytics API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.getOverview.mockResolvedValue({
      totalSessions: 2,
      totalEvents: 4,
      pageViews: 2,
      clicks: 2,
      uniquePages: 2,
      clickThroughRate: null,
    });
    services.getTrendData.mockResolvedValue([
      { date: '2026-10-12', totalEvents: 4, pageViews: 2, clicks: 2 },
    ]);
    services.getSessionSummaries.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    services.getSessionEvents.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 40, total: 0, totalPages: 0 },
    });
    services.getHeatmap.mockResolvedValue({ data: [], total: 0 });
  });

  it('serves the dashboard overview at /api/analytics/overview', async () => {
    const response = await request(app)
      .get('/api/analytics/overview?websiteId=demo-store')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      totalSessions: 2,
      totalEvents: 4,
      pageViews: 2,
      clicks: 2,
      uniquePages: 2,
      clickThroughRate: null,
      trend: [{ date: '2026-10-12', totalEvents: 4, pageViews: 2, clicks: 2 }],
    });
    expect(services.getOverview).toHaveBeenCalledWith({
      websiteId: 'demo-store',
      from: undefined,
      to: undefined,
    });
    expect(services.createEvent).not.toHaveBeenCalled();
  });

  it('keeps the existing sessions and heatmap response contracts', async () => {
    const sessions = await request(app)
      .get('/api/sessions?websiteId=demo-store&page=1&limit=10')
      .expect(200);
    expect(sessions.body).toMatchObject({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const heatmap = await request(app)
      .get(`/api/heatmap?websiteId=demo-store&pageUrl=${encodeURIComponent('http://localhost:5173/store/products')}&limit=40`)
      .expect(200);
    expect(heatmap.body).toMatchObject({ success: true, data: [], total: 0 });
    expect(services.getHeatmap).toHaveBeenCalledWith(expect.objectContaining({
      websiteId: 'demo-store',
      pageUrl: 'http://localhost:5173/store/products',
      limit: 40,
    }));
    expect(services.createEvent).not.toHaveBeenCalled();
  });

  it('validates tracking payloads and acknowledges idempotent duplicate writes', async () => {
    await request(app)
      .post('/api/events')
      .send({ websiteId: 'demo-store', eventType: 'click' })
      .expect(400);
    expect(services.createEvent).not.toHaveBeenCalled();

    services.createEvent.mockRejectedValueOnce({ code: 11000 });
    const response = await request(app)
      .post('/api/events')
      .send({
        eventId: 'a7970193-765d-4876-9ee0-9cd81e9d02d1',
        websiteId: 'demo-store',
        sessionId: 'session-1',
        eventType: 'page_view',
        pageUrl: 'http://localhost:5173/store',
        timestamp: '2026-10-12T08:30:00.000Z',
      })
      .expect(200);

    expect(response.body).toMatchObject({ success: true, duplicate: true });
    expect(services.createEvent).toHaveBeenCalledTimes(1);
  });

  it('returns a 400 JSON error for invalid heatmap parameters', async () => {
    const response = await request(app)
      .get('/api/heatmap?websiteId=demo-store&pageUrl=not-a-url')
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid request');
  });

  it('requires viewport width and height to be supplied together for heatmap filtering', async () => {
    await request(app)
      .get(`/api/heatmap?websiteId=demo-store&pageUrl=${encodeURIComponent('http://localhost:5173/store')}&viewportWidth=1280`)
      .expect(400);
    expect(services.getHeatmap).not.toHaveBeenCalled();
  });

  it('validates and persists viewport-relative click metadata and scroll offsets', async () => {
    services.createEvent.mockResolvedValue({ eventId: 'event-click' });
    await request(app)
      .post('/api/events')
      .send({
        eventId: 'a7970193-765d-4876-9ee0-9cd81e9d02d1',
        websiteId: 'demo-store',
        sessionId: 'session-1',
        eventType: 'click',
        pageUrl: 'http://localhost:5173/store',
        timestamp: '2026-10-12T08:30:00.000Z',
        clickX: 50,
        clickY: 80,
        viewportWidth: 1280,
        viewportHeight: 720,
        documentWidth: 1280,
        documentHeight: 1440,
        scrollX: 0,
        scrollY: 60,
        devicePixelRatio: 2,
        coordinateMode: 'viewport',
      })
      .expect(201);

    expect(services.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      clickX: 50,
      clickY: 80,
      viewportWidth: 1280,
      documentWidth: 1280,
      scrollY: 60,
      coordinateMode: 'viewport',
    }));
  });

  it('rejects clicks outside the declared document dimensions', async () => {
    await request(app)
      .post('/api/events')
      .send({
        eventId: 'a7970193-765d-4876-9ee0-9cd81e9d02d1',
        websiteId: 'demo-store',
        sessionId: 'session-1',
        eventType: 'click',
        pageUrl: 'http://localhost:5173/store',
        timestamp: '2026-10-12T08:30:00.000Z',
        clickX: 500,
        clickY: 80,
        viewportWidth: 1280,
        viewportHeight: 720,
        documentWidth: 400,
        documentHeight: 1440,
        scrollX: 0,
        scrollY: 60,
        coordinateMode: 'document',
      })
      .expect(400);
    expect(services.createEvent).not.toHaveBeenCalled();
  });
});
