import { beforeEach, describe, expect, it, vi } from 'vitest';

const eventModel = vi.hoisted(() => ({
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/models/Event.js', () => ({ EventModel: eventModel }));

import { createEvent, getHeatmap, getOverview, getSessionEvents, getSessionSummaries } from '../src/services/eventService.js';

function queryChain(result: unknown) {
  const chain = {
    sort: vi.fn(() => chain),
    skip: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe('event analytics service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives metrics using distinct website/session and website/page keys', async () => {
    eventModel.aggregate.mockResolvedValueOnce([{
      metrics: { totalEvents: 5, pageViews: 3, clicks: 2 },
      totalSessions: 2,
      uniquePages: 2,
    }]);

    const overview = await getOverview({ websiteId: 'demo-store' });
    expect(overview).toMatchObject({
      totalEvents: 5,
      pageViews: 3,
      clicks: 2,
      totalSessions: 2,
      uniquePages: 2,
    });
    expect(overview.clickThroughRate).toBeCloseTo(200 / 3);
    const pipeline = eventModel.aggregate.mock.calls[0][0];
    expect(pipeline[1].$facet.sessions[0].$group._id).toEqual({
      websiteId: '$websiteId',
      sessionId: '$sessionId',
    });
    expect(pipeline[1].$facet.pages[0].$group._id).toEqual({
      websiteId: '$websiteId',
      pageUrl: '$pageUrl',
    });
  });

  it('applies inclusive UTC date boundaries to persisted analytics queries', async () => {
    eventModel.aggregate.mockResolvedValueOnce([]);
    const from = '2026-10-01T00:00:00.000Z';
    const to = '2026-10-07T23:59:59.999Z';

    await getOverview({ websiteId: 'demo-store', from, to });

    expect(eventModel.aggregate.mock.calls[0][0][0].$match).toEqual({
      websiteId: 'demo-store',
      timestamp: { $gte: new Date(from), $lte: new Date(to) },
    });
  });

  it('groups and sorts session summaries with bounded pagination and safe search', async () => {
    eventModel.aggregate
      .mockResolvedValueOnce([{ sessionId: 'session-1', totalEvents: 3 }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const result = await getSessionSummaries({
      websiteId: 'demo-store',
      page: 2,
      limit: 10,
      search: 'session.1',
      sortBy: 'totalEvents',
      sortOrder: 'asc',
    });

    expect(result.pagination).toMatchObject({ page: 2, limit: 10, total: 1, totalPages: 1 });
    const pipeline = eventModel.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.sessionId).toEqual({ $regex: 'session\\.1', $options: 'i' });
    expect(pipeline[1].$group.totalEvents).toEqual({ $sum: 1 });
    expect(pipeline[3].$sort).toEqual({ totalEvents: 1, sessionId: 1 });
    expect(pipeline[4].$skip).toBe(10);
    expect(pipeline[5].$limit).toBe(10);
    expect(eventModel.aggregate.mock.calls[1][0][1].$group._id).toEqual({
      websiteId: '$websiteId',
      sessionId: '$sessionId',
    });
  });

  it('returns session events in stable timestamp order', async () => {
    const chain = queryChain([{ _id: 'event-1' }, { _id: 'event-2' }]);
    eventModel.countDocuments.mockResolvedValue(2);
    eventModel.find.mockReturnValue(chain);

    const result = await getSessionEvents({
      websiteId: 'demo-store',
      sessionId: 'session-1',
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(2);
    expect(chain.sort).toHaveBeenCalledWith({ timestamp: 1, _id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('limits heatmaps to the exact selected page and click events, skipping invalid coordinates', async () => {
    eventModel.aggregate
      .mockResolvedValueOnce([{
        viewportBreakdown: [{ viewportWidth: 1440, viewportHeight: 900, clicks: 2, sessions: 1 }],
        invalidCoordinates: [{ count: 1 }],
      }])
      .mockResolvedValueOnce([{
        summary: [{ total: 2, sessions: 1 }],
        sessions: [{ count: 1 }],
        events: [{
        _id: 'click-1',
        eventType: 'click',
        pageUrl: 'https://shop.test/products/?variant=blue',
        clickX: 720,
        clickY: 450,
        viewportWidth: 1440,
        viewportHeight: 900,
        documentWidth: 1440,
        documentHeight: 900,
      }],
      }]);

    const result = await getHeatmap({
      websiteId: 'demo-store',
      pageUrl: 'https://shop.test/products?variant=blue',
      limit: 40,
    });

    expect(eventModel.aggregate.mock.calls[0][0][0].$match).toEqual({
      websiteId: 'demo-store',
      pageUrl: { $in: ['https://shop.test/products?variant=blue', 'https://shop.test/products/?variant=blue'] },
      eventType: 'click',
    });
    expect(eventModel.aggregate.mock.calls[1][0][0].$match).toMatchObject({
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(result.total).toBe(2);
    expect(result.sessions).toBe(1);
    expect(result.invalidCoordinates).toBe(1);
    expect(result.selectedViewport).toEqual({ viewportWidth: 1440, viewportHeight: 900 });
    expect(result.viewportBreakdown).toHaveLength(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ normalizedX: 50, normalizedY: 50 });
  });

  it('returns an empty point list when the selected page has no stored clicks', async () => {
    eventModel.aggregate.mockResolvedValueOnce([{
      viewportBreakdown: [],
      invalidCoordinates: [],
    }]);

    await expect(getHeatmap({
      websiteId: 'demo-store',
      pageUrl: 'https://shop.test/cart',
      limit: 40,
    })).resolves.toMatchObject({
      data: [],
      total: 0,
      sessions: 0,
      invalidCoordinates: 0,
      viewportBreakdown: [],
      selectedViewport: null,
    });
  });

  it('persists the event id with a canonical URL and parsed timestamp', async () => {
    const toObject = vi.fn().mockReturnValue({ eventId: 'event-1' });
    eventModel.create.mockResolvedValue({ toObject });
    const timestamp = '2026-10-12T08:30:00.000Z';

    await createEvent({
      eventId: 'event-1',
      websiteId: 'demo-store',
      sessionId: 'session-1',
      eventType: 'page_view',
      pageUrl: 'https://shop.test/products/?variant=blue&color=red#details',
      timestamp,
    });

    expect(eventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      pageUrl: 'https://shop.test/products?variant=blue&color=red',
      timestamp: new Date(timestamp),
    }));
    expect(toObject).toHaveBeenCalledOnce();
  });
});
